-- Daily upload counter for public uploads (no token), per IP address and UTC day.
-- `key` is a SHA-256 of the day, the address and a server secret, never the address itself.
-- Rows older than two days are deleted by the hourly cleanup.
CREATE TABLE IF NOT EXISTS public_usage (
  key     TEXT NOT NULL,
  day     INTEGER NOT NULL,
  uploads INTEGER NOT NULL DEFAULT 0,
  bytes   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
CREATE INDEX IF NOT EXISTS public_usage_day ON public_usage (day);
