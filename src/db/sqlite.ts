import Database, { Database as DatabaseType } from 'better-sqlite3';
import { dirname, join, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve database path
const absoluteDbPath = isAbsolute(config.dbPath)
  ? config.dbPath
  : join(__dirname, '../../', config.dbPath);

// Ensure directory exists
const dbDir = dirname(absoluteDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: DatabaseType = new Database(absoluteDbPath);

// Initialize database schema - MUST be called before using any helpers
export function initDatabase() {
  db.exec(`
    -- Positions table for tracking trades
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT NOT NULL,
      token_symbol TEXT,
      buy_amount_sol REAL NOT NULL,
      buy_price REAL,
      buy_tx TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      sell_tx TEXT,
      pnl_sol REAL
    );

    -- Watchlist for keywords and influencers
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Wallets table
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      label TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Twitter accounts table for per-user posting
    CREATE TABLE IF NOT EXISTS twitter_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      access_secret TEXT NOT NULL,
      username TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Pending Twitter auths for OAuth flow
    CREATE TABLE IF NOT EXISTS pending_auths (
      user_id INTEGER PRIMARY KEY,
      request_token TEXT NOT NULL,
      request_secret TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: If wallets table exists with old schema, we might need a backup or manual fix
  // For now, assume fresh or simple expansion if possible. 
  // SQLite doesn't support DROP COLUMN easily, so we usually rename/copy.

  // Create index for fast lookups
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);`);

  // Check if default watchlist items exist
  const count = db.prepare('SELECT COUNT(*) as cnt FROM watchlist').get() as { cnt: number };
  if (count.cnt === 0) {
    db.exec(`
      INSERT INTO watchlist (type, value, weight) VALUES 
        ('keyword', '$PENGU', 1.0),
        ('keyword', 'penguin', 0.8),
        ('keyword', 'memecoin', 0.5);
    `);
  }

  console.log('📦 Database initialized');
}

// Lazy-loaded prepared statements
let _positionsStatements: any = null;
let _watchlistStatements: any = null;
let _signalsStatements: any = null;

// Position helpers - lazy initialization
export const positions = {
  get create() {
    if (!_positionsStatements) _positionsStatements = {};
    if (!_positionsStatements.create) {
      _positionsStatements.create = db.prepare(`
        INSERT INTO positions (token_address, token_symbol, buy_amount_sol, buy_tx, status)
        VALUES (@tokenAddress, @tokenSymbol, @buyAmountSol, @buyTx, 'open')
      `);
    }
    return _positionsStatements.create;
  },

  get getOpen() {
    if (!_positionsStatements) _positionsStatements = {};
    if (!_positionsStatements.getOpen) {
      _positionsStatements.getOpen = db.prepare(`
        SELECT * FROM positions WHERE status = 'open'
      `);
    }
    return _positionsStatements.getOpen;
  },

  get getAll() {
    if (!_positionsStatements) _positionsStatements = {};
    if (!_positionsStatements.getAll) {
      _positionsStatements.getAll = db.prepare(`
        SELECT * FROM positions ORDER BY created_at DESC LIMIT 20
      `);
    }
    return _positionsStatements.getAll;
  },

  get close() {
    if (!_positionsStatements) _positionsStatements = {};
    if (!_positionsStatements.close) {
      _positionsStatements.close = db.prepare(`
        UPDATE positions 
        SET status = 'closed', closed_at = CURRENT_TIMESTAMP, sell_tx = @sellTx, pnl_sol = @pnlSol
        WHERE id = @id
      `);
    }
    return _positionsStatements.close;
  },
};

// Watchlist helpers - lazy initialization
export const watchlist = {
  get getActive() {
    if (!_watchlistStatements) _watchlistStatements = {};
    if (!_watchlistStatements.getActive) {
      _watchlistStatements.getActive = db.prepare(`
        SELECT * FROM watchlist WHERE active = 1
      `);
    }
    return _watchlistStatements.getActive;
  },

  get add() {
    if (!_watchlistStatements) _watchlistStatements = {};
    if (!_watchlistStatements.add) {
      _watchlistStatements.add = db.prepare(`
        INSERT INTO watchlist (type, value, weight) VALUES (@type, @value, @weight)
      `);
    }
    return _watchlistStatements.add;
  },

  get remove() {
    if (!_watchlistStatements) _watchlistStatements = {};
    if (!_watchlistStatements.remove) {
      _watchlistStatements.remove = db.prepare(`
        DELETE FROM watchlist WHERE id = @id
      `);
    }
    return _watchlistStatements.remove;
  },
};

// Signals helpers - lazy initialization
export const signals = {
  get log() {
    if (!_signalsStatements) _signalsStatements = {};
    if (!_signalsStatements.log) {
      _signalsStatements.log = db.prepare(`
        INSERT INTO signals (source, tweet_id, author, content, sentiment_score, action_taken)
        VALUES (@source, @tweetId, @author, @content, @sentimentScore, @actionTaken)
      `);
    }
    return _signalsStatements.log;
  },

  get getRecent() {
    if (!_signalsStatements) _signalsStatements = {};
    if (!_signalsStatements.getRecent) {
      _signalsStatements.getRecent = db.prepare(`
        SELECT * FROM signals ORDER BY created_at DESC LIMIT 10
      `);
    }
    return _signalsStatements.getRecent;
  },
};

// Twitter account helpers
let _twitterStatements: any = null;
export const twitterAccounts = {
  get get() {
    if (!_twitterStatements) _twitterStatements = {};
    if (!_twitterStatements.get) {
      _twitterStatements.get = db.prepare(`
        SELECT * FROM twitter_accounts WHERE user_id = @userId
      `);
    }
    return _twitterStatements.get;
  },

  get upsert() {
    if (!_twitterStatements) _twitterStatements = {};
    if (!_twitterStatements.upsert) {
      _twitterStatements.upsert = db.prepare(`
        INSERT INTO twitter_accounts (user_id, access_token, access_secret, username)
        VALUES (@userId, @accessToken, @accessSecret, @username)
        ON CONFLICT(user_id) DO UPDATE SET
          access_token = excluded.access_token,
          access_secret = excluded.access_secret,
          username = excluded.username
      `);
    }
    return _twitterStatements.upsert;
  },

  get remove() {
    if (!_twitterStatements) _twitterStatements = {};
    if (!_twitterStatements.remove) {
      _twitterStatements.remove = db.prepare(`
        DELETE FROM twitter_accounts WHERE user_id = @userId
      `);
    }
    return _twitterStatements.remove;
  },
};

// Pending auth helpers
export const pendingAuths = {
  get upsert() {
    if (!_twitterStatements) _twitterStatements = {};
    if (!_twitterStatements.upsertAuth) {
      _twitterStatements.upsertAuth = db.prepare(`
        INSERT INTO pending_auths (user_id, request_token, request_secret)
        VALUES (@userId, @requestToken, @requestSecret)
        ON CONFLICT(user_id) DO UPDATE SET
          request_token = excluded.request_token,
          request_secret = excluded.request_secret,
          created_at = CURRENT_TIMESTAMP
      `);
    }
    return _twitterStatements.upsertAuth;
  },

  get get() {
    if (!_twitterStatements) _twitterStatements = {};
    if (!_twitterStatements.getAuth) {
      _twitterStatements.getAuth = db.prepare(`
        SELECT * FROM pending_auths WHERE user_id = @userId
      `);
    }
    return _twitterStatements.getAuth;
  },

  get remove() {
    if (!_twitterStatements) _twitterStatements = {};
    if (!_twitterStatements.removeAuth) {
      _twitterStatements.removeAuth = db.prepare(`
        DELETE FROM pending_auths WHERE user_id = @userId
      `);
    }
    return _twitterStatements.removeAuth;
  },
};
