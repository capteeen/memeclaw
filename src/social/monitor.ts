import { getTwitterClient, Tweet } from './twitter.js';
import { analyzeSentiment, shouldTriggerBuy } from '../sentiment/analyzer.js';
import { watchlist, db } from '../db/sqlite.js';
import { bot } from '../telegram/bot.js';
import { config } from '../config.js';

interface MonitorConfig {
    intervalMs: number;
    isRunning: boolean;
}

interface Signal {
    tweet: Tweet;
    sentimentScore: number;
    reasoning: string;
    keyword?: string;
    influencer?: string;
}

let monitorConfig: MonitorConfig = {
    intervalMs: config.socialMonitorInterval,
    isRunning: false,
};

let monitorInterval: NodeJS.Timeout | null = null;
let processedTweetIds = new Set<string>();

/**
 * Initialize the signals table in the database
 */
export function initSignalsTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            tweet_id TEXT,
            author TEXT,
            content TEXT,
            sentiment_score REAL,
            action_taken TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('📊 Signals table initialized');
}

/**
 * Start the social media monitoring service
 */
export function startMonitor(): boolean {
    if (monitorConfig.isRunning) {
        console.log('⚠️ Monitor already running');
        return false;
    }

    const twitter = getTwitterClient();
    if (!twitter.canRead()) {
        console.log('⚠️ Twitter Bearer Token not configured, monitoring disabled');
        return false;
    }

    monitorConfig.isRunning = true;
    console.log(`🔍 Starting social monitor (interval: ${monitorConfig.intervalMs / 1000}s)`);

    // Run immediately
    runMonitorCycle().catch(console.error);

    // Schedule periodic runs
    monitorInterval = setInterval(() => {
        runMonitorCycle().catch(console.error);
    }, monitorConfig.intervalMs);

    return true;
}

/**
 * Stop the social media monitoring service
 */
export function stopMonitor(): boolean {
    if (!monitorConfig.isRunning) {
        return false;
    }

    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }

    monitorConfig.isRunning = false;
    console.log('🛑 Social monitor stopped');
    return true;
}

/**
 * Check if monitor is currently running
 */
export function isMonitorRunning(): boolean {
    return monitorConfig.isRunning;
}

/**
 * Run a single monitoring cycle
 */
export async function runMonitorCycle(): Promise<Signal[]> {
    console.log('🔄 Running social monitor cycle...');
    const twitter = getTwitterClient();
    const signals: Signal[] = [];

    try {
        // Get active watchlist items
        const items = watchlist.getActive.all() as any[];
        const keywords = items.filter(i => i.type === 'keyword');
        const influencers = items.filter(i => i.type === 'influencer');

        // Search for keywords
        for (const keyword of keywords) {
            try {
                const result = await twitter.searchTweets(keyword.value, 5);

                for (const tweet of result.tweets) {
                    if (processedTweetIds.has(tweet.id)) continue;
                    processedTweetIds.add(tweet.id);

                    const sentiment = await analyzeSentiment(tweet.text, keyword.value);

                    if (shouldTriggerBuy(sentiment.score, keyword.weight)) {
                        signals.push({
                            tweet,
                            sentimentScore: sentiment.score,
                            reasoning: sentiment.reasoning,
                            keyword: keyword.value,
                        });
                    }
                }
            } catch (error) {
                console.error(`Error searching for keyword ${keyword.value}:`, error);
            }
        }

        // Check influencer tweets
        for (const influencer of influencers) {
            try {
                const tweets = await twitter.getUserTweets(influencer.value, 3);

                for (const tweet of tweets) {
                    if (processedTweetIds.has(tweet.id)) continue;
                    processedTweetIds.add(tweet.id);

                    const sentiment = await analyzeSentiment(tweet.text);

                    if (shouldTriggerBuy(sentiment.score, influencer.weight)) {
                        signals.push({
                            tweet,
                            sentimentScore: sentiment.score,
                            reasoning: sentiment.reasoning,
                            influencer: influencer.value,
                        });
                    }
                }
            } catch (error) {
                console.error(`Error getting tweets from ${influencer.value}:`, error);
            }
        }

        // Process signals
        if (signals.length > 0) {
            await processSignals(signals);
        }

        // Clean up old processed IDs (keep last 1000)
        if (processedTweetIds.size > 1000) {
            const idsArray = Array.from(processedTweetIds);
            processedTweetIds = new Set(idsArray.slice(-500));
        }

        console.log(`✅ Monitor cycle complete. Found ${signals.length} signals.`);
    } catch (error) {
        console.error('Monitor cycle error:', error);
    }

    return signals;
}

/**
 * Process detected signals - notify user and optionally trigger trades
 */
async function processSignals(signals: Signal[]): Promise<void> {
    if (!config.adminUserId) {
        console.log('⚠️ No admin user ID configured for notifications');
        return;
    }

    for (const signal of signals) {
        // Log to database
        try {
            const logSignal = db.prepare(`
                INSERT INTO signals (source, tweet_id, author, content, sentiment_score, action_taken)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            logSignal.run(
                signal.keyword ? 'keyword' : 'influencer',
                signal.tweet.id,
                signal.tweet.authorUsername,
                signal.tweet.text,
                signal.sentimentScore,
                'notified'
            );
        } catch (error) {
            console.error('Error logging signal:', error);
        }

        // Notify admin via Telegram
        const source = signal.keyword
            ? `Keyword: \`${signal.keyword}\``
            : `Influencer: @${signal.influencer}`;

        const message =
            `🚨 *Bullish Signal Detected!*\n\n` +
            `${source}\n` +
            `📊 Sentiment: ${(signal.sentimentScore * 100).toFixed(0)}%\n\n` +
            `*Tweet by @${signal.tweet.authorUsername}:*\n` +
            `"${signal.tweet.text.slice(0, 200)}${signal.tweet.text.length > 200 ? '...' : ''}"\n\n` +
            `💡 ${signal.reasoning}\n\n` +
            `_Use /snipe <address> <sol> to trade_`;

        try {
            await bot.telegram.sendMessage(config.adminUserId, message, {
                parse_mode: 'Markdown',
                // @ts-ignore - disable link preview
                disable_web_page_preview: true,
            });
        } catch (error) {
            console.error('Error sending signal notification:', error);
        }
    }
}

/**
 * Manually scan for signals (triggered by /scan command)
 */
export async function manualScan(): Promise<Signal[]> {
    console.log('👁️ Running manual social scan...');
    return runMonitorCycle();
}

/**
 * Get recent signals from database
 */
export function getRecentSignals(limit: number = 10): any[] {
    const stmt = db.prepare(`
        SELECT * FROM signals ORDER BY created_at DESC LIMIT ?
    `);
    return stmt.all(limit) as any[];
}
