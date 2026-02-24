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

      // 4. Basic placeholder reply (we'll expand this later)
      const opponent = nextFixture.strHomeTeam === teamName
        ? nextFixture.strAwayTeam
        : nextFixture.strHomeTeam;

      const fixtureDate = new Date(nextFixture.dateEvent + '' + nextFixture.strTime).toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      const leagueName = nextFixture.strLeague || 'Unknown League';

      const reply = `
    *Card Booking Prediction* – ${escapeMarkdownV2(teamName)}

Next Fixture  
${escapeMarkdownV2(teamName)} vs ${escapeMarkdownV2(opponent)}  
${escapeMarkdownV2(leagueName)} • ${fixtureDate}

*Historical data & prediction coming soon...*  
(We're still building the stats engine 🚧)
      `;

      await ctx.replyWithMarkdownV2(reply.trim());

    } catch (err: any) {
      console.error('Predict command error:', err);
      await ctx.reply('Sorry, something went wrong while fetching prediction. Try again later.');
    }
  });
}