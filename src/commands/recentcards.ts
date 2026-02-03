import { Context } from 'telegraf';
import { Card } from '../db';
import { escapeMarkdownV2 } from '../utils';

export default function registerRecentCards(bot: any) {
  bot.command('recentcards', async (ctx: Context) => {
    try {
        const cards = await Card.find({}).sort({ date: -1 }).limit(200);

        if (cards.length === 0) {
            return ctx.reply('No cards found in recent range.');
        }

        const grouped: Record<string, any[]> = {};
        cards.forEach(c => {
            if (!grouped[c.match]) grouped[c.match] = [];
            grouped[c.match].push(c);
        });

        const replyParts: string[] = ['**Recent Cards (historical data):**'];

        for (const [match, matchCards] of Object.entries(grouped)) {
            replyParts.push(`\n**Match:** ${match}`);
            const home = matchCards[0].homeTeam;
            const away = matchCards[0].awayTeam;

            replyParts.push(`**${home}:**`);
            matchCards.filter((c: any) => c.team === home).forEach((c: any) => {
            const time = c.extra ? `${c.minute}+${c.extra}'` : `${c.minute}'`;
            const emoji = c.cardType.includes('Yellow') ? '🟨' : '🟥';
            replyParts.push(`- ${c.player} ${emoji} ${time}`);
            });

            replyParts.push(`**${away}:**`);
            matchCards.filter((c: any) => c.team === away).forEach((c: any) => {
                const time = c.extra ? `${c.minute}+${c.extra}'` : `${c.minute}'`;
                const emoji = c.cardType.includes('Yellow') ? '🟨' : '🟥';
                replyParts.push(`- ${c.player} ${emoji} ${time}`);
                });
            }

            await ctx.replyWithMarkdownV2(escapeMarkdownV2(replyParts.join('\n')));
        }   catch (err: any) {
            console.error('Recent cards error:', err);
            await ctx.reply('Query error: ' + (err.message || 'Unkonwn'));
        }
    });
}