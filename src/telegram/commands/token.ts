import { Context } from 'telegraf';
import { getTokenMetadata, getTokenPrice } from '../../trading/moralis.js';

export async function tokenCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    const address = args[0];

    if (!address) {
        await ctx.reply(
            `🔎 *Token Info*\n\n` +
            `Usage: \`/token <address>\`\n\n` +
            `Shows real-time price, market cap, and links for any Solana token.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    try {
        const statusMsg = await ctx.reply('🔍 Fetching token data...');

        const [metadata, priceData] = await Promise.all([
            getTokenMetadata(address),
            getTokenPrice(address)
        ]);

        if (!metadata) {
            await ctx.telegram.editMessageText(
                ctx.chat?.id,
                statusMsg.message_id,
                undefined,
                `❌ Could not find token data for address:\n\`${address}\``,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const name = metadata.name;
        const symbol = metadata.symbol;
        const price = priceData?.price || 0;
        const marketCap = priceData?.marketCap || 0;

        let message = `🚀 *${name} on Solana ($${symbol.toUpperCase()})*\n\n`;
        message += `🌟 *CA:* \`${address}\`\n\n`;
        message += `🔎 [Search on X](https://twitter.com/search?q=${address})\n`;
        message += `🎯 *Exchange:* Jupiter / Pump.fun\n`;
        message += `💰 *Token Price:* $${price.toFixed(price < 0.01 ? 8 : 4)}\n`;
        message += `💡 *Market Cap:* $${marketCap.toLocaleString()}\n`;

        const markup = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: `refresh_token_${address}` }
                ],
                [
                    { text: '🎯 Snipe', callback_data: `snipe_${address}` },
                    { text: '📈 Chart', url: `https://dexscreener.com/solana/${address}` }
                ]
            ]
        };

        await ctx.telegram.editMessageText(
            ctx.chat?.id,
            statusMsg.message_id,
            undefined,
            message,
            { parse_mode: 'Markdown', reply_markup: markup }
        );

    } catch (error) {
        console.error('Token command error:', error);
        await ctx.reply('❌ Error fetching token info');
    }
}
