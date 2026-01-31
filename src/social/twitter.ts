import crypto from 'crypto';
import { config } from '../config.js';

export interface Tweet {
    id: string;
    text: string;
    authorId: string;
    authorUsername: string;
    createdAt: string;
    metrics?: {
        likes: number;
        retweets: number;
        replies: number;
    };
}

export interface SearchResult {
    tweets: Tweet[];
    nextToken?: string;
}

/**
 * Twitter API client for reading and posting tweets
 */
export class TwitterClient {
    private bearerToken: string;
    private apiKey?: string;
    private apiSecret?: string;
    private accessToken?: string;
    private accessSecret?: string;

    constructor() {
        this.bearerToken = config.twitterBearerToken || '';
        this.apiKey = config.twitterApiKey;
        this.apiSecret = config.twitterApiSecret;
        this.accessToken = config.twitterAccessToken;
        this.accessSecret = config.twitterAccessSecret;
    }

    /**
     * Check if reading is configured (Bearer token)
     */
    canRead(): boolean {
        return !!this.bearerToken;
    }

    /**
     * Check if posting is configured (OAuth 1.1)
     */
    canPost(): boolean {
        return !!(this.apiKey && this.apiSecret && this.accessToken && this.accessSecret);
    }

    /**
     * Search for tweets matching a query
     */
    async searchTweets(query: string, maxResults: number = 10): Promise<SearchResult> {
        if (!this.canRead()) {
            throw new Error('Twitter Bearer Token not configured');
        }

        const url = new URL('https://api.twitter.com/2/tweets/search/recent');
        url.searchParams.set('query', query);
        url.searchParams.set('max_results', Math.min(maxResults, 100).toString());
        url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
        url.searchParams.set('expansions', 'author_id');
        url.searchParams.set('user.fields', 'username');

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Twitter API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;

        if (!data.data) {
            return { tweets: [] };
        }

        // Map user IDs to usernames
        const users = new Map(
            (data.includes?.users || []).map((u: any) => [u.id, u.username])
        );

        const tweets: Tweet[] = data.data.map((t: any) => ({
            id: t.id,
            text: t.text,
            authorId: t.author_id,
            authorUsername: users.get(t.author_id) || 'unknown',
            createdAt: t.created_at,
            metrics: t.public_metrics ? {
                likes: t.public_metrics.like_count,
                retweets: t.public_metrics.retweet_count,
                replies: t.public_metrics.reply_count,
            } : undefined,
        }));

        return {
            tweets,
            nextToken: (data as any).meta?.next_token,
        };
    }

