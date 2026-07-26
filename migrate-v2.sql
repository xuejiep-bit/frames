-- 从「单一共享密码」升级到「多用户账户」
-- 已经执行过旧版 schema.sql 的库,在 D1 Console 执行这个文件(只需一次)

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

ALTER TABLE cards ADD COLUMN user_id TEXT;

DROP INDEX IF EXISTS idx_due;
DROP INDEX IF EXISTS idx_deck;
CREATE INDEX idx_due ON cards(user_id, deleted, due_date);
CREATE INDEX idx_deck ON cards(user_id, deleted, deck);

-- 如果升级前已经有卡片:先在网站上注册你的账号,然后回来执行下面这行,
-- 把这些"无主"卡片划归你的账号(把 你的用户名 换成实际注册的用户名):
--
-- UPDATE cards SET user_id = (SELECT id FROM users WHERE username = '你的用户名')
-- WHERE user_id IS NULL;
