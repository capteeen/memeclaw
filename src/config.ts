import 'dotenv/config';

export const config = {
    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
    adminUserId: process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID) : null,

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY!,

    // Solana
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
    dbPath: process.env.DB_PATH || './memeclaw.db',

    // Trading Safety
    slippageBps: parseInt(process.env.SLIPPAGE_BPS || '500'),
    stopLossPercent: parseInt(process.env.STOP_LOSS_PERCENT || '10'),
    maxBuySol: parseFloat(process.env.MAX_BUY_SOL || '0.5'),

    // Twitter
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,

    // Moralis
    moralisApiKey: process.env.MORALIS_API_KEY!,
};

// Validate required config
export function validateConfig() {
    const required = ['telegramBotToken', 'openaiApiKey', 'moralisApiKey'] as const;
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required config: ${missing.join(', ')}`);
    }
}
