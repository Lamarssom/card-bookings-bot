import { Context } from 'telegraf';
import { Card } from '../db';
import { escapeMarkdownV2 } from '../utils';

export default function registerTestApf(bot: any) {
    bot.command('testapf', async (ctx) => {
        try {
            const key = process.env.API_KEY;
            if (!key) throw new Error('API_KEY not found in .env');

            // Fetch recent finished Premier League fixtures (season 2025 required!)
            const fixturesRes = await axios.get(
            'https://v3.football.api-sports.io/fixtures?league=39&season=2024&from=2025-01-01&to=2025-05-31&status=FT', // 2024 season dates
            { headers: { 'x-apisports-key': key } }
            );

            console.log('Raw fixtures response:', JSON.stringify(fixturesRes.data, null, 2)); // Debug log

            const fixtures = fixturesRes.data.response || [];
            if (fixtures.length === 0) {
            return ctx.reply(
                'No recent finished fixtures found in Premier League. ' +
                'Possible reasons: No matches in last 10, or try changing season to 2026 if new campaign started. ' +
                'Check terminal for raw API response.'
            );
            }

            // Take the most recent finished (first in list)
            const finished = fixtures[0];
            const fixtureId = finished.fixture.id;
            const homeName = finished.teams.home.name;
            const awayName = finished.teams.away.name;
            const matchDate = new Date(finished.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

            // Fetch card events only
            const eventsRes = await axios.get(
            `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}&type=Card`,
            {
                headers: { 'x-apisports-key': key }
            }
            );

            const events = eventsRes.data.response || [];

            const replyParts: string[] = [
            `**Sample Recent Match:** ${homeName} vs ${awayName} (${matchDate})`,
            `Card count: ${events.length}`
            ];

            if (events.length > 0) {
            const homeEvents = events.filter((e: any) => e.team.id === finished.teams.home.id);
            const awayEvents = events.filter((e: any) => e.team.id === finished.teams.away.id);

            if (homeEvents.length > 0) {
                replyParts.push(`**${homeName}:**`);
                homeEvents.forEach((e: any) => {
                const timeStr = e.time.extra ? `${e.time.elapsed}+${e.time.extra}'` : `${e.time.elapsed}'`;
                const emoji = e.detail.includes('Yellow') ? '🟨' : '🟥';
                replyParts.push(`- ${e.player.name} ${emoji} ${timeStr}`);
                });
            }

            if (awayEvents.length > 0) {
                replyParts.push(`**${awayName}:**`);
                awayEvents.forEach((e: any) => {
                const timeStr = e.time.extra ? `${e.time.elapsed}+${e.time.extra}'` : `${e.time.elapsed}'`;
                const emoji = e.detail.includes('Yellow') ? '🟨' : '🟥';
                replyParts.push(`- ${e.player.name} ${emoji} ${timeStr}`);
                });
            }
            } else {
            replyParts.push('No cards in this match (or none recorded).');
            }

            await ctx.replyWithMarkdownV2(escapeMarkdownV2(replyParts.join('\n')));

        } catch (err: any) {
            console.error('API-Football error:', err.response?.data || err.message);
            await ctx.reply(`Error: ${err.response?.data?.message || err.message || 'Unknown'}`);
        }
    });
}