# MemeClaw 🦞

MemeClaw leverages OpenClaw (moltbot) analysis to monitor social sentiment and execute trades automatically. Generate viral content and dominate the market - all from your Telegram.

## Features

- **Telegram Command Center** - Control everything from your phone
- **Jupiter V6 Integration** - Fast swaps on Solana
- **Sentiment Analysis** - OpenClaw powered tweet analysis
- **Banner Generation** - DALL-E 3 viral images for milestones

## Quick Start

```bash
# Install dependencies
npm install

# Configure your .env file
cp .env.example .env
# Edit .env with your API keys

# Start the bot
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/status` | View current positions & P&L |
| `/snipe <address> <sol>` | Buy a token |
| `/watchlist` | View sentiment keywords |
| `/watchlist add keyword $TICKER` | Add a keyword |
| `/help` | Show all commands |

## Configuration

Edit `.env` to configure:

- `TELEGRAM_BOT_TOKEN` - From @BotFather
- `OPENAI_API_KEY` - For sentiment & image generation
- `SOLANA_PRIVATE_KEY` - Your trading wallet
- `SOLANA_RPC_URL` - Helius/QuickNode recommended
- `MAX_BUY_SOL` - Maximum buy amount (default: 0.5)
- `SLIPPAGE_BPS` - Slippage in basis points (default: 500 = 5%)

## Safety

⚠️ **Never share your `.env` file or commit it to git!**

The bot includes safety features:
- Maximum buy limits
- Slippage protection
- Admin-only commands

## Development

```bash
npm run dev    # Start with hot reload
npm run build  # Build for production
npm start      # Run production build
```

## License

MIT
