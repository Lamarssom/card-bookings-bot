import { Context } from 'telegraf';
import { escapeMarkdownV2 } from '../utils';
import { prisma } from '../db';          // ← Import the client
import { Fixture, Card } from '@prisma/client';

export default function registerPredict(bot: any) {
  bot.command('predict', async (ctx: Context) => {
    try {
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const args = messageText.split(' ').slice(1).join(' ').trim();

      if (!args) {
        await ctx.reply(
          'Please provide a team name.\n\nExamples:\n/predict Manchester United\n/predict Arsenal\n/predict Man Utd'
        );
        return;
      }

      await ctx.reply('🔍 Looking up next match and card prediction...');

      const displayName = args.trim();
      const now = new Date();

      // Find next fixture (Prisma version)
      const nextFixture = await prisma.fixture.findFirst({
        where: {
          OR: [
            { homeTeam: { contains: displayName, mode: 'insensitive' } },
            { awayTeam: { contains: displayName, mode: 'insensitive' } },
          ],
          date: { gt: now },
          leagueName: 'Premier League',
        },
        orderBy: { date: 'asc' },
      });

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for "${displayName}" in the database.\n` +
          'Try exact/short name (e.g. "Man Utd") or check if fixtures are imported correctly.'
        );
        return;
      }

      const home = nextFixture.homeTeam;
      const away = nextFixture.awayTeam;

      const ourTeamRaw = home.toLowerCase().includes(displayName.toLowerCase()) ? home : away;
      const ourTeam = ourTeamRaw;
      const opponent = home === ourTeam ? away : home;

      const fixtureDateStr = nextFixture.date.toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      console.log('Raw fixture date:', fixtureDateStr);

      // Escape dynamic parts
      const safeOurTeam = escapeMarkdownV2(ourTeam);
      const safeOpponent = escapeMarkdownV2(opponent);
      const safeDate = escapeMarkdownV2(fixtureDateStr);
      const safeDisplay = escapeMarkdownV2(displayName);

      console.log('Escaped date for MD:', safeDate);

      // --- H2H Prediction (aggregate cards) ---

      const h2hMatches = await prisma.card.groupBy({
        by: ['id'], // dummy to get count
        where: {
          OR: [
            {
              AND: [
                { homeTeam: { contains: home, mode: 'insensitive' } },
                { awayTeam: { contains: away, mode: 'insensitive' } },
              ],
            },
            {
              AND: [
                { homeTeam: { contains: away, mode: 'insensitive' } },
                { awayTeam: { contains: home, mode: 'insensitive' } },
              ],
            },
          ],
          date: {
            gte: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), // ~5 years
          },
        },
        _count: { id: true },
      });

      const count = h2hMatches.length; // number of matching cards

      // Fetch all matching cards and compute in JS

      const h2hCards = await prisma.card.findMany({
        where: {
          OR: [
            {
              AND: [
                { homeTeam: { contains: home, mode: 'insensitive' } },
                { awayTeam: { contains: away, mode: 'insensitive' } },
              ],
            },
            {
              AND: [
                { homeTeam: { contains: away, mode: 'insensitive' } },
                { awayTeam: { contains: home, mode: 'insensitive' } },
              ],
            },
          ],
          date: {
            gte: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
          },
        },
        select: { cardType: true },
      });

      const yellowCount = h2hCards.filter(c => c.cardType === 'YELLOW_CARD').length;
      const redCount = h2hCards.filter(c => c.cardType === 'RED_CARD').length;

      // Rough avg per match: assume ~2 cards per match if not grouped — improve later
      const matchesApprox = Math.max(1, Math.ceil((yellowCount + redCount) / 4)); // heuristic
      const avgYellow = (yellowCount / matchesApprox).toFixed(1);
      const avgRed = (redCount / matchesApprox).toFixed(1);

      let predictionText = '\n\n*No historical card data yet for this matchup* — engine learning 📈';
      if (count > 0) {
        const totalAvg = (parseFloat(avgYellow) + parseFloat(avgRed)).toFixed(1);
        predictionText = `\n\n*Prediction from historical data (${count} cards found):*\n` +
          `• Approx avg yellow cards: *${avgYellow}*\n` +
          `• Approx avg red cards: *${avgRed}*\n` +
          `• Total cards avg: *${totalAvg}* → ${parseFloat(totalAvg) > 4.5 ? 'OVER 4.5 likely 🔥' : 'UNDER 4.5 likely ❄️'}`;
      }

      let safePrediction = predictionText;
      
      const footerRaw = "Stats from your DB - more seaesons = better predicions 🚀"
      const safeFooter = escapeMarkdownV2(footerRaw);

      const reply = 
        `*Card Booking Prediction* – ${safeDisplay}\n\n` +
        `Next Fixture  \n` +
        `${safeOurTeam} vs ${safeOpponent}  \n` +
        `Premier League • ${safeDate}\n\n` +
        `${safePrediction}\n\n` +
        `\\(${safeFooter}\\)`;

      console.log('Sending MarkdownV2:\n' + reply);

      await ctx.replyWithMarkdownV2(reply);

    } catch (err: any) {
      console.error('Predict error:', err);
      await ctx.reply('Error fetching prediction. Check logs.');
    }
  });
}