    /**
     * Get recent tweets from a specific user
     */
    async getUserTweets(username: string, maxResults: number = 10): Promise<Tweet[]> {
        if (!this.canRead()) {
            throw new Error('Twitter Bearer Token not configured');
        }

        // First get user ID
        const userResponse = await fetch(
            `https://api.twitter.com/2/users/by/username/${username}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.bearerToken}`,
                },
            }
        );

        if (!userResponse.ok) {
            throw new Error(`User not found: ${username}`);
        }

        const userData = await userResponse.json() as any;
        const userId = userData.data?.id;

        if (!userId) {
            throw new Error(`User ID not found for: ${username}`);
        }

        // Get user's tweets
        const url = new URL(`https://api.twitter.com/2/users/${userId}/tweets`);
        url.searchParams.set('max_results', Math.min(maxResults, 100).toString());
        url.searchParams.set('tweet.fields', 'created_at,public_metrics');

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${this.bearerToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to get tweets for: ${username}`);
        }

        const data = await response.json() as any;

        if (!data.data) {
            return [];
        }

        return data.data.map((t: any) => ({
            id: t.id,
            text: t.text,
            authorId: userId,
            authorUsername: username,
            createdAt: t.created_at,
            metrics: t.public_metrics ? {
                likes: t.public_metrics.like_count,
                retweets: t.public_metrics.retweet_count,
                replies: t.public_metrics.reply_count,
            } : undefined,
        }));
    }

    /**
     * Post a tweet using OAuth 1.0a
     */
    async postTweet(
        text: string,
        customCreds?: { accessToken: string; accessSecret: string }
    ): Promise<{ id: string; text: string }> {
        const accessToken = customCreds?.accessToken || this.accessToken;
        const accessSecret = customCreds?.accessSecret || this.accessSecret;

        if (!accessToken || !accessSecret || !this.apiKey || !this.apiSecret) {
            throw new Error('Twitter OAuth credentials not configured.');
        }

        const url = 'https://api.twitter.com/2/tweets';
        const method = 'POST';
        const body = JSON.stringify({ text });

        // Generate OAuth 1.0a header
        const authHeader = this.generateOAuthHeader(method, url, {}, accessToken, accessSecret);

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to post tweet: ${response.status} - ${error}`);
        }

        const data = await response.json() as any;
        return {
            id: data.data.id,
            text: data.data.text,
        };
    }

    /**
     * Step 1: Get OAuth Request Token
     */
    async getRequestToken(callbackUrl: string = 'oob'): Promise<{ token: string; secret: string }> {
        const url = 'https://api.twitter.com/oauth/request_token';
        const method = 'POST';

        const params = { oauth_callback: callbackUrl };
        const authHeader = this.generateOAuthHeader(method, url, params);

        const response = await fetch(`${url}?oauth_callback=${encodeURIComponent(callbackUrl)}`, {
            method,
            headers: { 'Authorization': authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to get request token: ${await response.text()}`);
        }

        const text = await response.text();
        const data = Object.fromEntries(new URLSearchParams(text));

        return {
            token: data.oauth_token,
            secret: data.oauth_token_secret,
        };
    }

    /**
     * Step 3: Exchange PIN/Verifier for Access Token
     */
    async getAccessToken(
        requestToken: string,
        requestSecret: string,
        verifier: string
    ): Promise<{ accessToken: string; accessSecret: string; userId: string; username: string }> {
        const url = 'https://api.twitter.com/oauth/access_token';
        const method = 'POST';

        const params = { oauth_verifier: verifier };
        const authHeader = this.generateOAuthHeader(method, url, params, requestToken, requestSecret);

        const response = await fetch(`${url}?oauth_verifier=${encodeURIComponent(verifier)}`, {
            method,
            headers: { 'Authorization': authHeader },
        });

        if (!response.ok) {
            throw new Error(`Failed to get access token: ${await response.text()}`);
        }

        const text = await response.text();
        const data = Object.fromEntries(new URLSearchParams(text));

        return {
            accessToken: data.oauth_token,
            accessSecret: data.oauth_token_secret,
            userId: data.user_id,
            username: data.screen_name,
        };
    }

    /**
     * Generate OAuth 1.0a Authorization header
     */
    private generateOAuthHeader(
        method: string,
        url: string,
        extraParams: Record<string, string> = {},
        token?: string,
        tokenSecret?: string
    ): string {
        const oauthParams: Record<string, string> = {
            oauth_consumer_key: this.apiKey!,
            oauth_nonce: crypto.randomBytes(16).toString('hex'),
            oauth_signature_method: 'HMAC-SHA1',
            oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
            oauth_version: '1.0',
            ...extraParams,
        };

        if (token) {
            oauthParams.oauth_token = token;
        }

        // Create signature base string
        const sortedParams = Object.keys(oauthParams)
            .sort()
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
            .join('&');

        const signatureBase = [
            method.toUpperCase(),
            encodeURIComponent(url),
            encodeURIComponent(sortedParams),
        ].join('&');

        // Create signing key
        const signingKey = `${encodeURIComponent(this.apiSecret!)}&${encodeURIComponent(tokenSecret || '')}`;

        // Generate signature
        const signature = crypto
            .createHmac('sha1', signingKey)
            .update(signatureBase)
            .digest('base64');

        oauthParams.oauth_signature = signature;

        // Build Authorization header
        const authHeader = 'OAuth ' + Object.keys(oauthParams)
            .sort()
            .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
            .join(', ');

        return authHeader;
    }
}

// Singleton instance
let twitterClient: TwitterClient | null = null;

export function getTwitterClient(): TwitterClient {
    if (!twitterClient) {
        twitterClient = new TwitterClient();
    }
    return twitterClient;
}
