/**
 * The few Workers runtime globals drop uses that Node.js doesn't have.
 * Installed once, before the Worker code runs. Nothing here is used on Cloudflare.
 */
import { createHash } from "node:crypto";

/** Passes bytes through and fails the stream when the total is not exactly `length`. */
class FixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(length: number | bigint) {
    const expected = Number(length);
    let seen = 0;
    super({
      transform(chunk, c) {
        seen += chunk.byteLength;
        if (seen > expected) return c.error(new Error(`body is longer than the declared ${expected} bytes`));
        c.enqueue(chunk);
      },
      flush(c) {
        if (seen !== expected) c.error(new Error(`body is ${seen} bytes, expected ${expected}`));
      },
    });
  }
}

/** crypto.DigestStream: a WritableStream whose `digest` resolves to the hash of everything written. */
class DigestStream extends WritableStream<ArrayBuffer | ArrayBufferView> {
  readonly digest: Promise<ArrayBuffer>;
  constructor(algorithm: string | { name: string }) {
    const name = (typeof algorithm === "string" ? algorithm : algorithm.name).toLowerCase().replace("-", "");
    const hash = createHash(name);
    let resolve!: (b: ArrayBuffer) => void, reject!: (e: unknown) => void;
    const digest = new Promise<ArrayBuffer>((res, rej) => { resolve = res; reject = rej; });
    super({
      write(chunk) { hash.update(ArrayBuffer.isView(chunk) ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength) : new Uint8Array(chunk)); },
      close() { const b = hash.digest(); resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); },
      abort(e) { reject(e); },
    });
    this.digest = digest;
  }
}

/** caches.default, kept in memory. drop only caches proxied fonts and highlight.js in it. */
class MemoryCache {
  private store = new Map<string, { body: ArrayBuffer; status: number; headers: [string, string][] }>();
  constructor(private max = 200) {}
  async match(req: Request | string) {
    const hit = this.store.get(typeof req === "string" ? req : req.url);
    return hit ? new Response(hit.body, { status: hit.status, headers: hit.headers }) : undefined;
  }
  async put(req: Request | string, res: Response) {
    const key = typeof req === "string" ? req : req.url;
    const body = await res.arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) return;
    this.store.delete(key);
    this.store.set(key, { body, status: res.status, headers: [...res.headers] });
    while (this.store.size > this.max) this.store.delete(this.store.keys().next().value!);
  }
  async delete(req: Request | string) { return this.store.delete(typeof req === "string" ? req : req.url); }
}

export function installPolyfills() {
  const g = globalThis as Record<string, unknown>;
  if (!g.FixedLengthStream) g.FixedLengthStream = FixedLengthStream;
  const c = (g as { crypto: unknown }).crypto as unknown as Record<string, unknown>;
  if (!c.DigestStream) Object.defineProperty(c, "DigestStream", { value: DigestStream, configurable: true });
  if (!g.caches) g.caches = { default: new MemoryCache(), open: async () => new MemoryCache() };
}

installPolyfills();
