-- 全新安装用:在 D1 Console 一次性执行
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
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
CREATE INDEX idx_due ON cards(deleted, due_date);
CREATE INDEX idx_deck ON cards(deleted, deck);
