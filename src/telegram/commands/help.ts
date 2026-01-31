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

*Social Features:*
/scan - Detect bullish signals now
/tweet <msg> - Post to Twitter/X
/generate <token> - AI tweet generation
/monitor - Social monitor status

*Watchlist Commands:*
/watchlist - View active items
/watchlist add keyword <word>
/watchlist add influencer <handle>
/watchlist remove <id>

*Other:*
/banner <token> - Generate viral image
/token <address> - View token info
/collect - Withdraw SOL

*Current Settings:*
• Max buy: ${config.maxBuySol} SOL
• Slippage: ${config.slippageBps / 100}%
• Stop-loss: ${config.stopLossPercent}%
  `;

  await ctx.reply(message.trim(), { parse_mode: 'Markdown' });
}
