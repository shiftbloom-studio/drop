/**
 * Stand-ins for the Cloudflare bindings drop uses, so the same Worker code runs on Node.js:
 *
 * - FILES (R2)   → a directory on disk
 * - DB (D1)      → a SQLite file (node:sqlite, no native modules)
 * - LINKS (KV)   → an in-memory cache (KV only ever holds copies of D1 rows)
 * - JOBS (Queue) → an in-process queue with retries
 * - *_RL         → in-memory fixed-window rate limiters
 *
 * Each class implements only the parts of the binding API that drop calls.
 */
import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// ---------- R2 → filesystem ----------
type Meta = { key: string; size: number; etag: string; uploaded: number; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> };
type Range = { offset?: number; length?: number; suffix?: number };
type GetOptions = { range?: Range | Headers; onlyIf?: Headers | { etagDoesNotMatch?: string } };

/** Parses a single-range `Range: bytes=…` header. Anything else means "the whole object", as on R2. */
export function parseRangeHeader(h: string | null): Range | undefined {
  const m = h ? /^bytes=(\d*)-(\d*)$/.exec(h.trim()) : null;
  if (!m || (!m[1] && !m[2])) return undefined;
  if (!m[1]) return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  return m[2] ? { offset, length: Math.max(0, Number(m[2]) - offset + 1) } : { offset };
}

class FsObject {
  readonly key: string; readonly size: number; readonly etag: string; readonly httpEtag: string;
  readonly uploaded: Date; readonly httpMetadata: { contentType?: string }; readonly customMetadata: Record<string, string>;
  range?: { offset: number; length: number };
  constructor(m: Meta) {
    this.key = m.key; this.size = m.size; this.etag = m.etag; this.httpEtag = `"${m.etag}"`;
    this.uploaded = new Date(m.uploaded); this.httpMetadata = m.httpMetadata ?? {}; this.customMetadata = m.customMetadata ?? {};
  }
  writeHttpMetadata(h: Headers) { if (this.httpMetadata.contentType) h.set("content-type", this.httpMetadata.contentType); }
}

class FsObjectBody extends FsObject {
  readonly body: ReadableStream<Uint8Array>;
  private used = false;
  constructor(m: Meta, private file: string, range?: { offset: number; length: number }) {
    super(m);
    this.range = range;
    const start = range?.offset ?? 0, len = range?.length ?? m.size;
    this.body = len === 0
      ? new ReadableStream({ start: (c) => c.close() })
      : (Readable.toWeb(createReadStream(file, { start, end: start + len - 1 })) as unknown as ReadableStream<Uint8Array>);
  }
  get bodyUsed() { return this.used; }
  async arrayBuffer() { this.used = true; return new Response(this.body).arrayBuffer(); }
  async text() { return new TextDecoder().decode(await this.arrayBuffer()); }
  async json<T>() { return JSON.parse(await this.text()) as T; }
  async blob() { return new Blob([await this.arrayBuffer()], { type: this.httpMetadata.contentType }); }
}

/**
 * Objects are stored under the SHA-256 of their key, so no key (user file names included) can
 * ever reach outside the directory. A JSON file next to each blob holds the key and metadata.
 */
export class FsBucket {
  constructor(private root: string) {}
  private paths(key: string) {
    const h = createHash("sha256").update(key).digest("hex");
    const base = join(this.root, h.slice(0, 2), h);
    return { blob: `${base}.bin`, meta: `${base}.json` };
  }
  private async meta(key: string): Promise<Meta | null> {
    try { return JSON.parse(await readFile(this.paths(key).meta, "utf8")) as Meta; } catch { return null; }
  }

  async head(key: string) { const m = await this.meta(key); return m ? new FsObject(m) : null; }

