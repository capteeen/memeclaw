import OpenAI from 'openai';
import { config } from '../config.js';

const openai = new OpenAI({
    apiKey: config.openaiApiKey,
});

/**
 * Generate a viral banner image for a token milestone
 */
export async function generateBanner(
    tokenName: string,
    milestone: string = '$100K Market Cap',
    theme: string = 'penguin'
): Promise<string | null> {
    try {
        const themeDescriptions: Record<string, string> = {
            penguin: 'a cool 3D penguin wearing a crown and gold chains, snowboarding on a chart going up',
            lobster: 'a cool lobster wearing sunglasses and a gold chain, surfing on a rocket ship',
            doge: 'a cool shiba inu dog wearing a spacesuit, riding a rocket to the moon',
            pepe: 'a cool pepe frog wearing diamond hands, surrounded by money and charts',
        };

        const themeDescription = themeDescriptions[theme] || themeDescriptions.penguin;

        const prompt = `${themeDescription}, celebrating "${tokenName} hits ${milestone}", high quality digital art, vibrant colors, crypto trading theme, text overlay: "${tokenName.toUpperCase()}"`;

        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
        });

        const imageUrl = response.data?.[0]?.url;
        console.log(`🎨 Banner generated for ${tokenName}`);
        return imageUrl || null;
    } catch (error) {
        console.error('Banner generation error:', error);
        return null;
    }
}

/**
 * Generate a custom promotional image
 */
export async function generateCustomImage(prompt: string): Promise<string | null> {
    try {
        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: `${prompt}, high quality digital art, crypto/web3 aesthetic, vibrant colors`,
            n: 1,
            size: '1024x1024',
            quality: 'standard',
        });

        return response.data?.[0]?.url || null;
    } catch (error) {
        console.error('Image generation error:', error);
        return null;
    }
}
