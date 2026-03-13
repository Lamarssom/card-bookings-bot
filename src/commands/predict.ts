import { Context } from 'telegraf';
import { escapeMarkdownV2 } from '../utils';
import { prisma } from '../db';
import { Fixture, League } from '@prisma/client';
import path from 'path';

// Normalization (shared logic)
const teamNameMap = JSON.parse(require('fs').readFileSync(path.join(__dirname, '../data/team-normalization.json'), 'utf-8'));

function normalizeTeamName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return teamNameMap[trimmed] || trimmed;
}

export default function registerPredict(bot: any) {
  bot.command('predict', async (ctx: Context) => {
    try {
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const args = messageText.split(' ').slice(1).join(' ').trim();

      if (!args) {
        await ctx.reply(
          'Please provide a team name.\n\nExamples:\n/predict Manchester United\n/predict Chelsea vs Arsenal\n/predict Man Utd'
        );
        return;
      }

      await ctx.sendChatAction('typing');   // ← instant typing animation (UX win)

      // Support "Team vs Team" format
      let displayName = args.trim();
      let team2 = '';
      if (args.toLowerCase().includes(' vs ')) {
        const parts = args.split(/ vs /i);
        displayName = parts[0].trim();
        team2 = parts[1].trim();
      } else if (args.toLowerCase().includes(' v ')) {
        const parts = args.split(/ v /i);
        displayName = parts[0].trim();
        team2 = parts[1].trim();
      }

      const normalizedDisplay = normalizeTeamName(displayName);
      console.log(`Normalized: "${normalizedDisplay}" ${team2 ? `(vs ${team2})` : ''}`);

      const now = new Date();

      // ── Step 1: Try to get next fixture from API-Football ──
      let nextFixtureApi: any = null;
      let home = '';
      let away = '';
      let fixtureDate: Date | null = null;

      // ── Step 2: DB fallback – support single team OR "Team vs Team" ──
      let nextFixtureDb: Fixture | null = null;

      if (team2) {
        const normalizedTeam2 = normalizeTeamName(team2);
        nextFixtureDb = await prisma.fixture.findFirst({
          where: {
            OR: [
              { homeTeam: { contains: normalizedDisplay, mode: 'insensitive' }, awayTeam: { contains: normalizedTeam2, mode: 'insensitive' } },
              { homeTeam: { contains: normalizedTeam2, mode: 'insensitive' }, awayTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
            ],
            date: { gt: now },
          },
          orderBy: { date: 'asc' },
        });
      } else {
        // original single-team logic
        const teamRecentFixtures = await prisma.fixture.findMany({
          where: {
            OR: [
              { homeTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
              { awayTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
            ],
            date: { gt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { date: 'desc' },
          take: 1,
        });

        let detectedLeague: League | undefined;
        if (teamRecentFixtures.length > 0) {
          detectedLeague = teamRecentFixtures[0].league;
          console.log(`Detected league for ${normalizedDisplay}: ${detectedLeague}`);
        }

        nextFixtureDb = await prisma.fixture.findFirst({
          where: {
            OR: [
              { homeTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
              { awayTeam: { contains: normalizedDisplay, mode: 'insensitive' } },
            ],
            date: { gt: now },
            ...(detectedLeague ? { league: detectedLeague } : {}),
          },
          orderBy: { date: 'asc' },
        });
      }

      if (nextFixtureDb) {
        home = nextFixtureDb.homeTeam;
        away = nextFixtureDb.awayTeam;
        fixtureDate = nextFixtureDb.date;
        console.log(`DB → Next: ${home} vs ${away} (${nextFixtureDb.league}) on ${fixtureDate?.toISOString()}`);
      }

      if (!fixtureDate) {
        await ctx.reply(
          `No upcoming fixture found for "${displayName}" (tried API & DB).\n\n` +
          'Tips:\n' +
          '- Try capitalizing: e.g. "Juventus" instead of "juventus"\n' +
          '- Use common/short name: "Man United", "Man City", "Aston Villa"\n' +
          '- Check if fixtures are up-to-date in DB.'
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

      // === IMPROVEMENT 1: League average baselines (added here) ===
      const leagueAverages: Record<League, number> = {
        EPL: 4.2,
        BUNDESLIGA: 4.5,
        SERIE_A: 4.3,
        LALIGA: 4.7,
        LIGUE_1: 4.1,
      };
      const leagueAvg = leagueAverages[targetLeague] || 4.3;

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

      // Escape dynamic parts
      const safeOurTeam = escapeMarkdownV2(ourTeam);
      const safeOpponent = escapeMarkdownV2(opponent);
      const safeDate = escapeMarkdownV2(fixtureDateStr);
      const safeDisplay = escapeMarkdownV2(displayName);

      // ── ADVANCED PREDICTION ENGINE ──
      const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

      const h2hFixtures = await prisma.fixture.findMany({
        where: {
          OR: [
            { homeTeam: { contains: home, mode: 'insensitive' }, awayTeam: { contains: away, mode: 'insensitive' } },
            { homeTeam: { contains: away, mode: 'insensitive' }, awayTeam: { contains: home, mode: 'insensitive' } },
          ],
          date: { gte: fiveYearsAgo, lt: fixtureDate },
          league: targetLeague,
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

      let totalCards = 0;
      let weightSum = 0;

      // H2H
      h2hFixtures.forEach((f: Fixture, i: number) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) +
                      ((f.homeRedCards || 0) * 1.5) + ((f.awayRedCards || 0) * 1.5);
        // === IMPROVEMENT 2: Smoother weight decay (was 3.0) ===
        const weight = 2.0 * (1 / Math.sqrt(i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      // Home recent
      homeRecent.forEach((f: Fixture, i: number) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) +
                      ((f.homeRedCards || 0) * 1.5) + ((f.awayRedCards || 0) * 1.5);
        const weight = 2.0 * (1 / Math.sqrt(i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      // Away recent
      awayRecent.forEach((f: Fixture, i: number) => {
        const cards = (f.homeYellowCards || 0) + (f.awayYellowCards || 0) +
                      ((f.homeRedCards || 0) * 1.5) + ((f.awayRedCards || 0) * 1.5);
        const weight = 2.0 * (1 / Math.sqrt(i + 1));
        totalCards += cards * weight;
        weightSum += weight;
      });

      let baseExpected = weightSum > 0 ? totalCards / weightSum : 4.0;
      console.log(`Base expected before modifiers: ${baseExpected.toFixed(2)}`);

      // === IMPROVEMENT 3: Blend with real league average + floor ===
      let finalExpected = (baseExpected * 0.7) + (leagueAvg * 0.3);
      finalExpected = Math.max(finalExpected, leagueAvg * 0.75); // never too low

      // Referee
      if (nextFixtureDb?.referee) {
        console.log(`Referee found: ${nextFixtureDb.referee}`);
        const refStats = await prisma.refereeStats.findUnique({
          where: { referee: nextFixtureDb.referee.trim() }
        });
        if (refStats && refStats.avgTotalCards > 0) {
          // === IMPROVEMENT 4: Dynamic referee scaling (was hardcoded 3.8) ===
          const refMod = refStats.avgTotalCards / leagueAvg;
          finalExpected *= refMod;
          console.log(`Referee modifier: ${refMod.toFixed(2)}`);
        }
      } else {
        console.log('No referee assigned → skipping ref bias');
      }

      // Derby
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

      // === IMPROVEMENT 5: Team Aggression (using your existing DB table!) ===
      const homeAgg = await prisma.teamAggression.findUnique({
        where: { team: home.trim() }
      });
      const awayAgg = await prisma.teamAggression.findUnique({
        where: { team: away.trim() }
      });
      if (homeAgg && awayAgg) {
        const aggMod = (homeAgg.aggressionIndex + awayAgg.aggressionIndex) / 2;
        finalExpected *= aggMod;
        console.log(`Team aggression modifier: ${aggMod.toFixed(2)}`);
      }

      // === IMPROVEMENT 6: Much softer global uplift (was 1.18) ===
      finalExpected *= 1.05;
      console.log(`Final expected after all modifiers: ${finalExpected.toFixed(2)}`);

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

      await ctx.replyWithMarkdownV2(reply, {
        reply_markup: {
          inline_keyboard: [[{ text: '🔄 Refresh Prediction', callback_data: `refresh_${nextFixtureDb?.id ?? 'unkown'}` }]]
        }
      });

    } catch (err: any) {
      console.error('Predict error:', err.stack || err);
      await ctx.reply('⚠️ Something went wrong while generating prediction. Try again or contact admin.');
    }
  });
}