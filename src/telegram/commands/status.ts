import { Context } from 'telegraf';
import { positions } from '../../db/sqlite.js';

export async function statusCommand(ctx: Context) {
    try {
        const openPositions = positions.getOpen.all() as any[];
        const allPositions = positions.getAll.all() as any[];

        if (openPositions.length === 0 && allPositions.length === 0) {
            await ctx.reply(
                `📊 *MemeClaw Status*\n\n` +
                `No positions yet.\n` +
                `Use /snipe to make your first trade!`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        let message = `📊 *MemeClaw Status*\n\n`;

        // Open positions
        if (openPositions.length > 0) {
            message += `*🟢 Open Positions (${openPositions.length}):*\n`;
            for (const pos of openPositions) {
                message += `• \`${pos.token_symbol || 'Unknown'}\` - ${pos.buy_amount_sol} SOL\n`;
                message += `  Address: \`${pos.token_address.slice(0, 8)}...\`\n`;
            }
            message += '\n';
        }

        // Calculate total P&L from closed positions
        const totalPnl = allPositions
            .filter((p: any) => p.status === 'closed' && p.pnl_sol)
            .reduce((sum: number, p: any) => sum + p.pnl_sol, 0);

        const closedCount = allPositions.filter((p: any) => p.status === 'closed').length;

        message += `*📈 Performance:*\n`;
        message += `• Total trades: ${allPositions.length}\n`;
        message += `• Closed: ${closedCount}\n`;
        message += `• P&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(4)} SOL\n`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Status command error:', error);
        await ctx.reply('❌ Error fetching status');
    }
}
