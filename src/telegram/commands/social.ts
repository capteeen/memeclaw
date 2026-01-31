import { Context } from 'telegraf';
import { getTwitterClient } from '../../social/twitter.js';
import { generateTweet, TweetStyle } from '../../social/generator.js';
import {
    startMonitor,
    stopMonitor,
    isMonitorRunning,
    manualScan,
    getRecentSignals,
} from '../../social/monitor.js';
import { twitterAccounts, pendingAuths } from '../../db/sqlite.js';

/**
 * /scan - Manually scan social media for watchlist signals
 */
export async function scanCommand(ctx: Context) {
    await ctx.reply('🔍 Scanning social media for signals...');

    try {
        const signals = await manualScan();

        if (signals.length === 0) {
            await ctx.reply('✅ Scan complete. No bullish signals detected.');
        } else {
            await ctx.reply(
                `✅ Scan complete!\n\n` +
                `🚨 Found *${signals.length}* bullish signal(s).\n` +
                `_Check above messages for details._`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error: any) {
        console.error('Scan error:', error);
        await ctx.reply(`❌ Scan failed: ${error.message || 'Unknown error'}`);
    }
}

/**
 * /tweet <message> - Post a tweet
 */
export async function tweetCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const tweetText = text.replace(/^\/tweet\s*/i, '').trim();

    if (!tweetText) {
        await ctx.reply(
            '📝 *Post a Tweet*\n\n' +
            'Usage: `/tweet <your message>`\n\n' +
            'Example:\n' +
            '`/tweet 🚀 $PENGU to the moon!`',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (tweetText.length > 280) {
        await ctx.reply(`❌ Tweet too long (${tweetText.length}/280 characters)`);
        return;
    }

    const twitter = getTwitterClient();
    const userId = ctx.from?.id;

    if (!userId) return;

    // Check if user has linked their own account
    const userAccount = twitterAccounts.get.get({ userId }) as any;
    let customCreds = undefined;

    if (userAccount) {
        customCreds = {
            accessToken: userAccount.access_token,
            accessSecret: userAccount.access_secret
        };
    } else if (!twitter.canPost()) {
        await ctx.reply(
            '❌ Twitter posting not configured.\n\n' +
            'You can link your own Twitter account using `/link` to post tweets!',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    await ctx.reply('📤 Posting tweet...');

    try {
        const result = await twitter.postTweet(tweetText, customCreds);
        await ctx.reply(
            `✅ Tweet posted ${userAccount ? 'from your account' : ''}!\n\n` +
            `🔗 https://twitter.com/i/status/${result.id}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error: any) {
        console.error('Tweet error:', error);
        await ctx.reply(`❌ Failed to post: ${error.message || 'Unknown error'}`);
    }
}

/**
 * /link - Start Twitter account linking flow
 */
export async function linkCommand(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;

    const twitter = getTwitterClient();

    try {
        await ctx.reply('🔗 Generating authorization link...');

        // Use "oob" for PIN-based flow
        const { token, secret } = await twitter.getRequestToken('oob');

        // Store request token/secret temporarily
        pendingAuths.upsert.run({ userId, requestToken: token, requestSecret: secret });

        const authUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${token}`;

        await ctx.reply(
            `🦞 *Link your Twitter Account*\n\n` +
            `1. Click the link below and authorize the app:\n` +
            `🔗 [Authorize on Twitter](${authUrl})\n\n` +
            `2. After authorizing, you will get a PIN.\n` +
            `3. Send the PIN here using: \`/verify <PIN>\`\n\n` +
            `_This allows MemeClaw to post tweets on your behalf._`,
            { parse_mode: 'Markdown' }
        );
    } catch (error: any) {
        console.error('Link command error:', error);
        await ctx.reply(`❌ Failed to start linking: ${error.message}`);
    }
}

/**
 * /verify <PIN> - Complete Twitter linking
 */
export async function verifyCommand(ctx: Context) {
    const userId = ctx.from?.id;
    const text = (ctx.message as any)?.text || '';
    const pin = text.replace(/^\/verify\s*/i, '').trim();

    if (!userId) return;

    if (!pin) {
        await ctx.reply('❌ Please provide the PIN. Usage: `/verify <PIN>`');
        return;
    }

    const pending = pendingAuths.get.get({ userId }) as any;

    if (!pending) {
        await ctx.reply('❌ No pending linking request found. Use `/link` first.');
        return;
    }

    await ctx.reply('⏳ Verifying PIN and linking account...');

    try {
        const twitter = getTwitterClient();
        const { accessToken, accessSecret, username } = await twitter.getAccessToken(
            pending.request_token,
            pending.request_secret,
            pin
        );

        // Store final tokens
        twitterAccounts.upsert.run({
            userId,
            accessToken,
            accessSecret,
            username
        });

        // Clean up pending auth
        pendingAuths.remove.run({ userId });

        await ctx.reply(
            `✅ *Success!* Your Twitter account (@${username}) is now linked.\n\n` +
            `Now when you use \`/tweet\`, it will post directly to your personal feed!`,
            { parse_mode: 'Markdown' }
        );
    } catch (error: any) {
        console.error('Verify command error:', error);
        await ctx.reply(`❌ Failed to link account: ${error.message}`);
    }
}

/**
 * /generate <token> [style] - Generate a tweet using AI
 */
export async function generateCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    const token = args[0];
    const style = (args[1]?.toLowerCase() || 'hype') as TweetStyle;

    if (!token) {
        await ctx.reply(
            '🤖 *AI Tweet Generator*\n\n' +
            'Usage: `/generate <token> [style]`\n\n' +
            '*Styles:*\n' +
            '• `hype` - High energy, FOMO (default)\n' +
            '• `informative` - Professional, features\n' +
            '• `meme` - Funny, viral\n' +
            '• `announcement` - Milestone news\n' +
            '• `shill` - Promotional\n\n' +
            'Example:\n' +
            '`/generate $PENGU hype`',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const validStyles: TweetStyle[] = ['hype', 'informative', 'meme', 'announcement', 'shill'];
    if (!validStyles.includes(style)) {
        await ctx.reply(
            `❌ Invalid style. Use: ${validStyles.join(', ')}`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    await ctx.reply(`🤖 Generating ${style} tweet for ${token}...`);

    try {
        const generated = await generateTweet(token, style);

        await ctx.reply(
            `✨ *Generated Tweet*\n\n` +
            `"${generated.text}"\n\n` +
            `📊 Style: ${generated.style}\n` +
            `#️⃣ Tags: ${generated.hashtags.join(' ')}\n\n` +
            `_Use /tweet to post this, or copy and edit:_\n\n` +
            `\`/tweet ${generated.text}\``,
            { parse_mode: 'Markdown' }
        );
    } catch (error: any) {
        console.error('Generate error:', error);
        await ctx.reply(`❌ Generation failed: ${error.message || 'Unknown error'}`);
    }
}

/**
 * /monitor [on|off|status] - Control social monitoring
 */
export async function monitorCommand(ctx: Context) {
    const text = (ctx.message as any)?.text || '';
    const args = text.split(' ').slice(1);
    const subCommand = args[0]?.toLowerCase();

    const twitter = getTwitterClient();
    const canRead = twitter.canRead();
    const running = isMonitorRunning();

    if (!subCommand || subCommand === 'status') {
        const recentSignals = getRecentSignals(5);

        let message = `📡 *Social Monitor Status*\n\n` +
            `Status: ${running ? '🟢 Running' : '🔴 Stopped'}\n` +
            `Twitter API: ${canRead ? '✅ Configured' : '❌ Not configured'}\n\n`;

        if (recentSignals.length > 0) {
            message += `*Recent Signals:*\n`;
            recentSignals.forEach((s: any, i: number) => {
                const score = (s.sentiment_score * 100).toFixed(0);
                message += `${i + 1}. @${s.author} (${score}%) - ${s.source}\n`;
            });
        }

        message += `\n_Use /monitor on|off to control_`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
        return;
    }

    if (subCommand === 'on') {
        if (!canRead) {
            await ctx.reply(
                '❌ Cannot start monitor - Twitter Bearer Token not configured.\n\n' +
                'Set `TWITTER_BEARER_TOKEN` in your `.env` file.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (running) {
            await ctx.reply('⚠️ Monitor is already running.');
            return;
        }

        const started = startMonitor();
        if (started) {
            await ctx.reply(
                '🟢 *Social Monitor Started*\n\n' +
                'Now monitoring Twitter for your watchlist keywords and influencers.\n' +
                "You'll receive notifications when bullish signals are detected.",
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply('❌ Failed to start monitor.');
        }
        return;
    }

    if (subCommand === 'off') {
        if (!running) {
            await ctx.reply('⚠️ Monitor is not running.');
            return;
        }

        const stopped = stopMonitor();
        if (stopped) {
            await ctx.reply('🔴 Social monitor stopped.');
        } else {
            await ctx.reply('❌ Failed to stop monitor.');
        }
        return;
    }

    await ctx.reply(
        '📡 *Monitor Commands*\n\n' +
        '`/monitor` - Show status\n' +
        '`/monitor on` - Start monitoring\n' +
        '`/monitor off` - Stop monitoring',
        { parse_mode: 'Markdown' }
    );
}
