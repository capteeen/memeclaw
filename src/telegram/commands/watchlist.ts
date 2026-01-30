import { Context } from 'telegraf';
import { watchlist } from '../../db/sqlite.js';

export async function watchlistCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    const subCommand = args[0]?.toLowerCase();

    // Show current watchlist
    if (!subCommand || subCommand === 'list') {
        const items = watchlist.getActive.all() as any[];

        if (items.length === 0) {
            await ctx.reply('📋 Watchlist is empty. Use `/watchlist add <type> <value>` to add items.',
                { parse_mode: 'Markdown' });
            return;
        }

        let message = `📋 *Active Watchlist*\n\n`;

        const keywords = items.filter(i => i.type === 'keyword');
        const influencers = items.filter(i => i.type === 'influencer');

        if (keywords.length > 0) {
            message += `*Keywords:*\n`;
            keywords.forEach(k => {
                message += `• \`${k.value}\` (weight: ${k.weight})\n`;
            });
            message += '\n';
        }

        if (influencers.length > 0) {
            message += `*Influencers:*\n`;
            influencers.forEach(i => {
                message += `• @${i.value} (weight: ${i.weight})\n`;
            });
        }

        message += `\n_Use \`/watchlist add keyword $TICKER\` to add_`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
        return;
    }

    // Add item
    if (subCommand === 'add') {
        const type = args[1]?.toLowerCase();
        const value = args[2];
        const weight = parseFloat(args[3] || '1.0');

        if (!type || !value || !['keyword', 'influencer'].includes(type)) {
            await ctx.reply(
                `Usage: \`/watchlist add <type> <value> [weight]\`\n\n` +
                `Types: keyword, influencer\n` +
                `Example: \`/watchlist add keyword $PENGU 1.5\``,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        try {
            watchlist.add.run({ type, value, weight });
            await ctx.reply(`✅ Added ${type}: \`${value}\` with weight ${weight}`, { parse_mode: 'Markdown' });
        } catch (error) {
            await ctx.reply('❌ Error adding to watchlist');
        }
        return;
    }

    // Remove item
    if (subCommand === 'remove' || subCommand === 'rm') {
        const id = parseInt(args[1]);

        if (isNaN(id)) {
            await ctx.reply('Usage: `/watchlist remove <id>`', { parse_mode: 'Markdown' });
            return;
        }

        try {
            watchlist.remove.run({ id });
            await ctx.reply(`✅ Removed watchlist item #${id}`);
        } catch (error) {
            await ctx.reply('❌ Error removing item');
        }
        return;
    }

    await ctx.reply(
        `📋 *Watchlist Commands*\n\n` +
        `/watchlist - Show active items\n` +
        `/watchlist add <type> <value> [weight]\n` +
        `/watchlist remove <id>`,
        { parse_mode: 'Markdown' }
    );
}
