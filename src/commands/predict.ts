// src/commands/predict.ts
import { Context } from 'telegraf';
import { findTeamByName, getTeamIdFromName } from '../services/teamLookup';
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

      // 2. Try to find the team in our database (fuzzy search)
      const teamInfo = await findTeamByName(args);

      let teamName: string;
      let teamId: number | null = null;

      if (teamInfo) {
        teamName = teamInfo.name;
        teamId = await getTeamIdFromName(teamName);
      } else {
        teamId = await getTeamIdFromName(args);
        if (!teamId) {
          await ctx.reply(
            `Could not find team "${args}".\n` +
            'Try a different spelling or a well-known team name.'
          );
          return;
        }
        teamName = args; // use input as fallback
      }

      teamId = await getTeamIdTheSportsDB(teamName)
      if (!teamId) {
        await ctx.reply('Could not resolve team ID. Try again or check spelling.');
        return;
      }

      // 3. Get next fixture
      const nextFixture = await getNextFixtureTheSportsDB(teamId);

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for ${teamName}.\n` +
          'The season might be over, or data not available yet.'
        );
        return;
      }

      // After getting nextFixture

        const opponent = nextFixture.strHomeTeam === teamName
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

        // Escape each part individually (safe and controlled)
        const safeTeam = escapeMarkdownV2(teamName);
        const safeOpponent = escapeMarkdownV2(opponent);
        const safeLeague = escapeMarkdownV2(leagueName);
        const safeDate = escapeMarkdownV2(fixtureDateStr);

        // Build the reply WITHOUT extra indentation or risky characters
        const reply = `*Card Booking Prediction* – ${safeTeam}

        Next Fixture  
        ${safeTeam} vs ${safeOpponent}  
        ${safeLeague} • ${safeDate}

        *Historical data & prediction coming soon...*  
        \\(We're still building the stats engine 🚧\\)`.trim();

        // Debug: log exactly what we're sending
        console.log('Final MarkdownV2 text to send:\n' + reply);

        await ctx.replyWithMarkdownV2(reply);
    } catch (err: any) {
      console.error('Predict command error:', err);
      await ctx.reply('Sorry, something went wrong while fetching prediction. Try again later.');
    }
  });
}