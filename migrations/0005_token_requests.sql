-- Token requests from the public form at /request. An admin hub (for example field) approves or
-- rejects them; the requester then collects the token once through a private claim link.
-- Only the SHA-256 of the claim code is stored. The token itself is generated when it is collected
-- and goes into api_tokens like any other named token.
CREATE TABLE IF NOT EXISTS token_requests (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  reason           TEXT NOT NULL,
  claim_hash       TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'claimed')),
  label            TEXT,                -- label of the token that will be issued (set on approval)
  token_expires_at INTEGER,             -- expiry of that token, unix seconds, NULL = never
  created_at       INTEGER NOT NULL,
  decided_at       INTEGER,
  claimed_at       INTEGER,
  token_id         TEXT                 -- api_tokens.id once collected
);
CREATE INDEX IF NOT EXISTS token_requests_status ON token_requests (status, created_at);
