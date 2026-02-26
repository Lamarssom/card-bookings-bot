// src/commands/predict.ts
import { Context } from 'telegraf';
import { escapeMarkdownV2 } from '../utils';
import { Fixture } from '../models/Fixture';
import { Card } from '../models/Card';

export default function registerPredict(bot: any) {
  bot.command('predict', async (ctx: Context) => {
    try {
      const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const args = messageText.split(' ').slice(1).join(' ').trim();

      if (!args) {
        await ctx.reply(
          'Please provide a team name.\n\nExamples:\n/predict Manchester United\n/predict Arsenal\n/predict Man Utd'
        );
        return;
      }

      await ctx.reply('🔍 Looking up next match and card prediction...');

      const displayName = args.trim();

      const now = new Date();

      // Improved team matching: allow partial/full/abbrev matches
      const nextFixture = await Fixture.findOne({
        $or: [
          { homeTeam: { $regex: displayName, $options: 'i' } },
          { awayTeam: { $regex: displayName, $options: 'i' } },
          // Extra fallback for common abbrevs in CSV
          { homeTeam: { $regex: 'Man Utd|Spurs|Nott\'m Forest|Wolves|Leicester', $options: 'i' } },
          { awayTeam: { $regex: 'Man Utd|Spurs|Nott\'m Forest|Wolves|Leicester', $options: 'i' } }
        ].map(cond => ({ ...cond, date: { $gt: now }, league: 'Premier League' })),
        date: { $gt: now },
        league: 'Premier League'
      }).sort({ date: 1 });

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for "${displayName}" in the database.\n` +
          'Try exact/short name (e.g. "Man Utd") or check if fixtures are imported correctly.'
        );
        return;
      }

      const home = nextFixture.homeTeam;
      const away = nextFixture.awayTeam;

      // Normalize display to full name if possible (optional improvement)
      const ourTeam = home.toLowerCase().includes(displayName.toLowerCase()) ? home : away;
      const opponent = home === ourTeam ? away : home;

      const fixtureDateStr = nextFixture.date.toLocaleString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      // --- Real H2H Prediction ---
      // Improved match: any fixture involving BOTH teams (home/away swapped ok)
      const h2h = await Card.aggregate([
        {
          $match: {
            $or: [
              { $and: [{ homeTeam: { $regex: home, $options: 'i' } }, { awayTeam: { $regex: away, $options: 'i' } }] },
              { $and: [{ homeTeam: { $regex: away, $options: 'i' } }, { awayTeam: { $regex: home, $options: 'i' } }] }
            ],
            date: { $gte: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000) } // last ~5 seasons
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalYellow: { $sum: '$yellowCards' },
            totalRed: { $sum: '$redCards' }
          }
        }
      ]);

      const stats = h2h[0] || { count: 0, totalYellow: 0, totalRed: 0 };
      const avgYellow = stats.count ? (stats.totalYellow / stats.count).toFixed(1) : 'N/A';
      const avgRed = stats.count ? (stats.totalRed / stats.count).toFixed(1) : 'N/A';

      let predictionText = '\n\n*No historical card data yet for this matchup* — engine learning 📈';
      if (stats.count > 0) {
        const totalAvg = (parseFloat(avgYellow) + parseFloat(avgRed)).toFixed(1);
        predictionText = `\n\n*Prediction from last ${stats.count} H2H meetings:*\n` +
          `• Avg yellow cards: *${avgYellow}*\n` +
          `• Avg red cards: *${avgRed}*\n` +
          `• Total cards avg: *${totalAvg}* → ${parseFloat(totalAvg) > 4.5 ? 'OVER 4.5 likely 🔥' : 'UNDER 4.5 likely ❄️'}`;
      }

      // Escape dynamic parts
      const safeOurTeam = escapeMarkdownV2(ourTeam);
      const safeOpponent = escapeMarkdownV2(opponent);
      const safeDate = escapeMarkdownV2(fixtureDateStr);

      const reply = `*Card Booking Prediction* – ${escapeMarkdownV2(displayName)}\n\n` +
        `Next Fixture  \n` +
        `${safeOurTeam} vs ${safeOpponent}  \n` +
        `Premier League • ${safeDate}\n\n` +
        predictionText +
        `\n\n\\(Stats from your DB – more seasons = better predictions 🚀\\)`.trim();

      console.log('Sending MarkdownV2:\n' + reply);

      await ctx.replyWithMarkdownV2(reply);

    } catch (err: any) {
      console.error('Predict error:', err);
      await ctx.reply('Error fetching prediction. Check logs.');
    }
  });
}