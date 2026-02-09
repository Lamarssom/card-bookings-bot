import { Context } from 'telegraf';
import { fetchAndSaveRecentCards } from '../services/apiFootball';
import { config } from '../config';

const MONTH_RANGES: Record<string, { from: string; to: string }> = {
  aug:    { from: '2024-08-01', to: '2024-08-31' },
  sep:    { from: '2024-09-01', to: '2024-09-30' },
  oct:    { from: '2024-10-01', to: '2024-10-31' },
  nov:    { from: '2024-11-01', to: '2024-11-30' },
  dec:    { from: '2024-12-01', to: '2024-12-31' },
  jan:    { from: '2025-01-01', to: '2025-01-31' },
  feb:    { from: '2025-02-01', to: '2025-02-28' },
  mar:    { from: '2025-03-01', to: '2025-03-31' },
  apr:    { from: '2025-04-01', to: '2025-04-30' },
  may:    { from: '2025-05-01', to: '2025-05-31' },
};

export default function registerRefresh(bot: any) {
  bot.command('refresh', async (ctx: Context) => {
    try {
      await ctx.reply('Refreshing cards from historical data... (this may take time due to API limits)');

      let fromDate: string | undefined;
      let toDate: string | undefined;
      
      // Safely get the text after the command
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
      const args = messageText?.split(' ').slice(1).join(' ').toLowerCase().trim() || '';

      if (!args || !MONTH_RANGES[args]) {
        const months = Object.keys(MONTH_RANGES).join(', ');
        await ctx.reply(
          `Please specify a month.\n` +
          `Supported: ${months}\n\n` +
          `Example: /refresh aug   or   /refresh-aug`
        );
        return;
      }
       else {
        await ctx.reply('No month specified → attempting full 2024/25 season (will be partial due to free tier 100 req/day limit)');
      }

      const result = await fetchAndSaveRecentCards(2024, fromDate, toDate);

      await ctx.reply(
        `Refresh done!\n` +
        `Fetched ${result.fetched} matches\n` +
        `Saved/updated ${result.saved} cards\n\n` +
        `Tip: Run again tomorrow with a different month (e.g. /refresh sep) to add more data without hitting limits.`
      );
    } catch (err: any) {
      console.error('Refresh error:', err);
      await ctx.reply('Refresh failed: ' + (err.message || 'Unknown error'));
    }
  });
  // Month-specific + optional league shortcuts: /refresh-aug, /refresh-aug laliga, /refresh-sep seriea, etc.
  Object.keys(MONTH_RANGES).forEach(month => {
    bot.command(`refresh-${month}`, async (ctx: Context) => {
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const parts = messageText.split(' ').slice(1); // after /refresh-aug
      const leagueArg = parts.length > 0 ? parts[0].toLowerCase() : null;

      let targetLeagues = config.leagues;

      if (leagueArg) {
        const found = config.leagues.find(l => 
          l.name.toLowerCase().includes(leagueArg) || 
          String(l.id).includes(leagueArg)
        );
        if (!found) {
          await ctx.reply(`Unknown league "${leagueArg}". Try: premier, laliga, seriea, bundesliga, ligue1`);
          return;
        }
        targetLeagues = [found];
        await ctx.reply(`Limiting refresh to: ${found.name}`);
      } else {
        await ctx.reply(`Refreshing ALL leagues for ${month.toUpperCase()}`);
      }

      const range = MONTH_RANGES[month];
      await ctx.reply(`Starting: ${month.toUpperCase()} (${range.from} → ${range.to})...`);

      const originalLeagues = config.leagues;

      try {
        // Temporary override for this run
        const originalLeagues = config.leagues;
        config.leagues = targetLeagues;

        const result = await fetchAndSaveRecentCards(2024, range.from, range.to);

        config.leagues = originalLeagues; // restore

        await ctx.reply(
          `Done!\n` +
          `Fetched ${result.fetched} matches\n` +
          `Saved/updated ${result.saved} cards`
        );
      } catch (err: any) {
        config.leagues = originalLeagues; // restore on error too
        await ctx.reply('Failed: ' + (err.message || 'Unknown error'));
      }
    });
  });
}