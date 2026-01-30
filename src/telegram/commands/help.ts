import { Context } from 'telegraf';
import { config } from '../../config.js';

export async function helpCommand(ctx: Context) {
  const message = `
🦞 *MemeClaw - Crypto Trading Bot*

*Wallet Commands:*
/wallet - View your wallet & balance
/wallet create - Generate new wallet
/wallet import <key> - Import existing wallet
/wallet export - Show private key
/wallet delete - Remove wallet

*Trading Commands:*
/status - View positions & P&L
/snipe <address> <sol> - Buy a token

*Watchlist Commands:*
/watchlist - View active keywords
/watchlist add keyword <keyword>
/watchlist add influencer <handle>
/watchlist remove <id>

*Coming Soon:*
/raid <tweet_url> - Engagement raid
/banner <token> - Generate viral image

*Current Settings:*
• Max buy: ${config.maxBuySol} SOL
• Slippage: ${config.slippageBps / 100}%
• Stop-loss: ${config.stopLossPercent}%
  `;

  await ctx.reply(message.trim(), { parse_mode: 'Markdown' });
}
