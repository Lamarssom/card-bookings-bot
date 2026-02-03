import { Scenes, Markup } from 'telegraf';
import type { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { Card } from '../db';
import { escapeMarkdownV2 } from '../utils';
import { config } from '../config';
import axios from 'axios';
import type { BotContext } from '../types';

const { WizardScene } = Scenes;

interface WizardState {
  leagueId?: number;
  selectedLeague?: typeof config.leagues[0];
  teamName?: string;
}

const TEAM_CARDS_WIZARD = new Scenes.WizardScene<BotContext>(
  'team_cards_wizard',

  // Step 1: Show leagues
  async (ctx: BotContext) => {
    const keyboard = Markup.inlineKeyboard(
      config.leagues.map(l => Markup.button.callback(l.name, `league_${l.id}`)),
      { columns: 2 }
    );

    await ctx.reply('Select a league:', keyboard);
    return ctx.wizard.next();
  },

  // Step 2: User selected league → show teams from saved cards (DB only, no API)
  async (ctx: BotContext) => {
    const query = ctx.callbackQuery as CallbackQuery.DataQuery | undefined;
    if (!query?.data?.startsWith('league_')) {
      await ctx.reply('Please select a league from the buttons.');
      return;
    }

    const leagueId = parseInt(query.data.split('_')[1]);
    (ctx.wizard.state as WizardState).leagueId = leagueId;
    const selectedLeague = config.leagues.find(l => l.id === leagueId);
    (ctx.wizard.state as WizardState).selectedLeague = selectedLeague;

    if (!selectedLeague) {
      await ctx.reply('Invalid league.');
      return ctx.scene.leave();
    }

    try {
      // Aggregate unique team names from saved cards in this league
      const teamAggregation = await Card.aggregate([
        { $match: { leagueId } },
        {
          $group: {
            _id: null,
            teams: {
              $addToSet: {
                $cond: [
                  { $ne: ['$team', null] }, '$team',
                  { $cond: [{ $ne: ['$homeTeam', null] }, '$homeTeam', '$awayTeam'] }
                ]
              }
            }
          }
        },
        { $unwind: '$teams' },
        { $group: { _id: '$teams' } },
        { $project: { name: '$_id' } },
        { $sort: { name: 1 } } // Alphabetical order
      ]);

      const teams = teamAggregation.map(t => ({ team: { name: t.name } })); // Mimic API response shape for keyboard

      if (teams.length === 0) {
        await ctx.editMessageText(
          `No teams with saved cards found in ${selectedLeague.name}.\n\n` +
          `Try running /refresh [month] (e.g. /refresh aug) to load more bookings.`
        );
        return ctx.scene.leave();
      }

      const keyboard = Markup.inlineKeyboard(
        teams.map(t => Markup.button.callback(t.team.name, `team_${t.team.name.replace(/ /g, '_')}`)),
        { columns: 2 }
      );

      await ctx.editMessageText(`Teams with bookings in ${selectedLeague.name}:`, keyboard);
      return ctx.wizard.next();
    } catch (err) {
      console.error('DB teams error:', err);
      await ctx.editMessageText('Error loading teams from database: ' + (err as Error).message);
      return ctx.scene.leave();
    }
  },

  // Step 3: User selected team → show matchday ranges
  async (ctx: BotContext) => {
    const query = ctx.callbackQuery as CallbackQuery.DataQuery | undefined;
    if (!query?.data?.startsWith('team_')) {
      await ctx.reply('Please select a team.');
      return;
    }

    const teamName = query.data.split('_').slice(1).join('_').replace(/_/g, ' '); // handle spaces
    (ctx.wizard.state as WizardState).teamName = teamName;

    const ranges = [
      'Matchdays 1-5',
      '6-10',
      '11-15',
      '16-20',
      '21-25',
      '26-30',
      '31-35',
      '36-38',
      'All Matchdays'
    ];

    const keyboard = Markup.inlineKeyboard(
      ranges.map(r => Markup.button.callback(r, `range_${r.replace(/ /g, '_')}`)),
      { columns: 2 }
    );

    const selectedLeague = (ctx.wizard.state as WizardState).selectedLeague;
    await ctx.editMessageText(`Select matchday range for ${teamName}:`, keyboard);
    return ctx.wizard.next();
  },

  // Step 4: User selected range → query & show cards
  async (ctx: BotContext) => {
    const query = ctx.callbackQuery as CallbackQuery.DataQuery | undefined;
    if (!query?.data?.startsWith('range_')) {
      await ctx.reply('Please select a matchday range.');
      return;
    }

    const rangeStr = query.data.split('_').slice(1).join('_').replace(/_/g, ' '); // handle spaces in range
    await ctx.answerCbQuery();

    const state = ctx.wizard.state as WizardState;
    const leagueId = state.leagueId;
    const teamName = state.teamName;

    if (!teamName) {
      await ctx.editMessageText('Error: No team selected. Please start over with /teamcards.');
      return ctx.scene.leave();
    }

    let matchdayFilter: any = {};
    if (rangeStr !== 'All Matchdays') {
      const rangePart = rangeStr.split(' ')[1]; // e.g., '1-5'
      if (rangePart) {
        const [start, end] = rangePart.split('-').map(Number);
        matchdayFilter = { matchday: { $gte: start, $lte: end } };
      }
    }

    try {
      const dbQuery: any = {
        leagueId,
        $or: [
          // More flexible matching
          { team:       { $regex: teamName.trim(), $options: 'i' } },
          { homeTeam:   { $regex: teamName.trim(), $options: 'i' } },
          { awayTeam:   { $regex: teamName.trim(), $options: 'i' } },
          // Also match substrings in case of abbreviations
          { team:       { $regex: teamName.split(' ').pop() || teamName, $options: 'i' } }, // e.g. "Wanderers" or "United"
          { homeTeam:   { $regex: teamName.split(' ').pop() || teamName, $options: 'i' } },
          { awayTeam:   { $regex: teamName.split(' ').pop() || teamName, $options: 'i' } },
        ],
        ...matchdayFilter
      };
      console.log('DB Query:', dbQuery);

      const cards = await Card.find(dbQuery).sort({ date: -1 });

      if (cards.length === 0) {
        await ctx.editMessageText(
          `No saved cards found for ${teamName} in ${state.selectedLeague?.name} (${rangeStr}).\n\n` +
          `Possible reasons:\n` +
          `• Data for this period not yet refreshed\n` +
          `• Try /refresh [month] (e.g. /refresh aug) to load more bookings\n` +
          `• Clean sheet on cards! 🧼`
        );
        return ctx.scene.leave();
      }

      // Group by match
      const grouped: Record<string, any[]> = {};
      cards.forEach(c => {
        if (!grouped[c.match]) grouped[c.match] = [];
        grouped[c.match].push(c);
      });

      const replyParts: string[] = [`**Cards for ${teamName} in ${state.selectedLeague?.name} (${rangeStr})**`];

      for (const [match, matchCards] of Object.entries(grouped)) {
        replyParts.push(`\n**Match:** ${match} (${new Date(matchCards[0].date).toLocaleDateString('en-GB')})`);

        const home = matchCards[0].homeTeam;
        const away = matchCards[0].awayTeam;

        replyParts.push(`**${home}:**`);
        matchCards.filter(c => c.team === home).forEach(c => {
          const time = c.extra ? `${c.minute}+${c.extra}'` : `${c.minute}'`;
          const emoji = c.cardType.includes('Yellow') ? '🟨' : '🟥';
          replyParts.push(`- ${c.player} ${emoji} ${time}`);
        });

        replyParts.push(`**${away}:**`);
        matchCards.filter(c => c.team === away).forEach(c => {
          const time = c.extra ? `${c.minute}+${c.extra}'` : `${c.minute}'`;
          const emoji = c.cardType.includes('Yellow') ? '🟨' : '🟥';
          replyParts.push(`- ${c.player} ${emoji} ${time}`);
        });
      }

      await ctx.editMessageText(escapeMarkdownV2(replyParts.join('\n')), { parse_mode: 'MarkdownV2' });
    } catch (err) {
      await ctx.editMessageText('Error: ' + (err as Error).message);
    }

    return ctx.scene.leave();
  }
);

export default TEAM_CARDS_WIZARD;