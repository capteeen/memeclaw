import { Telegraf, Context } from 'telegraf';
import { config } from '../config.js';
import { statusCommand } from './commands/status.js';
import { snipeCommand } from './commands/snipe.js';
import { watchlistCommand } from './commands/watchlist.js';
import { helpCommand } from './commands/help.js';
import { walletCommand } from './commands/wallet.js';

export const bot = new Telegraf(config.telegramBotToken);

// Admin check middleware
const adminOnly = (ctx: Context, next: () => Promise<void>) => {
    const userId = ctx.from?.id;

    // If no admin is set, allow all users (for initial setup)
    if (!config.adminUserId) {
        console.log(`⚠️ No ADMIN_USER_ID set. Your user ID is: ${userId}`);
        return next();
    }

    if (userId !== config.adminUserId) {
        ctx.reply('❌ Unauthorized. This bot is private.');
        return;
    }

    return next();
};

export function setupBot() {
    // Apply admin check to all messages
    bot.use(adminOnly);

    // Register commands
    bot.command('start', (ctx) => {
        ctx.reply(
            `🦞 *MemeClaw Bot Active*\n\n` +
            `Your Telegram ID: \`${ctx.from?.id}\`\n\n` +
            `Commands:\n` +
            `/wallet - Create or manage your wallet\n` +
            `/status - View current positions & P&L\n` +
            `/snipe <address> <sol> - Buy a token\n` +
            `/watchlist - Manage sentiment keywords\n` +
            `/help - Show all commands`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.command('wallet', walletCommand);
    bot.command('status', statusCommand);
    bot.command('snipe', snipeCommand);
    bot.command('watchlist', watchlistCommand);
    bot.command('help', helpCommand);

    // Error handling
    bot.catch((err, ctx) => {
        console.error('Bot error:', err);
        ctx.reply('❌ An error occurred. Check logs.');
    });

    console.log('🤖 Telegram bot initialized');
    return bot;
}

export async function startBot() {
    await bot.launch();
    console.log('🚀 MemeClaw bot is running!');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
