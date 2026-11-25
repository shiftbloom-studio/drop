-- Who uploaded an item: 'master' for the API_TOKEN secret, otherwise api_tokens.id.
-- Each token sees only its own items in /api/list. Items from before this migration have no owner
-- and stay visible to the master token only.
ALTER TABLE items ADD COLUMN owner TEXT;
CREATE INDEX IF NOT EXISTS items_owner ON items (owner, created_at);
