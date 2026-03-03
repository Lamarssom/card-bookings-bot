import { Context } from 'telegraf';
import { escapeMarkdownV2 } from '../utils';
import { prisma } from '../db';
import { Fixture } from '@prisma/client';
import path from 'path';

// Import normalization function (shared from import script)
const teamNameMap = JSON.parse(require('fs').readFileSync(path.join(__dirname, '../data/team-normalization.json'), 'utf-8'));

function normalizeTeamName(name: string): string {
  const trimmed = name.trim();
  return teamNameMap[trimmed] || trimmed;
}

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
      const normalizedDisplay = normalizeTeamName(displayName);
      const now = new Date();

      console.log(`Searching for team containing: "${normalizedDisplay}" (normalized from "${displayName}")`);

      const countCheck = await prisma.fixture.count({
        where: {
          OR: [
            { homeTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
            { awayTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
          ],
          leagueName: 'Premier League',
        },
      });
      console.log(`Total fixtures matching name (any date): ${countCheck}`);

      const futureCount = await prisma.fixture.count({
        where: {
          OR: [
            { homeTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
            { awayTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
          ],
          date: { gt: now },
          leagueName: 'Premier League',
        },
      });
      console.log(`Future fixtures matching name: ${futureCount}`);

      // Find next fixture using normalized name
      const nextFixture = await prisma.fixture.findFirst({
        where: {
          OR: [
            { homeTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
            { awayTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
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

      const ourTeamRaw = home.toLowerCase().includes(normalizedDisplay.toLowerCase()) ? home : away;
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

      // --- H2H Prediction (now from Fixture aggregates) ---
      const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

      const h2hFixtures = await prisma.fixture.findMany({
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
          date: { gte: fiveYearsAgo, lt: now },  // Past matches only
          leagueName: 'Premier League',
        },
      });

      const matchCount = h2hFixtures.length;
      const totalYellow = h2hFixtures.reduce((sum, f) => sum + (f.homeYellowCards || 0) + (f.awayYellowCards || 0), 0);
      const totalRed = h2hFixtures.reduce((sum, f) => sum + (f.homeRedCards || 0) + (f.awayRedCards || 0), 0);

      let predictionText = '\n\n*No historical card data yet for this matchup* — engine learning 📈';
      if (matchCount > 0) {
        const avgYellow = (totalYellow / matchCount).toFixed(1);
        const avgRed = (totalRed / matchCount).toFixed(1);
        const totalAvg = (parseFloat(avgYellow) + parseFloat(avgRed)).toFixed(1);
        predictionText = `\n\n*Prediction from last ${matchCount} H2H meetings:*\n` +
          `• Avg yellow cards: *${avgYellow}*\n` +
          `• Avg red cards: *${avgRed}*\n` +
          `• Total cards avg: *${totalAvg}* → ${parseFloat(totalAvg) > 4.5 ? 'OVER 4.5 likely 🔥' : 'UNDER 4.5 likely ❄️'}`;
      }

      let safePrediction = predictionText;

      const footerRaw = "Stats from your DB - more seasons = better predictions 🚀";
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