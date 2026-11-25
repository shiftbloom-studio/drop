-- quarantine reason (null = fine) and content hash for malware lookups
ALTER TABLE items ADD COLUMN blocked TEXT;
ALTER TABLE items ADD COLUMN sha256 TEXT;
