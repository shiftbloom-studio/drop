/**
 * drop on Node.js: serves the unchanged Worker (src/index.ts) over node:http, with the bindings
 * from ./bindings.ts. Used by server.ts (the CLI / Docker entry point) and by the tests.
 */
import "./polyfills";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import worker, { type Env } from "../index";
import { FsBucket, LocalQueue, MemoryKV, MemoryRateLimit, SqliteD1 } from "./bindings";

/** Config the Worker reads as plain vars or secrets. Everything else in the environment is ignored. */
export const WORKER_VARS = [
  "API_TOKEN", "MAX_MULTIPART_MB", "MAX_STREAM_MB", "MB_AUTH_KEY", "ABUSE_EMAIL", "LEGAL",
  "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET", "BRAND", "SOURCE_URL", "OPERATOR_NAME", "OPERATOR_URL", "OPERATOR_PLACE",
  "PUBLIC_UPLOADS", "PUBLIC_MAX_MB", "PUBLIC_PASTE_KB", "PUBLIC_DAILY_UPLOADS", "PUBLIC_DAILY_MB",
] as const;

export type DropOptions = {
  /** Directory for files/ and drop.sqlite. */
  dataDir: string;
  migrationsDir: string;
  /** Worker vars and secrets (API_TOKEN is required). */
  vars: Partial<Record<(typeof WORKER_VARS)[number], string>>;
  port?: number;
  host?: string;
  /** Public origin, e.g. https://drop.example.com. Without it, links use the request's Host header. */
  publicUrl?: string;
  /**
   * Where the client IP comes from when drop runs behind a reverse proxy:
   * "x-forwarded-for" (last hop), "x-real-ip" or "cf-connecting-ip". Unset: the socket address.
   */
  trustProxy?: string;
  /** Run the hourly expiry cleanup. Default true. */
  cron?: boolean;
};

type Ctx = ExecutionContext & { settle(): Promise<void> };
function context(): Ctx {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) { pending.push(Promise.resolve(p).catch((e) => console.error("waitUntil failed", String(e)))); },
    passThroughOnException() {},
    props: {},
    async settle() { await Promise.allSettled(pending); },
  } as unknown as Ctx;
}

function clientIp(req: IncomingMessage, trust?: string) {
  const socketIp = req.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
  if (!trust) return socketIp;
  const v = req.headers[trust.toLowerCase()];
  const raw = Array.isArray(v) ? v[v.length - 1] : v;
  if (!raw) return socketIp;
  // X-Forwarded-For: the proxy appends the address it saw, so the last entry is the one to trust
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return (trust.toLowerCase() === "x-forwarded-for" ? parts[parts.length - 1] : parts[0]) || socketIp;
}

/** Counts request bytes and fails the stream past `max`, so a body without Content-Length can't fill memory. */
function capped(max: number) {
  let n = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) { n += chunk.byteLength; if (n > max) c.error(new Error("request body too large")); else c.enqueue(chunk); },
  });
}

export async function startDrop(o: DropOptions) {
  if (!o.vars.API_TOKEN || o.vars.API_TOKEN === "change-me") throw new Error("API_TOKEN is not set. Generate one with: openssl rand -base64 32");
  const filesDir = join(o.dataDir, "files");
  mkdirSync(filesDir, { recursive: true });
  const db = new SqliteD1(join(o.dataDir, "drop.sqlite"));
  const applied = db.migrate(o.migrationsDir);
  if (applied.length) console.log(`applied migrations: ${applied.join(", ")}`);

  const env = {
    ...o.vars,
    FILES: new FsBucket(filesDir),
    DB: db,
    LINKS: new MemoryKV(),
    // same limits as wrangler.jsonc
    AUTH_RL: new MemoryRateLimit(10, 60),
    MISS_RL: new MemoryRateLimit(60, 60),
    REQ_RL: new MemoryRateLimit(3, 60),
    PUB_RL: new MemoryRateLimit(6, 60),
  } as Record<string, unknown>;
  const queue = new LocalQueue<{ type: "scan" | "analyze"; id: string }>("drop-jobs", () => (batch) => worker.queue(batch as never, env as unknown as Env), 3);
  env.JOBS = queue;
  const typedEnv = env as unknown as Env;

  const maxBody = (Math.max(Number(o.vars.MAX_STREAM_MB || 500), Number(o.vars.MAX_MULTIPART_MB || 95)) + 1) * 1024 * 1024;
  const fixedOrigin = o.publicUrl ? new URL(o.publicUrl).origin : null;

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const len = Number(req.headers["content-length"] || 0);
    if (len > maxBody) { res.writeHead(413, { "content-type": "text/plain", connection: "close" }).end("request body too large\n"); return; }
    let url: URL;
    try {
      const proto = o.trustProxy && req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      url = new URL(req.url || "/", fixedOrigin ?? `${proto}://${req.headers.host || "localhost"}`);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" }).end("bad request\n");
      return;
    }
    const headers = new Headers();
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i].toLowerCase();
      if (k === "host" || k === "cf-connecting-ip" || k.startsWith(":")) continue;
      headers.append(k, req.rawHeaders[i + 1]);
    }
    // the Worker reads the client address from cf-connecting-ip, as set by Cloudflare's edge
    headers.set("cf-connecting-ip", clientIp(req, o.trustProxy));
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>).pipeThrough(capped(maxBody)) : undefined,
      duplex: "half",
    } as RequestInit);
    const ctx = context();
    const response = await worker.fetch(request, typedEnv, ctx);
    const out: Record<string, string | string[]> = {};
    response.headers.forEach((v, k) => { if (k !== "set-cookie") out[k] = v; });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    // an answer that didn't read the whole body (refused upload, 413): close instead of reusing the socket
    if (hasBody && !req.complete) out.connection = "close";
    res.writeHead(response.status, out);
    if (response.body && req.method !== "HEAD") {
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          if (!res.write(chunk)) await new Promise((r) => res.once("drain", r));
          if (res.destroyed) break;
        }
      } catch (e) {
        res.destroy(e as Error);
      }
    }
    res.end();
    void ctx.settle();
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error("request failed", String(e));
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" }).end('{"error":"internal error"}');
      else res.destroy();
    });
  });
  server.requestTimeout = 0; // large uploads may take a while; idle sockets still time out
  server.headersTimeout = 60_000;

  const runCleanup = () => {
    const ctx = context();
    worker.scheduled({ cron: "17 * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, typedEnv, ctx);
    return ctx.settle();
  };
  const cron = o.cron === false ? null : setInterval(runCleanup, 3600_000);
  cron?.unref();

  await new Promise<void>((resolve) => server.listen(o.port ?? 8787, o.host ?? "0.0.0.0", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : o.port ?? 8787;

  return {
    server, env: typedEnv, queue, db, port,
    url: `http://127.0.0.1:${port}`,
    runCleanup,
    async close() {
      if (cron) clearInterval(cron);
      await new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections();
      await queue.drain();
      db.close();
    },
  };
}
