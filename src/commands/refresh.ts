import { Context } from 'telegraf';
import { fetchAndSaveRecentCards } from '../services/apiFootball';

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

      if (args && MONTH_RANGES[args]) {
        const range = MONTH_RANGES[args];
        fromDate = range.from;
        toDate = range.to;
        await ctx.reply(`Using range: ${args.toUpperCase()} (${fromDate} to ${toDate})`);
      } else if (args) {
        await ctx.reply(`Unknown range "${args}". Use e.g. /refresh aug, /refresh sep, ... or just /refresh for full season (limited by free tier).`);
        return;
      } else {
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
}