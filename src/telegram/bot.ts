import { Telegraf, Context } from 'telegraf';
import { config } from '../config.js';
import { statusCommand } from './commands/status.js';
import { snipeCommand } from './commands/snipe.js';
import { watchlistCommand } from './commands/watchlist.js';
import { helpCommand } from './commands/help.js';
import { walletCommand } from './commands/wallet.js';
import { tokenCommand } from './commands/token.js';
import { getUserWallet } from '../trading/wallet.js';

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
    // Register commands
    bot.command('start', async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        const wallet = getUserWallet(userId);

        if (!wallet) {
            // No wallet - show onboarding
            await ctx.reply(
                `🦞 *Welcome to MemeClaw!*\n\n` +
                `To get started, you need to set up a wallet first.\n\n` +
                `*Choose an option:*\n\n` +
                `🆕 \`/wallet create\` - Generate a new wallet\n` +
                `📥 \`/wallet import <key>\` - Import existing wallet\n\n` +
                `_Your wallet is stored securely and used for trading._`,
                { parse_mode: 'Markdown' }
            );
        } else {
            // Has wallet - show main menu
            await ctx.reply(
                `🦞 *MemeClaw Bot Active*\n\n` +
                `💳 Wallet: \`${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-8)}\`\n\n` +
                `*Commands:*\n` +
                `/wallet - View wallet & balance\n` +
                `/status - View positions & P&L\n` +
                `/snipe <address> <sol> - Buy a token\n` +
                `/watchlist - Sentiment keywords\n` +
                `/help - All commands`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    bot.command('wallet', walletCommand);
    bot.command('status', statusCommand);
    bot.command('snipe', snipeCommand);
    bot.command('watchlist', watchlistCommand);
    bot.command('collect', walletCommand);
    bot.command('token', tokenCommand);
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
    // Register commands with Telegram (shows menu when user types /)
    await bot.telegram.setMyCommands([
        { command: 'start', description: '🚀 Start the bot' },
        { command: 'wallet', description: '💳 Create or manage wallet' },
        { command: 'status', description: '📊 View positions & P&L' },
        { command: 'snipe', description: '🎯 Buy a token' },
        { command: 'token', description: '🔎 View token info' },
        { command: 'watchlist', description: '📋 Manage keywords' },
        { command: 'collect', description: '💳 Withdraw SOL' },
        { command: 'help', description: '❓ Show all commands' },
    ]);

    await bot.launch();
    console.log('🚀 MemeClaw bot is running!');

    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
