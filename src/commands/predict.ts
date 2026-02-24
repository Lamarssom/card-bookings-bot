// src/commands/predict.ts
import { Context } from 'telegraf';
import { findTeamByName } from '../services/teamLookup';
import { getTeamIdTheSportsDB, getNextFixtureTheSportsDB } from '../services/theSportsDB';
import { escapeMarkdownV2 } from '../utils';

export default function registerPredict(bot: any) {
  bot.command('predict', async (ctx: Context) => {
    try {
      // 1. Get user input
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

      // 2. Resolve display name and search name
      let displayName = args; // what shows in reply
      let searchName = args;  // what we search TheSportsDB with

      // Prefer DB match for cleaner name if available
      const teamInfo = await findTeamByName(args);
      if (teamInfo) {
        displayName = teamInfo.name;
        searchName = teamInfo.name; // DB names are often more accurate
      }

      // 3. Get team ID from TheSportsDB
      let teamId: number | null = await getTeamIdTheSportsDB(searchName);

      // Fallback: try original user input if DB name failed
      if (!teamId) {
        teamId = await getTeamIdTheSportsDB(args);
      }

      if (!teamId) {
        await ctx.reply(
          `Could not find "${args}" on sports database.\n` +
          'Try exact spelling (e.g. "Man United", "Barcelona", "Man City").'
        );
        return;
      }

      // 4. Get next fixture
      const nextFixture = await getNextFixtureTheSportsDB(teamId);

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for ${escapeMarkdownV2(displayName)}.\n` +
          'Season might be paused or no data available yet.'
        );
        return;
      }

      // 5. Format opponent and date safely
      const opponent = nextFixture.strHomeTeam === displayName
        ? nextFixture.strAwayTeam
        : nextFixture.strHomeTeam;

      let fixtureDateStr = 'Date/time not available';

      if (nextFixture.dateEvent && nextFixture.strTime) {
        try {
          const [year, month, day] = nextFixture.dateEvent.split('-');
          const [hour, min] = nextFixture.strTime.split(':').map((s: string) => s.padStart(2, '0'));

          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthName = monthNames[parseInt(month, 10) - 1] || month;

          fixtureDateStr = `${day} ${monthName} ${year} ${hour}:${min} UTC`;
        } catch (e) {
          console.warn('Date parse failed:', e);
          fixtureDateStr = `${nextFixture.dateEvent || 'Unknown'} ${nextFixture.strTime || ''}`;
        }
      }

      const leagueName = nextFixture.strLeague || 'Unknown League';

      // Escape each dynamic part
      const safeTeam = escapeMarkdownV2(displayName);
      const safeOpponent = escapeMarkdownV2(opponent);
      const safeLeague = escapeMarkdownV2(leagueName);
      const safeDate = escapeMarkdownV2(fixtureDateStr);

      // Build reply (no indentation issues, all escaped)
      const reply = `*Card Booking Prediction* – ${safeTeam}

Next Fixture  
${safeTeam} vs ${safeOpponent}  
${safeLeague} • ${safeDate}

*Historical data & prediction coming soon...*  
\\(We're still building the stats engine 🚧\\)`.trim();

      // Debug log
      console.log('Final MarkdownV2 reply:\n' + reply);

      await ctx.replyWithMarkdownV2(reply);

    } catch (err: any) {
      console.error('Predict command error:', err);
      await ctx.reply('Sorry, something went wrong while fetching prediction. Try again later.');
    }
  });
}