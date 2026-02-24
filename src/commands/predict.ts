// src/commands/predict.ts
import { Context } from 'telegraf';
import { findTeamByName, getTeamIdFromName } from '../services/teamLookup';
import { getNextFixtureForTeam } from '../services/apiFootball';
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
        // For now we don't have teamId in DB — we'll need to map name → ID
        // Temporary fallback: use API search
        teamId = await getTeamIdFromName(teamName);
      } else {
        // No match in DB → try direct API search
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

      if (!teamId) {
        await ctx.reply('Could not resolve team ID. Try again or check spelling.');
        return;
      }

      // 3. Get next fixture
      const nextFixture = await getNextFixtureForTeam(teamId);

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for ${teamName}.\n` +
          'The season might be over, or data not available yet.'
        );
        return;
      }

      // 4. Basic placeholder reply (we'll expand this later)
      const opponent = nextFixture.teams.home.id === teamId
        ? nextFixture.teams.away.name
        : nextFixture.teams.home.name;

      const fixtureDate = new Date(nextFixture.fixture.date).toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      const reply = `
    *Card Booking Prediction* – ${escapeMarkdownV2(teamName)}

Next Fixture  
${escapeMarkdownV2(teamName)} vs ${escapeMarkdownV2(opponent)}  
${escapeMarkdownV2(nextFixture.league.name)} • ${fixtureDate}

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