// src/commands/predict.ts
import { Context } from 'telegraf';
import { findTeamByName } from '../services/teamLookup';
import { escapeMarkdownV2 } from '../utils';
import { getTeamIdApiFootball, getNextFixtureApiFootball } from '../services/apiFootballFixtures';  // ← new import

export default function registerPredict(bot: any) {
  bot.command('predict', async (ctx: Context) => {
    try {
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const args = messageText.split(' ').slice(1).join(' ').trim();

      if (!args) {
        await ctx.reply(
          'Please provide a team name.\n\n' +
          'Examples:\n' +
          '/predict Manchester United\n' +
          '/predict Arsenal\n' +
          '/predict Man City vs Liverpool'
        );
        return;
      }

      await ctx.reply('🔍 Looking up team and next match...');

      let displayName = args;
      let searchName = args;

      // Optional: try to improve name from DB (but no longer required for ID)
      const teamInfo = await findTeamByName(args);
      if (teamInfo) {
        displayName = teamInfo.name;
        searchName = teamInfo.name;
      }

      // 1. Get team ID from API-Football
      let teamId: number | null = await getTeamIdApiFootball(searchName);

      // Fallback to raw input if needed
      if (!teamId) {
        teamId = await getTeamIdApiFootball(args);
      }

      if (!teamId) {
        await ctx.reply(
          `Could not find "${args}" in API-Football.\n` +
          'Try exact spelling (e.g. "Man United", "Barcelona", "Man City").'
        );
        return;
      }

      // 2. Get next fixture using API-Football
      const nextFixture = await getNextFixtureApiFootball(teamId);

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for ${escapeMarkdownV2(displayName)} in the next 60 days.\n` +
          '(Free tier limitation or off-season)'
        );
        return;
      }

      // 3. Extract data safely
      const homeTeam = nextFixture.teams.home.name;
      const awayTeam = nextFixture.teams.away.name;
      const leagueName = nextFixture.league.name || 'Unknown League';

      // Determine which is our team
      const isHome = homeTeam.toLowerCase().includes(displayName.toLowerCase());
      const opponent = isHome ? awayTeam : homeTeam;

      // Format date nicely (no weird escapes needed)
      let fixtureDateStr = 'Date/time not available';
      if (nextFixture.fixture.date) {
        const dateObj = new Date(nextFixture.fixture.date);
        fixtureDateStr = dateObj.toLocaleString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        });
      }

      // Escape dynamic parts
      const safeTeam = escapeMarkdownV2(displayName);
      const safeOpponent = escapeMarkdownV2(opponent);
      const safeLeague = escapeMarkdownV2(leagueName);
      const safeDate = escapeMarkdownV2(fixtureDateStr);

      // Build reply
      const reply = `*Card Booking Prediction* – ${safeTeam}

Next Fixture  
${safeTeam} vs ${safeOpponent}  
${safeLeague} • ${safeDate}

*Historical data & prediction coming soon\\.\\.\\.*  
\\(We're still building the stats engine 🚧\\)`.trim();

      console.log('Final MarkdownV2 reply:\n' + reply);

      await ctx.replyWithMarkdownV2(reply);

    } catch (err: any) {
      console.error('Predict command error:', err);
      await ctx.reply('Sorry, something went wrong. Try again later.');
    }
  });
}