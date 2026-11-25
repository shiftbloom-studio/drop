-- drop: D1 schema (source of truth for all items)
CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('file', 'paste', 'link')),
  r2_key       TEXT,
  name         TEXT,
  mime         TEXT,
  size         INTEGER NOT NULL DEFAULT 0,
  target       TEXT,
  lang         TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER,
  delete_token TEXT NOT NULL,
  thumb_key    TEXT,
  alt          TEXT,
  nsfw         INTEGER,
  views        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_expires ON items (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_created ON items (created_at DESC);
