import { Telegraf, Context, session } from 'telegraf';
import { Stage } from 'telegraf/scenes'; 
import dotenv from 'dotenv';
import { connectDB } from './db';
import { escapeMarkdownV2 } from './utils';
import { prisma } from './db';
import type { BotContext, BotSession } from './types';
import { VercelRequest, VercelResponse } from '@vercel/node';

// Command registrars
import registerPredict from './commands/predict';
//import registerRefresh from './commands/refresh';
import registerRecentCards from './commands/recentcards';
// import registerTestApf from './commands/testapf'; // uncomment if needed
import teamCardsWizard from './scenes/teamcardsScene';

dotenv.config();
connectDB();

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN missing in .env');
}

console.log('Token loaded successfully (censored):', token.substring(0, 10) + '...');

const bot = new Telegraf<BotContext>(token);

// Stage for scenes
const stage = new Stage<BotContext>([teamCardsWizard]);
bot.use(session<BotSession, BotContext>({
  defaultSession: () => ({}) as BotSession
}));
bot.use(stage.middleware());

// Basic commands
bot.start((ctx) => {
  console.log('Received /start from user:', ctx.from?.username || ctx.from?.id);
  ctx.replyWithMarkdownV2(escapeMarkdownV2(
    'Welcome to Card Bookings Bot! 🔥\n\n' +
    'Commands:\n' +
    '/predict <team> — Get card prediction for next match (e.g. /predict Chelsea)\n' +
    'Supports: Premier League, La Liga, Serie A, Bundesliga, Ligue 1\n\n' +
    'Data is from historical matches + upcoming fixtures.'
  ));
});

bot.help((ctx) => ctx.reply('Commands: /start, /refresh, /recentcards, /teamcards'));

bot.command('ping', (ctx) => ctx.reply('Pong!'));

//registerRefresh(bot);
registerRecentCards(bot);
registerPredict(bot);
// registerTestApf(bot); // keep commented unless needed

bot.command('teamcards', (ctx) => {
  console.log('Entering teamcards scene');
  ctx.scene.enter('team_cards_wizard');
});

bot.command('debugcards', async (ctx) => {
  try {
    const total = await prisma.card.count();
    const sample = await prisma.card.findFirst();
    await ctx.reply(
      `Total saved cards: ${total}\n` +
      `Sample (if any): ${sample ? JSON.stringify(sample, null, 2).slice(0, 500) : 'None'}`
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await ctx.reply('DB error: ' + errorMessage);
  }
});

const PORT = process.env.PORT || 3000;
const webhookPath = `/telegraf/${bot.secretPathComponent()}`; // auto-generates secure path

// Export handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(404).send('Not found');
  }

  await bot.handleUpdate(req.body);
  res.status(200).send('ok');
}

// For local dev — keep polling as fallback
if (process.env.NODE_ENV !== 'production') {
  bot.launch({
    dropPendingUpdates: true,
  }).then(() => console.log('Polling mode (local dev)'));
} else {
  console.log('Webhook mode active — no polling needed');
}
// Global error catch
bot.catch((err: unknown, ctx: BotContext) => {
  console.error('Bot error:', err);
  ctx.reply('Sorry, something went wrong. Try again later.');
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('SIGINT received - stopping bot...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('SIGTERM received - stopping bot...');
  bot.stop('SIGTERM');
});