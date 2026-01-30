import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../../memeclaw.db');

export const db = new Database(dbPath);

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

    -- Signals log for sentiment triggers
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      tweet_id TEXT,
      author TEXT,
      content TEXT,
      sentiment_score REAL,
      action_taken TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

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
