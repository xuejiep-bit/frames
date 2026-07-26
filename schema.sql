-- 全新安装用:在 D1 Console 一次性执行
-- 已经建过旧版 cards 表的,改用 migrate-v2.sql

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  example TEXT,
  deck TEXT DEFAULT 'default',
  due_date TEXT NOT NULL,
  interval INTEGER DEFAULT 0,
  ease_factor REAL DEFAULT 2.5,
  repetitions INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX idx_due ON cards(user_id, deleted, due_date);
CREATE INDEX idx_deck ON cards(user_id, deleted, deck);
