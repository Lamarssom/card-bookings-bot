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
          'Please provide a team name.\n\nExamples:\n/predict Manchester United\n/predict Arsenal'
        );
        return;
      }

      await ctx.reply('🔍 Looking up next match and card prediction...');

      const displayName = args; // we'll normalize in query

      const now = new Date();

      // Find next fixture where team is home or away
      const nextFixture = await Fixture.findOne({
        $or: [
          { homeTeam: { $regex: new RegExp(`^${displayName}$|^Man Utd$`, 'i') } }, // handles abbr + full
          { awayTeam: { $regex: new RegExp(`^${displayName}$|^Man Utd$`, 'i') } }
        ],
        date: { $gt: now },
        league: 'Premier League'
      }).sort({ date: 1 });

      if (!nextFixture) {
        await ctx.reply(
          `No upcoming fixture found for "${displayName}" in the database.\n` +
          'Make sure fixtures are imported!'
        );
        return;
      }

      const home = nextFixture.homeTeam;
      const away = nextFixture.awayTeam;
      const opponent = home.toLowerCase().includes(displayName.toLowerCase()) ? away : home;

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
      const h2h = await Card.aggregate([
        {
          $match: {
            $or: [
              { homeTeam: { $regex: new RegExp(`(${home}|${away})`, 'i') }, awayTeam: { $regex: new RegExp(`(${home}|${away})`, 'i') } },
              { homeTeam: { $regex: new RegExp(`(${away}|${home})`, 'i') }, awayTeam: { $regex: new RegExp(`(${home}|${away})`, 'i') } }
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

      // Escape & build reply
      const safeHome = escapeMarkdownV2(home);
      const safeAway = escapeMarkdownV2(away);
      const safeDate = escapeMarkdownV2(fixtureDateStr);

      const reply = `*Card Booking Prediction* – ${escapeMarkdownV2(displayName)}\n\n` +
        `Next Fixture  \n` +
        `${safeHome} vs ${safeAway}  \n` +
        `Premier League • ${safeDate}\n\n` +
        predictionText +
        `\n\n\\(Stats from your DB – more seasons = better predictions 🚀\\).trim()`;

      console.log('Sending MarkdownV2:\n' + reply);

      await ctx.replyWithMarkdownV2(reply);
    } catch (err: any) {
      console.error('Predict error:', err);
      await ctx.reply('Error fetching prediction. Check logs.');
    }
  });
}