  async get(key: string, opts: GetOptions = {}) {
    const m = await this.meta(key);
    if (!m) return null;
    const only = opts.onlyIf;
    const inm = only instanceof Headers ? only.get("if-none-match") : only?.etagDoesNotMatch ? `"${only.etagDoesNotMatch}"` : null;
    if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === `"${m.etag}"` || t.trim() === "*")) return new FsObject(m);
    const r = opts.range instanceof Headers ? parseRangeHeader(opts.range.get("range")) : opts.range;
    let range: { offset: number; length: number } | undefined;
    if (r) {
      if (r.suffix !== undefined) { const length = Math.min(r.suffix, m.size); range = { offset: m.size - length, length }; }
      else {
        const offset = Math.min(r.offset ?? 0, m.size);
        range = { offset, length: Math.min(r.length ?? m.size - offset, m.size - offset) };
      }
    }
    return new FsObjectBody(m, this.paths(key).blob, range);
  }

  async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
    opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> } = {}) {
    const p = this.paths(key);
    await mkdir(dirname(p.blob), { recursive: true });
    const tmp = `${p.blob}.${randomUUID()}.tmp`;
    const hash = createHash("md5");
    let size = 0;
    const fh = await open(tmp, "w");
    try {
      const write = async (chunk: Uint8Array) => { hash.update(chunk); size += chunk.byteLength; await fh.write(chunk); };
      if (value instanceof ReadableStream) { for await (const chunk of value as unknown as AsyncIterable<Uint8Array>) await write(chunk); }
      else if (typeof value === "string") await write(new TextEncoder().encode(value));
      else if (value instanceof Blob) await write(new Uint8Array(await value.arrayBuffer()));
      else if (value instanceof ArrayBuffer) await write(new Uint8Array(value));
      else if (value) await write(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      await fh.close();
    } catch (e) {
      await fh.close().catch(() => {});
      await rm(tmp, { force: true });
      throw e;
    }
    const meta: Meta = { key, size, etag: hash.digest("hex"), uploaded: Date.now(), httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata };
    await rename(tmp, p.blob);
    await writeFile(p.meta, JSON.stringify(meta));
    return new FsObject(meta);
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const p = this.paths(key);
      await rm(p.meta, { force: true });
      await rm(p.blob, { force: true });
    }
  }
}

// ---------- D1 → SQLite ----------
type Meta1 = { changes: number; last_row_id: number; duration: number; rows_read: number; rows_written: number };
const toSql = (v: unknown): SQLInputValue => {
  if (v === undefined) throw new TypeError("D1_TYPE_ERROR: undefined is not a supported value");
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v as SQLInputValue;
};
const plain = <T>(r: unknown) => (r ? ({ ...(r as object) } as T) : null);

class SqliteStatement {
  constructor(private db: DatabaseSync, readonly sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) { return new SqliteStatement(this.db, this.sql, args); }
  private stmt() { return this.db.prepare(this.sql); }
  private params() { return this.args.map(toSql); }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = plain<Record<string, unknown>>(this.stmt().get(...this.params()));
    if (!row) return null;
    return (column ? (row[column] as T) ?? null : (row as T));
  }
  async all<T = Record<string, unknown>>() { return this.allSync<T>(); }
  allSync<T>() {
    const results = (this.stmt().all(...this.params()) as unknown[]).map((r) => plain<T>(r)!);
    return { success: true as const, results, meta: { changes: 0, last_row_id: 0, duration: 0, rows_read: results.length, rows_written: 0 } as Meta1 };
  }
  async run() { return this.runSync(); }
  runSync() {
    const s = this.stmt();
    // statements that return rows (INSERT … RETURNING, SELECT) go through all() so the rows are kept
    if (s.columns().length) return this.allSync();
    const r = s.run(...this.params());
    return { success: true as const, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), duration: 0, rows_read: 0, rows_written: Number(r.changes) } as Meta1 };
  }
  async raw<T = unknown[]>() { return (this.stmt().all(...this.params()) as Record<string, unknown>[]).map((r) => Object.values(r) as T); }
}

