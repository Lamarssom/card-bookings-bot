import { Context } from 'telegraf';
import { fetchAndSaveRecentCards } from '../services/apiFootball';
import { config } from '../config';

const MONTH_RANGES: Record<string, { from: string; to: string }> = {
  aug: { from: '2024-08-01', to: '2024-08-31' },
  sep: { from: '2024-09-01', to: '2024-09-30' },
  oct: { from: '2024-10-01', to: '2024-10-31' },
  nov: { from: '2024-11-01', to: '2024-11-30' },
  dec: { from: '2024-12-01', to: '2024-12-31' },
  jan: { from: '2025-01-01', to: '2025-01-31' },
  feb: { from: '2025-02-01', to: '2025-02-28' },
  mar: { from: '2025-03-01', to: '2025-03-31' },
  apr: { from: '2025-04-01', to: '2025-04-30' },
  may: { from: '2025-05-01', to: '2025-05-31' },
};

export default function registerRefresh(bot: any) {
  bot.command('refresh', async (ctx: Context) => {
    await ctx.sendChatAction('typing');

    const text = (ctx.message && 'text' in ctx.message ? ctx.message.text : '').trim();
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    let month: string | null = null;
    let leagueArg: string | null = null;

    // Support BOTH /refresh aug laliga  AND  /refresh-aug laliga
    if (cmd === '/refresh') {
      if (parts.length > 1) {
        const possibleMonth = parts[1].toLowerCase();
        if (MONTH_RANGES[possibleMonth]) {
          month = possibleMonth;
          if (parts.length > 2) leagueArg = parts[2].toLowerCase();
        }
      }
    } else if (cmd.startsWith('/refresh-')) {
      month = cmd.slice(9); // /refresh-aug → "aug"
      if (parts.length > 1) leagueArg = parts[1].toLowerCase();
    }

    if (!month || !MONTH_RANGES[month]) {
      const months = Object.keys(MONTH_RANGES).join(', ');
      await ctx.reply(
        `❌ Please specify a month.\n\n` +
        `Supported: ${months}\n\n` +
        `Examples:\n` +
        `/refresh aug\n` +
        `/refresh aug laliga\n` +
        `/refresh-aug\n` +
        `/refresh-aug bundesliga`
      );
      return;
    }

    const range = MONTH_RANGES[month];
    let targetLeagues = [...config.leagues]; // copy

    if (leagueArg) {
      const input = leagueArg.toLowerCase().trim().replace(/\s+/g, '');

      const leagueMap: Record<string, number> = {
        pl: 39,
        epl: 39,
        'premierleague': 39,

        laliga: 140,
        'la liga': 140,

        seriea: 135,
        'serie a': 135,

        bundesliga: 78,

        ligue1: 61,
        'ligue 1': 61,
      };

      const matchedId = leagueMap[input];

      if (matchedId) {
        const found = config.leagues.find(l => l.id === matchedId);
        if (found) {
          targetLeagues = [found];
          await ctx.reply(`🔍 Limiting to: ${found.name}`);
        } else {
          await ctx.reply(`League ID ${matchedId} not found in your config.`);
          return;
        }
      } else {
        // Fallback to original includes logic if no map hit
        const found = config.leagues.find(l =>
          l.name.toLowerCase().includes(input) ||
          String(l.id).includes(input)
        );
        if (found) {
          targetLeagues = [found];
          await ctx.reply(`🔍 Limiting to: ${found.name}`);
        } else {
          await ctx.reply(`❌ Unknown league "${leagueArg}". Try: premier, laliga, seriea, bundesliga, ligue1`);
          return;
        }
      }
    }

    await ctx.reply(`🚀 Starting ${month.toUpperCase()} (${range.from} → ${range.to})...\nThis may take 5–10 minutes due to API limits.`);

    const originalLeagues = config.leagues;

    try {
      config.leagues = targetLeagues; // temporary override

      const result = await fetchAndSaveRecentCards(2024, range.from, range.to);

      config.leagues = originalLeagues;

      await ctx.reply(
        `✅ Refresh complete for ${month.toUpperCase()}!\n\n` +
        `📊 Fetched matches: ${result.fetched}\n` +
        `💾 Cards saved/updated: ${result.saved}\n\n` +
        `Tip: Run a different league/month tomorrow (e.g. /refresh sep bundesliga)`
      );
    } catch (err: any) {
      config.leagues = originalLeagues;
      console.error('Refresh error:', err);
      let msg = '❌ Refresh failed';
      if (err.response?.status === 429 || err.message?.includes('429') || err.message?.includes('rate')) {
        msg += ': Daily API limit (100 req/day) reached. Try again after 00:00 UTC tomorrow.';
      } else {
        msg += `: ${err.message || 'Unknown error'}`;
      }
      await ctx.reply(msg);
    }
  });
}