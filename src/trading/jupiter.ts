import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { config } from '../config.js';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// SOL mint address
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Solana connection
const connection = new Connection(config.solanaRpcUrl, 'confirmed');

export interface JupiterQuote {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    priceImpactPct?: string;
    routePlan: any[];
}

/**
 * Get a swap quote from Jupiter
 */
export async function getQuote(
    outputMint: string,
    amountSol: number
): Promise<JupiterQuote | null> {
    try {
        // Convert SOL to lamports
        const amountLamports = Math.floor(amountSol * 1e9);

        const params = new URLSearchParams({
            inputMint: SOL_MINT,
            outputMint,
            amount: amountLamports.toString(),
            slippageBps: config.slippageBps.toString(),
        });

        const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);

        if (!response.ok) {
            console.error('Jupiter quote error:', await response.text());
            return null;
        }

        const quote = await response.json() as JupiterQuote;
        return quote;
    } catch (error) {
        console.error('Error getting Jupiter quote:', error);
        return null;
    }
}

/**
 * Execute a swap on Jupiter
 */
export async function executeSwap(quote: JupiterQuote): Promise<{
    success: boolean;
    txSignature?: string;
    error?: string;
}> {
    try {
        if (!config.solanaPrivateKey) {
            return { success: false, error: 'Wallet not configured' };
        }

        // Parse private key
        let wallet: Keypair;
        try {
            const privateKeyBytes = JSON.parse(config.solanaPrivateKey);
            wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));
        } catch {
            // Try base58 format
            const bs58 = await import('bs58');
            wallet = Keypair.fromSecretKey(bs58.default.decode(config.solanaPrivateKey));
        }

        // Get swap transaction
        const swapResponse = await fetch(JUPITER_SWAP_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto',
            }),
        });

        if (!swapResponse.ok) {
            const error = await swapResponse.text();
            return { success: false, error: `Swap API error: ${error}` };
        }

        const { swapTransaction } = await swapResponse.json() as { swapTransaction: string };

        // Deserialize and sign transaction
        const transactionBuffer = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuffer);
        transaction.sign([wallet]);

        // Send transaction
        const signature = await connection.sendRawTransaction(
            transaction.serialize(),
            { skipPreflight: true, maxRetries: 2 }
        );

        // Confirm transaction
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            signature,
        });

        console.log(`✅ Swap successful: ${signature}`);
        return { success: true, txSignature: signature };
    } catch (error) {
        console.error('Swap execution error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get wallet balance in SOL
 */
export async function getWalletBalance(): Promise<number | null> {
    try {
        if (!config.solanaPrivateKey) return null;

        let wallet: Keypair;
        try {
            const privateKeyBytes = JSON.parse(config.solanaPrivateKey);
            wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));
        } catch {
            const bs58 = await import('bs58');
            wallet = Keypair.fromSecretKey(bs58.default.decode(config.solanaPrivateKey));
        }

        const balance = await connection.getBalance(wallet.publicKey);
        return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
        console.error('Error getting balance:', error);
        return null;
    }
}
