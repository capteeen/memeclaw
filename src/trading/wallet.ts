import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config.js';
import { db } from '../db/sqlite.js';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

// Initialize wallets table
export function initWalletsTable() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id INTEGER PRIMARY KEY,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Generate a new Solana wallet
 */
export function generateWallet(): { publicKey: string; privateKey: string } {
    const keypair = Keypair.generate();

    // Convert to base58 for storage
    const privateKeyBase58 = bs58.encode(keypair.secretKey);

    return {
        publicKey: keypair.publicKey.toBase58(),
        privateKey: privateKeyBase58,
    };
}

/**
 * Import a wallet from private key
 */
export function importWallet(privateKeyBase58: string): { publicKey: string; privateKey: string } | null {
    try {
        const privateKeyBytes = bs58.decode(privateKeyBase58);
        const keypair = Keypair.fromSecretKey(privateKeyBytes);

        return {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: privateKeyBase58,
        };
    } catch (error) {
        console.error('Invalid private key:', error);
        return null;
    }
}

/**
 * Save wallet for a user
 */
export function saveUserWallet(userId: number, publicKey: string, privateKey: string) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO wallets (user_id, public_key, private_key)
    VALUES (?, ?, ?)
  `);
    stmt.run(userId, publicKey, privateKey);
}

/**
 * Get wallet for a user
 */
export function getUserWallet(userId: number): { publicKey: string; privateKey: string } | null {
    const stmt = db.prepare('SELECT public_key, private_key FROM wallets WHERE user_id = ?');
    const row = stmt.get(userId) as { public_key: string; private_key: string } | undefined;

    if (!row) return null;

    return {
        publicKey: row.public_key,
        privateKey: row.private_key,
    };
}

/**
 * Delete wallet for a user
 */
export function deleteUserWallet(userId: number) {
    const stmt = db.prepare('DELETE FROM wallets WHERE user_id = ?');
    stmt.run(userId);
}

/**
 * Get wallet balance in SOL
 */
export async function getWalletBalance(publicKey: string): Promise<number> {
    try {
        const { PublicKey } = await import('@solana/web3.js');
        const pubKey = new PublicKey(publicKey);
        const balance = await connection.getBalance(pubKey);
        return balance / LAMPORTS_PER_SOL;
    } catch (error) {
        console.error('Error getting balance:', error);
        return 0;
    }
}

/**
 * Get Keypair from stored private key
 */
export function getKeypairFromPrivateKey(privateKeyBase58: string): Keypair | null {
    try {
        const privateKeyBytes = bs58.decode(privateKeyBase58);
        return Keypair.fromSecretKey(privateKeyBytes);
    } catch {
        return null;
    }
}

/**
 * Transfer SOL from a bot wallet to an external address
 */
export async function transferSol(
    senderPrivateKey: string,
    toAddress: string,
    amountSol: number
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
    try {
        const { Transaction, SystemProgram, PublicKey, sendAndConfirmTransaction } = await import('@solana/web3.js');
        const bs58 = (await import('bs58')).default;

        const senderKeypair = Keypair.fromSecretKey(bs58.decode(senderPrivateKey));
        const toPubKey = new PublicKey(toAddress);

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: senderKeypair.publicKey,
                toPubkey: toPubKey,
                lamports: Math.floor(amountSol * LAMPORTS_PER_SOL),
            })
        );

        const signature = await sendAndConfirmTransaction(connection, transaction, [senderKeypair]);

        return { success: true, txSignature: signature };
    } catch (error) {
        console.error('Transfer error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

