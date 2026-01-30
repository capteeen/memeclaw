import { Context } from 'telegraf';
import { config } from '../../config.js';
import { positions } from '../../db/sqlite.js';
import { executeSwap, getQuote } from '../../trading/jupiter.js';
import { getTokenMetadata } from '../../trading/moralis.js';

export async function snipeCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);

    if (args.length < 2) {
        await ctx.reply(
            `🎯 *Snipe Command*\n\n` +
            `Usage: \`/snipe <token_address> <amount_sol>\`\n\n` +
            `Example:\n` +
            `\`/snipe So11...abc 0.1\`\n\n` +
            `*Safety Limits:*\n` +
            `• Max buy: ${config.maxBuySol} SOL\n` +
            `• Slippage: ${config.slippageBps / 100}%\n` +
            `• Stop-loss: ${config.stopLossPercent}%`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const tokenAddress = args[0];
    const amountSol = parseFloat(args[1]);

    // Validation
    if (isNaN(amountSol) || amountSol <= 0) {
        await ctx.reply('❌ Invalid amount. Please enter a positive number.');
        return;
    }

    if (amountSol > config.maxBuySol) {
        await ctx.reply(`❌ Amount exceeds max buy limit of ${config.maxBuySol} SOL`);
        return;
    }

    // Check if wallet is configured
    if (!config.solanaPrivateKey) {
        await ctx.reply(
            `⚠️ *Wallet Not Configured*\n\n` +
            `Add your SOLANA_PRIVATE_KEY to .env to enable trading.\n\n` +
            `_Simulating trade..._\n\n` +
            `Would buy ${amountSol} SOL of:\n` +
            `\`${tokenAddress}\``,
            { parse_mode: 'Markdown' }
        );

        // Log simulated position
        try {
            positions.create.run({
                tokenAddress,
                tokenSymbol: 'SIMULATED',
                buyAmountSol: amountSol,
                buyTx: 'SIMULATION'
            });
        } catch (e) {
            console.log('DB insert error (ignored in simulation):', e);
        }
        return;
    }

    // Real trading flow
    try {
        const metadata = await getTokenMetadata(tokenAddress);
        const tokenName = metadata ? `${metadata.name} (${metadata.symbol})` : 'Token';

        await ctx.reply(`🔄 Getting quote for ${amountSol} SOL → ${tokenName}...`);

        const quote = await getQuote(tokenAddress, amountSol);

        if (!quote) {
            await ctx.reply('❌ Could not get quote. Token might not be tradeable on Jupiter.');
            return;
        }

        await ctx.reply(
            `📝 *Quote Received: ${tokenName}*\n\n` +
            `Input: ${amountSol} SOL\n` +
            `Output: ${quote.outAmount} tokens\n` +
            `Price Impact: ${quote.priceImpactPct || 'N/A'}%\n\n` +
            `Executing swap...`,
            { parse_mode: 'Markdown' }
        );

        const result = await executeSwap(quote);

        if (result.success) {
            // Log to database
            positions.create.run({
                tokenAddress,
                tokenSymbol: 'TOKEN',
                buyAmountSol: amountSol,
                buyTx: result.txSignature
            });

            await ctx.reply(
                `✅ *Swap Successful!*\n\n` +
                `TX: \`${result.txSignature}\`\n\n` +
                `[View on Solscan](https://solscan.io/tx/${result.txSignature})`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply(`❌ Swap failed: ${result.error}`);
        }
    } catch (error) {
        console.error('Snipe error:', error);
        await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
