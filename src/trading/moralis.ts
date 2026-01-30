import { config } from '../config.js';

export interface TokenMetadata {
    address: string;
    name: string;
    symbol: string;
    logo?: string;
    decimals: number;
    priceUsd?: number;
    marketCapUsd?: number;
    fullyDilutedValue?: number;
}

/**
 * Fetch token metadata from Moralis Solana API
 */
export async function getTokenMetadata(address: string): Promise<TokenMetadata | null> {
    try {
        const url = `https://solana-gateway.moralis.io/token/mainnet/${address}/metadata`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-API-Key': config.moralisApiKey
            }
        });

        if (!response.ok) {
            console.error(`Moralis API error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json() as any;

        // Map Moralis response to our TokenMetadata interface
        return {
            address: address,
            name: data.name || 'Unknown',
            symbol: data.symbol || '?',
            logo: data.logo,
            decimals: data.decimals || 9,
            // Moralis Solana API metadata endpoint might not include price/mcap directly
            // We might need another endpoint for price if not included
        };
    } catch (error) {
        console.error('Error fetching token metadata:', error);
        return null;
    }
}

/**
 * Fetch token price and market cap from Moralis if available
 */
export async function getTokenPrice(address: string): Promise<{ price: number; marketCap: number } | null> {
    try {
        // NOTE: Moralis Solana API price endpoint might be different or handle via another service
        // For now, we'll try to fetch price if Moralis supports it for Solana tokens
        const url = `https://solana-gateway.moralis.io/token/mainnet/${address}/price`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-API-Key': config.moralisApiKey
            }
        });

        if (response.ok) {
            const data = await response.json() as any;
            return {
                price: parseFloat(data.usdPrice || '0'),
                marketCap: parseFloat(data.marketCapUsd || '0')
            };
        }
        return null;
    } catch (error) {
        return null;
    }
}

export interface TokenBalance {
    mint: string;
    symbol: string;
    name: string;
    amount: number;
    decimals: number;
    amountFormatted: string;
    priceUsd?: number;
    valueUsd?: number;
}

/**
 * Fetch all token balances for a wallet from Moralis
 */
export async function getTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
        const url = `https://solana-gateway.moralis.io/account/mainnet/${address}/tokens?excludeSpam=true`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'X-API-Key': config.moralisApiKey
            }
        });

        if (!response.ok) {
            console.error(`Moralis API error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json() as any[];

        return data.map(token => ({
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            amount: parseFloat(token.amount),
            decimals: token.decimals,
            amountFormatted: token.amountFormatted,
            // Moralis might not include price here directly in this endpoint
        }));
    } catch (error) {
        console.error('Error fetching token balances:', error);
        return [];
    }
}
