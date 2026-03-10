import { Context } from 'telegraf';
import { escapeMarkdownV2 } from '../utils';
import { prisma } from '../db';
import { Fixture, League } from '@prisma/client';
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

      // ── Step 2: DB fallback – find the NEXT fixture for this team (any league) ──
      let nextFixtureDb: Fixture | null = null;
      if (!fixtureDate) {
        // First: detect league from most recent fixture
      const teamRecentFixtures = await prisma.fixture.findMany({
        where: {
          OR: [
            { homeTeam: normalizedDisplay },
            { awayTeam: normalizedDisplay },
          ],
          date: { gt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) }, // last ~4 months
        },
        orderBy: { date: 'desc' },
        take: 1,
      });

      let detectedLeague: League | undefined;
      if (teamRecentFixtures.length > 0) {
        detectedLeague = teamRecentFixtures[0].league;
        console.log(`Detected league for ${normalizedDisplay}: ${detectedLeague}`);
      }

      // Now find NEXT fixture
      nextFixtureDb = await prisma.fixture.findFirst({
        where: {
          OR: [
            { homeTeam: normalizedDisplay },
            { awayTeam: normalizedDisplay },
          ],
          date: { gt: now },
          ...(detectedLeague ? { league: detectedLeague } : {}),
        },
        orderBy: { date: 'asc' },
      });

        if (nextFixtureDb) {
          home = nextFixtureDb.homeTeam;
          away = nextFixtureDb.awayTeam;
          fixtureDate = nextFixtureDb.date;
          console.log(`DB → Next: ${home} vs ${away} (${nextFixtureDb.league}) on ${fixtureDate?.toISOString()}`);
        }
      }

      if (!fixtureDate) {
        await ctx.reply(
          `No upcoming fixture found for "${displayName}" (tried API & DB).\n` +
          'Try exact/short name (e.g. "Man Utd") or check if fixtures are imported correctly.'
        );
        return;
      }

      const targetLeague = nextFixtureDb!.league;

      const leagueNames: Record<League, string> = {
        EPL: 'Premier League',
        BUNDESLIGA: 'Bundesliga',
        SERIE_A: 'Serie A',
        LALIGA: 'La Liga',
        LIGUE_1: 'Ligue 1',
      };

      const leagueDisplay = leagueNames[targetLeague] || targetLeague;

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

      // ── ADVANCED PREDICTION ENGINE (fixed scoping + balanced weights) ──
      const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

      const h2hFixtures = await prisma.fixture.findMany({
        where: {
          OR: [
            { homeTeam: { contains: home, mode: 'insensitive' }, awayTeam: { contains: away, mode: 'insensitive' } },
            { homeTeam: { contains: away, mode: 'insensitive' }, awayTeam: { contains: home, mode: 'insensitive' } },
          ],
          date: { gte: fiveYearsAgo, lt: fixtureDate },
          league: targetLeague,   // ← use the league from the fixture we found
        },
        orderBy: { date: 'desc' },
        take: 15,
      });

      const homeRecent = await prisma.fixture.findMany({
        where: {
          homeTeam: { equals: home, mode: 'insensitive' },
          date: { gte: fiveYearsAgo },
          league: targetLeague,
        },
        orderBy: { date: 'desc' },
        take: 10,
      });

      const awayRecent = await prisma.fixture.findMany({
        where: {
          awayTeam: { equals: away, mode: 'insensitive' },
          date: { gte: fiveYearsAgo },
          league: targetLeague,
        },
        orderBy: { date: 'desc' },
        take: 10,
      });

      // Declare totals here so they're visible for the whole block
      let totalCards = 0;
      let weightSum = 0;

      // H2H – stronger influence for historical context
      h2hFixtures.forEach((f, i) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) +
                      ((f.homeRedCards || 0) * 1.5) + ((f.awayRedCards || 0) * 1.5);
        const weight = 3.0 * (1 / (i + 1));  // balanced – H2H matters more than before
        totalCards += cards * weight;
        weightSum += weight;
      });

      // Recent form – still important but not overpowering
      homeRecent.forEach((f, i) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) +
                      ((f.homeRedCards || 0) * 1.5) + ((f.awayRedCards || 0) * 1.5);
        const weight = 3.0 * (1 / (i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      awayRecent.forEach((f, i) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) +
                      ((f.homeRedCards || 0) * 1.5) + ((f.awayRedCards || 0) * 1.5);
        const weight = 3.0 * (1 / (i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      let baseExpected = weightSum > 0 ? totalCards / weightSum : 4.0;
      console.log(`Base expected before modifiers: ${baseExpected.toFixed(2)}`);

      let finalExpected = baseExpected;

      // Referee (only if known)
      if (nextFixtureDb?.referee) {
        console.log(`Referee found: ${nextFixtureDb.referee}`);
        const refStats = await prisma.refereeStats.findUnique({
          where: { referee: nextFixtureDb.referee.trim() }
        });
        if (refStats && refStats.avgTotalCards > 0) {
          const refMod = refStats.avgTotalCards / 3.8;
          finalExpected *= refMod;
          console.log(`Referee modifier: ${refMod.toFixed(2)}`);
        }
      } else {
        console.log('No referee assigned → skipping ref bias');
      }

      // Derby (if defined)
      const derby = await prisma.derbyIntensity.findFirst({
        where: {
          OR: [
            { homeTeam: home.trim(), awayTeam: away.trim() },
            { homeTeam: away.trim(), awayTeam: home.trim() }
          ]
        }
      });
      if (derby) {
        finalExpected *= derby.intensity;
        console.log(`Derby intensity applied: ${derby.intensity}`);
      }

      // Soft global uplift (tune this instead of hard baseline)
      finalExpected *= 1.18;
      console.log(`Final expected after uplift: ${finalExpected.toFixed(2)}`);

      // Poisson using finalExpected
      const lambda = finalExpected;
      const poissonProb = (l: number, k: number) => (Math.pow(l, k) * Math.exp(-l)) / factorial(k);
      const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
      const pUnder25 = poissonProb(lambda, 0) + poissonProb(lambda, 1) + poissonProb(lambda, 2);
      const pOver25 = 1 - pUnder25;
      const pUnder35 = pUnder25 + poissonProb(lambda, 3);
      const pOver35 = 1 - pUnder35;
      const pUnder45 = pUnder35 + poissonProb(lambda, 4);
      const pOver45 = 1 - pUnder45;

      // Build text using finalExpected
      let predictionText = `📊 Basis of prediction:\n`;

      const h2hCount = h2hFixtures.length;
      let h2hAvg = '—';
      if (h2hCount > 0) {
        const h2hTotal = h2hFixtures.reduce((sum, f) => 
          sum + (f.homeYellowCards||0) + (f.awayYellowCards||0) + 
                ((f.homeRedCards||0)*1.5) + ((f.awayRedCards||0)*1.5), 0);
        h2hAvg = (h2hTotal / h2hCount).toFixed(1);
      }
      predictionText += `• H2H last ${h2hCount || '—'}: ${h2hAvg} weighted cards avg ${h2hCount < 4 ? '(small sample ⚠️)' : ''}\n`;

      const homeCount = homeRecent.length;
      let homeAvg = '—';
      if (homeCount > 0) {
        const homeTotal = homeRecent.reduce((sum, f) => 
          sum + (f.homeYellowCards||0) + (f.awayYellowCards||0) + 
                ((f.homeRedCards||0)*1.5) + ((f.awayRedCards||0)*1.5), 0);
        homeAvg = (homeTotal / homeCount).toFixed(1);
      }
      predictionText += `• ${home} last ${homeCount || '—'} home: ${homeAvg} cards avg\n`;

      const awayCount = awayRecent.length;
      let awayAvg = '—';
      if (awayCount > 0) {
        const awayTotal = awayRecent.reduce((sum, f) => 
          sum + (f.homeYellowCards||0) + (f.awayYellowCards||0) + 
                ((f.homeRedCards||0)*1.5) + ((f.awayRedCards||0)*1.5), 0);
        awayAvg = (awayTotal / awayCount).toFixed(1);
      }
      predictionText += `• ${away} last ${awayCount || '—'} away: ${awayAvg} cards avg\n\n`;

      predictionText += `🟨 Expected cards: ${finalExpected.toFixed(1)}\n\n`;

      predictionText += `💡 Recommended bets\n`;
      predictionText += `• Under 4.5 — ${(pUnder45 * 100).toFixed(0)}% ${pUnder45 > 0.70 ? '🔥 Likely' : pUnder45 > 0.55 ? '❄️ Lean' : '👀'}\n`;
      predictionText += `• Over 2.5 — ${(pOver25 * 100).toFixed(0)}% ${pOver25 > 0.70 ? '🔥 Strong' : pOver25 > 0.55 ? '📈 Lean' : '👀 Safe bet'}\n`;
      predictionText += `• Under 3.5 — ${(pUnder35 * 100).toFixed(0)}% ${pUnder35 > 0.60 ? '❄️' : ''}\n`;
      predictionText += `• Over 3.5 — ${(pOver35 * 100).toFixed(0)}% ${pOver35 > 0.60 ? '⚠️ Risky' : ''}`;

      const safePrediction = escapeMarkdownV2(predictionText);

      const footerRaw = "Stats from DB - more seasons = better predictions";
      const safeFooter = escapeMarkdownV2(footerRaw);

      const reply = 
        `🎯 *Card Booking Prediction* — ${safeDisplay}\n\n` +
        `🏟 ${safeOurTeam} vs ${safeOpponent}\n` +
        `📅 ${leagueDisplay} • ${safeDate}\n\n` +
        `${safePrediction}\n\n` +
        `📊 \\(${safeFooter}\\)`;

      console.log('Sending MarkdownV2:\n' + reply);

      await ctx.replyWithMarkdownV2(reply);

    } catch (err: any) {
      console.error('Predict error:', err);
      await ctx.reply('Error fetching prediction. Check logs.');
    }
  });
}