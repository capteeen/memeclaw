import { validateConfig } from './config.js';
import { initDatabase } from './db/sqlite.js';
import { initWalletsTable } from './trading/wallet.js';
import { setupBot, startBot } from './telegram/bot.js';
import { initSignalsTable, startMonitor } from './social/monitor.js';

async function main() {
    console.log(`
  ╔══════════════════════════════════════╗
  ║     🦞 MemeClaw Trading Bot v1.0     ║
  ╚══════════════════════════════════════╝
  `);

    try {
        // Validate configuration
        console.log('🔧 Validating configuration...');
        validateConfig();
        console.log('✅ Configuration valid');

        // Initialize database
        console.log('📦 Initializing database...');
        initDatabase();
        initWalletsTable();
        initSignalsTable();

        // Setup and start Telegram bot
        console.log('🤖 Setting up Telegram bot...');
        setupBot();

        // Start social monitor (will only run if configured)
        startMonitor();

        await startBot();
    } catch (error) {
        console.error('❌ Startup error:', error);
        process.exit(1);
    }
}

main();
