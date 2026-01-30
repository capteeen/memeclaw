import OpenAI from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({
    apiKey: config.openaiApiKey,
});

export interface SentimentResult {
    score: number; // 0-1, higher = more bullish
    reasoning: string;
    isBullish: boolean;
}

/**
 * Analyze sentiment of a tweet using GPT-4o-mini
 */
export async function analyzeSentiment(
    tweetContent: string,
    projectName: string = 'the project'
): Promise<SentimentResult> {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a crypto sentiment analyzer. Analyze tweets for bullish/bearish sentiment about specific projects. 
          Respond ONLY with valid JSON in this exact format:
          {"score": 0.0-1.0, "reasoning": "brief explanation", "isBullish": true/false}
          
          Score guide:
          - 0.0-0.3: Bearish/negative
          - 0.3-0.5: Neutral/uncertain
          - 0.5-0.7: Mildly bullish
          - 0.7-0.9: Bullish
          - 0.9-1.0: Extremely bullish (calls to buy, major announcements)`,
                },
                {
                    role: 'user',
                    content: `Analyze this tweet's sentiment about ${projectName}:

"${tweetContent}"

Is this tweet bullish or bearish? Return JSON only.`,
                },
            ],
            max_tokens: 150,
            temperature: 0.3,
        });

        const content = response.choices[0]?.message?.content?.trim() || '';

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                score: Math.max(0, Math.min(1, result.score)),
                reasoning: result.reasoning || '',
                isBullish: result.score >= 0.8,
            };
        }

        // Default to neutral if parsing fails
        return { score: 0.5, reasoning: 'Could not parse response', isBullish: false };
    } catch (error) {
        console.error('Sentiment analysis error:', error);
        return { score: 0.5, reasoning: 'Analysis failed', isBullish: false };
    }
}

/**
 * Check if a tweet from a specific author should trigger a buy
 */
export function shouldTriggerBuy(
    sentimentScore: number,
    authorWeight: number = 1.0,
    threshold: number = 0.8
): boolean {
    // Weighted score: higher weight influencers need less bullish content
    const adjustedThreshold = threshold - (authorWeight - 1) * 0.1;
    return sentimentScore >= adjustedThreshold;
}
