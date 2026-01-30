import { Context } from 'telegraf';
import {
    generateWallet,
    importWallet,
    saveUserWallet,
    getUserWallet,
    deleteUserWallet,
    getWalletBalance
} from '../../trading/wallet.js';

export async function walletCommand(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    const subCommand = args[0]?.toLowerCase();

    // Show wallet info (default)
    if (!subCommand || subCommand === 'info') {
        const wallet = getUserWallet(userId);

        if (!wallet) {
            await ctx.reply(
                `💳 *No Wallet Connected*\n\n` +
                `Create or import a wallet:\n\n` +
                `• \`/wallet create\` - Generate new wallet\n` +
                `• \`/wallet import <key>\` - Import existing`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        try {
            const balance = await getWalletBalance(wallet.publicKey);

            await ctx.reply(
                `💳 *Your Wallet*\n\n` +
                `*Address:*\n\`${wallet.publicKey}\`\n\n` +
                `*Balance:* ${balance.toFixed(4)} SOL\n\n` +
                `[View on Solscan](https://solscan.io/account/${wallet.publicKey})\n\n` +
                `_Commands:_\n` +
                `• \`/wallet export\` - Show private key\n` +
                `• \`/wallet delete\` - Remove wallet`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            await ctx.reply(
                `💳 *Your Wallet*\n\n` +
                `*Address:*\n\`${wallet.publicKey}\`\n\n` +
                `_Balance check failed. Network may be slow._`,
                { parse_mode: 'Markdown' }
            );
        }
        return;
    }

    // Create new wallet
    if (subCommand === 'create' || subCommand === 'new') {
        const existingWallet = getUserWallet(userId);

        if (existingWallet) {
            await ctx.reply(
                `⚠️ You already have a wallet!\n\n` +
                `Address: \`${existingWallet.publicKey}\`\n\n` +
                `Use \`/wallet delete\` first to create a new one.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const newWallet = generateWallet();
        saveUserWallet(userId, newWallet.publicKey, newWallet.privateKey);

        await ctx.reply(
            `🎉 *New Wallet Created!*\n\n` +
            `*Address:*\n\`${newWallet.publicKey}\`\n\n` +
            `*Private Key (KEEP SECRET!):*\n` +
            `\`${newWallet.privateKey}\`\n\n` +
            `⚠️ *SAVE YOUR PRIVATE KEY NOW!*\n` +
            `This is the only time it will be shown in full.\n\n` +
            `Send SOL to this address to start trading.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Import existing wallet
    if (subCommand === 'import') {
        const privateKey = args[1];

        if (!privateKey) {
            await ctx.reply(
                `📥 *Import Wallet*\n\n` +
                `Usage: \`/wallet import <private_key>\`\n\n` +
                `Private key should be in base58 format.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Delete the message with the private key for security
        try {
            await ctx.deleteMessage();
        } catch {
            // Ignore if can't delete
        }

        const existingWallet = getUserWallet(userId);
        if (existingWallet) {
            await ctx.reply(
                `⚠️ You already have a wallet!\n` +
                `Use \`/wallet delete\` first to import a new one.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const imported = importWallet(privateKey);

        if (!imported) {
            await ctx.reply('❌ Invalid private key. Please check and try again.');
            return;
        }

        saveUserWallet(userId, imported.publicKey, imported.privateKey);

        await ctx.reply(
            `✅ *Wallet Imported!*\n\n` +
            `*Address:*\n\`${imported.publicKey}\`\n\n` +
            `Your wallet is now connected and ready to trade.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Export private key
    if (subCommand === 'export' || subCommand === 'key') {
        const wallet = getUserWallet(userId);

        if (!wallet) {
            await ctx.reply('❌ No wallet found. Create one with `/wallet create`',
                { parse_mode: 'Markdown' });
            return;
        }

        await ctx.reply(
            `🔐 *Your Private Key*\n\n` +
            `\`${wallet.privateKey}\`\n\n` +
            `⚠️ *NEVER share this with anyone!*\n` +
            `_This message will auto-delete in 30 seconds._`,
            { parse_mode: 'Markdown' }
        );

        // Auto-delete after 30 seconds
        setTimeout(async () => {
            try {
                await ctx.deleteMessage();
            } catch {
                // Ignore
            }
        }, 30000);
        return;
    }

    // Delete wallet
    if (subCommand === 'delete' || subCommand === 'remove') {
        const wallet = getUserWallet(userId);

        if (!wallet) {
            await ctx.reply('❌ No wallet to delete.');
            return;
        }

        // Check for confirmation
        const confirm = args[1]?.toLowerCase();
        if (confirm !== 'confirm') {
            await ctx.reply(
                `⚠️ *Delete Wallet?*\n\n` +
                `This will remove your wallet from the bot.\n` +
                `Make sure you have saved your private key!\n\n` +
                `To confirm, type:\n` +
                `\`/wallet delete confirm\``,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        deleteUserWallet(userId);
        await ctx.reply('✅ Wallet deleted. You can create or import a new one anytime.');
        return;
    }

    // Unknown subcommand
    await ctx.reply(
        `💳 *Wallet Commands*\n\n` +
        `/wallet - Show wallet info & balance\n` +
        `/wallet create - Generate new wallet\n` +
        `/wallet import <key> - Import existing\n` +
        `/wallet export - Show private key\n` +
        `/wallet delete - Remove wallet`,
        { parse_mode: 'Markdown' }
    );
}
