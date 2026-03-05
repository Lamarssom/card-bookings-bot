import { Context } from 'telegraf';
import { escapeMarkdownV2 } from '../utils';
import { prisma } from '../db';
import { Fixture } from '@prisma/client';
import path from 'path';

// Normalization (shared logic)
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
      console.log(`Normalized user input: "${normalizedDisplay}" from "${displayName}"`);

      const now = new Date();

      // ── Step 1: Try to get next fixture from API-Football ──
      let nextFixtureApi: any = null;
      let home = '';
      let away = '';
      let fixtureDate: Date | null = null;

      // ── Step 2: If API failed, fall back to DB search (old behavior) ──
      let nextFixtureDb: Fixture | null = null;
      if (!fixtureDate) {
        nextFixtureDb = await prisma.fixture.findFirst({
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

        if (nextFixtureDb) {
          home = nextFixtureDb.homeTeam;
          away = nextFixtureDb.awayTeam;
          fixtureDate = nextFixtureDb.date;
          console.log(`DB fallback → Next fixture: ${home} vs ${away} on ${fixtureDate.toISOString()}`);
        }
      }

      // ── If still no fixture (API + DB both failed) ──
      if (!fixtureDate) {
        await ctx.reply(
          `No upcoming fixture found for "${displayName}" (tried API & DB).\n` +
          'Try exact/short name (e.g. "Man Utd") or check if fixtures are imported correctly.'
        );
        return;
      }

      // Determine which team is "ours"
      const ourTeamRaw = home.toLowerCase().includes(normalizedDisplay.toLowerCase()) ? home : away;
      const ourTeam = ourTeamRaw;
      const opponent = home === ourTeam ? away : home;

      const fixtureDateStr = fixtureDate.toLocaleString('en-GB', {
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

      // ── IMPROVED MULTI-LINE PREDICTION ENGINE ──
      const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

      // 1. H2H (weighted)
      const h2hFixtures = await prisma.fixture.findMany({
        where: {
          OR: [
            { homeTeam: { contains: home, mode: 'insensitive' }, awayTeam: { contains: away, mode: 'insensitive' } },
            { homeTeam: { contains: away, mode: 'insensitive' }, awayTeam: { contains: home, mode: 'insensitive' } },
          ],
          date: { gte: fiveYearsAgo, lt: fixtureDate },
          leagueName: 'Premier League',
        },
        orderBy: { date: 'desc' },
        take: 12,
      });

      // 2. Home team recent home form
      const homeRecent = await prisma.fixture.findMany({
        where: { homeTeam: { contains: home, mode: 'insensitive' }, date: { gte: fiveYearsAgo }, leagueName: 'Premier League' },
        orderBy: { date: 'desc' },
        take: 10,
      });

      // 3. Away team recent away form
      const awayRecent = await prisma.fixture.findMany({
        where: { awayTeam: { contains: away, mode: 'insensitive' }, date: { gte: fiveYearsAgo }, leagueName: 'Premier League' },
        orderBy: { date: 'desc' },
        take: 10,
      });

      // Calculate weighted average (recent games = higher weight)
      let totalCards = 0;
      let weightSum = 0;

      // H2H (weight 3)
      h2hFixtures.forEach((f, i) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) + (f.homeRedCards || 0) + (f.awayRedCards || 0);
        const weight = 3 * (1 / (i + 1)); // more recent = higher weight
        totalCards += cards * weight;
        weightSum += weight;
      });

      // Home recent (weight 2)
      homeRecent.forEach((f, i) => {
        const cards = (f.homeYellowCards || 0) + (f.homeRedCards || 0);
        const weight = 2 * (1 / (i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      // Away recent (weight 2)
      awayRecent.forEach((f, i) => {
        const cards = (f.awayYellowCards || 0) + (f.awayRedCards || 0);
        const weight = 2 * (1 / (i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      const expectedCards = weightSum > 0 ? totalCards / weightSum : 4.0;

      // Simple Poisson probabilities for common lines
      const poissonProb = (lambda: number, k: number) => {
        return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
      };
      const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

      const pUnder25 = poissonProb(expectedCards, 0) + poissonProb(expectedCards, 1) + poissonProb(expectedCards, 2);
      const pOver25 = 1 - pUnder25;
      const pUnder35 = pUnder25 + poissonProb(expectedCards, 3);
      const pOver35 = 1 - pUnder35;
      const pUnder45 = pUnder35 + poissonProb(expectedCards, 4);
      const pOver45 = 1 - pUnder45;

      // Build rich prediction text
      let predictionText = `*Expected cards: ${expectedCards.toFixed(1)}*\n\n`;
      predictionText += `Recommended bets:\n`;
      predictionText += `• Under 4.5 (${(pUnder45 * 100).toFixed(0)}%) ${pUnder45 > 0.55 ? '❄️ Strong' : '📉 Likely'}\n`;
      predictionText += `• Over 2.5 (${(pOver25 * 100).toFixed(0)}%) ${pOver25 > 0.70 ? '🔥 Very likely' : '📈 Likely'}\n`;
      predictionText += `• Under 3.5 (${(pUnder35 * 100).toFixed(0)}%) ${pUnder35 > 0.52 ? '📉' : ''}\n`;
      predictionText += `• Over 3.5 (${(pOver35 * 100).toFixed(0)}%) ${pOver35 > 0.48 ? '📈' : ''}`;

      const safePrediction = escapeMarkdownV2(predictionText);

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