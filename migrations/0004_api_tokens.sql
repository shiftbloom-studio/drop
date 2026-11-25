-- Named API tokens with an expiry date, issued from an admin hub (for example field).
-- Only the SHA-256 of a token is stored; the plain token is shown once when it is created.
-- The API_TOKEN secret keeps working as the owner's master token.
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  prefix       TEXT NOT NULL,          -- first characters of the token, for recognising it in lists
  hash         TEXT NOT NULL UNIQUE,   -- hex SHA-256 of the full token
  created_at   INTEGER NOT NULL,       -- unix seconds
  created_by   TEXT,
  expires_at   INTEGER,                -- unix seconds, NULL = never
  last_used_at INTEGER,
  revoked_at   INTEGER
);
