import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config.js';
import { db } from '../db/sqlite.js';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

// Initialize wallets table
export function initWalletsTable() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      label TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
    // Create index
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);`);
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
export function saveUserWallet(userId: number, publicKey: string, privateKey: string, label?: string) {
    // Check if user has any wallets
    const count = db.prepare('SELECT COUNT(*) as cnt FROM wallets WHERE user_id = ?').get(userId) as { cnt: number };
    const isActive = count.cnt === 0 ? 1 : 0; // First wallet is active by default

    const stmt = db.prepare(`
        INSERT INTO wallets (user_id, public_key, private_key, is_active, label)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, publicKey, privateKey, isActive, label || `Wallet ${count.cnt + 1}`);
}

/**
 * Get active wallet for a user
 */
export function getUserWallet(userId: number): { publicKey: string; privateKey: string; id: number; label: string } | null {
    const stmt = db.prepare('SELECT id, public_key, private_key, label FROM wallets WHERE user_id = ? AND is_active = 1');
    const row = stmt.get(userId) as { id: number; public_key: string; private_key: string; label: string } | undefined;

    if (!row) {
        // Fallback to first wallet if no active one found
        const first = db.prepare('SELECT id, public_key, private_key, label FROM wallets WHERE user_id = ? LIMIT 1').get(userId) as any;
        if (!first) return null;
        return {
            id: first.id,
            publicKey: first.public_key,
            privateKey: first.private_key,
            label: first.label,
        };
    }

    return {
        id: row.id,
        publicKey: row.public_key,
        privateKey: row.private_key,
        label: row.label,
    };
}

/**
 * Get all wallets for a user
 */
export function getUserWallets(userId: number): { id: number; publicKey: string; label: string; isActive: boolean }[] {
    const stmt = db.prepare('SELECT id, public_key, label, is_active FROM wallets WHERE user_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(userId) as any[];

    return rows.map(r => ({
        id: r.id,
        publicKey: r.public_key,
        label: r.label,
        isActive: r.is_active === 1
    }));
}

/**
 * Switch active wallet
 */
export function switchActiveWallet(userId: number, walletId: number) {
    db.transaction(() => {
        db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?').run(userId);
        db.prepare('UPDATE wallets SET is_active = 1 WHERE user_id = ? AND id = ?').run(userId, walletId);
    })();
}

/**
 * Delete a specific wallet
 */
export function deleteWallet(userId: number, walletId: number) {
    const stmt = db.prepare('DELETE FROM wallets WHERE user_id = ? AND id = ?');
    stmt.run(userId, walletId);

    // If we deleted the active wallet, set another one as active
    const active = db.prepare('SELECT id FROM wallets WHERE user_id = ? AND is_active = 1').get(userId);
    if (!active) {
        const first = db.prepare('SELECT id FROM wallets WHERE user_id = ? LIMIT 1').get(userId) as any;
        if (first) {
            db.prepare('UPDATE wallets SET is_active = 1 WHERE id = ?').run(first.id);
        }
    }
}

/**
 * Keep for backward compatibility but redirect to deleteWallet
 */
export function deleteUserWallet(userId: number) {
    const wallet = getUserWallet(userId);
    if (wallet) {
        deleteWallet(userId, wallet.id);
    }
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

