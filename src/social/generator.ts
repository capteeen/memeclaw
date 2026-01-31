import OpenAI from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({
    apiKey: config.openaiApiKey,
});

export interface GeneratedTweet {
    text: string;
    style: string;
    hashtags: string[];
}

export type TweetStyle = 'hype' | 'informative' | 'meme' | 'announcement' | 'shill';

const stylePrompts: Record<TweetStyle, string> = {
    hype: 'Create an exciting, high-energy tweet that builds FOMO and excitement. Use emojis and urgency.',
    informative: 'Create a professional, informative tweet that highlights key features and utility.',
    meme: 'Create a funny, meme-style tweet that will go viral. Reference popular crypto memes.',
    announcement: 'Create a professional announcement tweet for a milestone or news.',
    shill: 'Create a convincing promotional tweet that highlights potential gains and community.',
};

/**
 * Generate a tweet about a token using AI
 */
export async function generateTweet(
    tokenSymbol: string,
    style: TweetStyle = 'hype',
    context?: string
): Promise<GeneratedTweet> {
    const stylePrompt = stylePrompts[style];

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are a crypto social media expert. You create viral tweets for meme coins and crypto projects.
                
Rules:
- Keep tweets under 280 characters
- Include relevant emojis
- Include 2-3 relevant hashtags at the end
- Make it engaging and shareable
- Never give financial advice or guarantees
- Sound authentic, not like a bot

${stylePrompt}

Respond with JSON only: {"text": "tweet text with emojis", "hashtags": ["hashtag1", "hashtag2"]}`,
            },
            {
                role: 'user',
                content: `Create a ${style} tweet for the token: ${tokenSymbol}${context ? `\n\nContext: ${context}` : ''}`,
            },
        ],
        max_tokens: 200,
        temperature: 0.9,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                text: result.text,
                style,
                hashtags: result.hashtags || [],
            };
        }
    } catch (error) {
        console.error('Failed to parse tweet generation response:', error);
    }

    // Fallback if parsing fails
    return {
        text: `🚀 ${tokenSymbol} is making moves! Don't miss out on this one 👀 #crypto #memecoin`,
        style,
        hashtags: ['crypto', 'memecoin'],
    };
}

/**
 * Generate a milestone announcement tweet
 */
export async function generateMilestoneTweet(
    tokenSymbol: string,
    milestone: string,
    value?: string
): Promise<GeneratedTweet> {
    const context = `Milestone achieved: ${milestone}${value ? ` - ${value}` : ''}`;
    return generateTweet(tokenSymbol, 'announcement', context);
}

/**
 * Generate a reply tweet for engagement
 */
export async function generateReplyTweet(
    originalTweet: string,
    tokenSymbol: string
): Promise<string> {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are a friendly crypto community member. Create a short, engaging reply that subtly mentions the token.
                
Rules:
- Keep it under 200 characters
- Be conversational and friendly
- Don't be too promotional
- Use 1-2 emojis max`,
            },
            {
                role: 'user',
                content: `Original tweet: "${originalTweet}"\n\nCreate a friendly reply that mentions ${tokenSymbol}`,
            },
        ],
        max_tokens: 100,
        temperature: 0.9,
    });

    return response.choices[0]?.message?.content?.trim() || `${tokenSymbol} is the way! 🔥`;
}