export class SqliteD1 {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  }
  prepare(sql: string) { return new SqliteStatement(this.db, sql); }
  /** Runs all statements in one transaction, like D1. */
  async batch(stmts: SqliteStatement[]) {
    this.db.exec("BEGIN");
    try {
      const out = stmts.map((s) => s.runSync());
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(sql: string) { this.db.exec(sql); return { count: 1, duration: 0 }; }
  close() { this.db.close(); }

  /** Applies migrations/*.sql in order, recorded in d1_migrations like `wrangler d1 migrations apply`. */
  migrate(dir: string) {
    this.db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`);
    const done = new Set((this.db.prepare("SELECT name FROM d1_migrations").all() as { name: string }[]).map((r) => r.name));
    const applied: string[] = [];
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(name)) continue;
      this.db.exec("BEGIN");
      try {
        this.db.exec(readFileSync(join(dir, name), "utf8"));
        this.db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
        this.db.exec("COMMIT");
        applied.push(name);
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw new Error(`migration ${name} failed: ${String(e)}`);
      }
    }
    return applied;
  }
}

// ---------- KV → memory ----------
/** drop uses KV only as a read cache in front of D1, so losing it on restart is fine. */
export class MemoryKV {
  private store = new Map<string, { value: string; expires: number | null }>();
  constructor(private max = 10000) {}
  async get(key: string, opts?: "text" | "json" | { type?: "text" | "json"; cacheTtl?: number }) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expires && e.expires <= Date.now() / 1000) { this.store.delete(key); return null; }
    const type = typeof opts === "string" ? opts : opts?.type;
    return type === "json" ? JSON.parse(e.value) : e.value;
  }
  async put(key: string, value: string, opts: { expiration?: number; expirationTtl?: number } = {}) {
    const expires = opts.expiration ?? (opts.expirationTtl ? Math.floor(Date.now() / 1000) + opts.expirationTtl : null);
    this.store.delete(key);
    this.store.set(key, { value: String(value), expires });
    while (this.store.size > this.max) this.store.delete(this.store.keys().next().value!);
  }
  async delete(key: string) { this.store.delete(key); }
}

// ---------- Queue → in-process ----------
type Consumer<T> = (batch: { queue: string; messages: Message<T>[]; ackAll(): void; retryAll(): void }) => Promise<void>;
type Message<T> = { id: string; timestamp: Date; body: T; attempts: number; ack(): void; retry(o?: { delaySeconds?: number }): void };

/** Messages are handled one at a time, retried up to `maxRetries` times, like the Cloudflare consumer config. */
export class LocalQueue<T> {
  private pending = new Set<Promise<void>>();
  private timers = new Set<NodeJS.Timeout>();
  private closed = false;
  constructor(private name: string, private consumer: () => Consumer<T>, private maxRetries = 3) {}
  async send(body: T) { this.deliver(body, 1); }
  async sendBatch(msgs: { body: T }[]) { for (const m of msgs) this.deliver(m.body, 1); }
  private deliver(body: T, attempts: number) {
    if (this.closed) return;
    let retryIn: number | null = null;
    const msg: Message<T> = {
      id: randomUUID(), timestamp: new Date(), body, attempts,
      ack() {}, retry(o) { retryIn = o?.delaySeconds ?? 10; },
    };
    const run = (async () => {
      await new Promise((r) => setImmediate(r));
      try {
        await this.consumer()({ queue: this.name, messages: [msg], ackAll() {}, retryAll() { retryIn = 10; } });
      } catch (e) {
        console.error("queue consumer failed", String(e));
        retryIn = 10;
      }
      if (retryIn !== null && attempts <= this.maxRetries) {
        const t = setTimeout(() => { this.timers.delete(t); this.deliver(body, attempts + 1); }, retryIn * 1000);
        this.timers.add(t);
      }
    })();
    this.pending.add(run);
    run.finally(() => this.pending.delete(run));
  }
  /** Waits for running jobs; drops scheduled retries. */
  async drain() { this.closed = true; for (const t of this.timers) clearTimeout(t); await Promise.allSettled([...this.pending]); }
  /** For tests: wait until nothing is running. */
  async idle() { while (this.pending.size) await Promise.allSettled([...this.pending]); }
}

// ---------- rate limiting → memory ----------
export class MemoryRateLimit {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limitPer: number, private periodSeconds: number) {}
  async limit({ key }: { key: string }) {
    const now = Date.now();
    if (this.hits.size > 50000) for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    const e = this.hits.get(key);
    if (!e || e.reset <= now) { this.hits.set(key, { n: 1, reset: now + this.periodSeconds * 1000 }); return { success: true }; }
    e.n++;
    return { success: e.n <= this.limitPer };
  }
}
