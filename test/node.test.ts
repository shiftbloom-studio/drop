import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsBucket, MemoryKV, MemoryRateLimit, SqliteD1, parseRangeHeader } from "../src/node/bindings";
import { startDrop } from "../src/node/app";
import { brandFrom } from "../src/brand";
import { sha256Hex } from "../src/util";

const MASTER = "master-token-for-tests-0123456789";
const migrations = join(__dirname, "..", "migrations");
const text = (o: unknown) => (o as { text(): Promise<string> }).text();

describe("filesystem bucket", () => {
  const dir = mkdtempSync(join(tmpdir(), "drop-r2-"));
  const b = new FsBucket(join(dir, "files"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("stores, reads ranges and deletes", async () => {
    await b.put("f/abc/hello.txt", "hello world", { httpMetadata: { contentType: "text/plain" }, customMetadata: { id: "abc" } });
    const all = await b.get("f/abc/hello.txt");
    expect(await text(all)).toBe("hello world");
    expect(all!.size).toBe(11);
    expect(all!.customMetadata.id).toBe("abc");
    const part = await b.get("f/abc/hello.txt", { range: new Headers({ range: "bytes=6-" }) });
    expect(part!.range).toEqual({ offset: 6, length: 5 });
    expect(await text(part)).toBe("world");
    const tail = await b.get("f/abc/hello.txt", { range: { suffix: 3 } });
    expect(await text(tail)).toBe("rld");
    await b.delete(["f/abc/hello.txt"]);
    expect(await b.get("f/abc/hello.txt")).toBeNull();
  });

  it("answers a matching If-None-Match without a body", async () => {
    const o = await b.put("p/x.txt", "x");
    const r = await b.get("p/x.txt", { onlyIf: new Headers({ "if-none-match": o.httpEtag }) });
    expect(r && "body" in r).toBe(false);
  });

  it("keeps every key inside its directory, whatever the file name", async () => {
    await b.put("f/id/..", "a");
    await b.put("f/id/../../../escape", "b");
    for (const name of readdirSync(join(dir, "files"))) expect(name).toMatch(/^[0-9a-f]{2}$/);
    expect(readdirSync(dir)).toEqual(["files"]);
    expect(await text(await b.get("f/id/../../../escape"))).toBe("b");
  });

  it("parses Range headers like R2", () => {
    expect(parseRangeHeader("bytes=0-3")).toEqual({ offset: 0, length: 4 });
    expect(parseRangeHeader("bytes=-10")).toEqual({ suffix: 10 });
    expect(parseRangeHeader("bytes=1-2,4-5")).toBeUndefined();
    expect(parseRangeHeader(null)).toBeUndefined();
  });
});

describe("sqlite D1", () => {
  it("rolls a batch back when one statement fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drop-d1-"));
    const db = new SqliteD1(join(dir, "t.sqlite"));
    expect(db.migrate(migrations).length).toBeGreaterThan(0);
    expect(db.migrate(migrations)).toEqual([]);
    const ins = db.prepare("INSERT INTO api_tokens (id, label, prefix, hash, created_at) VALUES (?, 'l', 'p', ?, 0)");
    await expect(db.batch([ins.bind("a", "h1"), ins.bind("b", "h1")])).rejects.toThrow();
    expect(await db.prepare("SELECT COUNT(*) n FROM api_tokens").first("n")).toBe(0);
    const [r] = await db.batch([ins.bind("a", "h1")]);
    expect(r.meta.changes).toBe(1);
    expect(await db.prepare("SELECT * FROM api_tokens WHERE id = ?").bind("zzz").first()).toBeNull();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("memory KV and rate limits", () => {
  it("expires KV entries", async () => {
    const kv = new MemoryKV();
    await kv.put("a", JSON.stringify({ x: 1 }), { expiration: Math.floor(Date.now() / 1000) - 1 });
    await kv.put("b", JSON.stringify({ x: 2 }));
    expect(await kv.get("a", { type: "json" })).toBeNull();
    expect(await kv.get("b", { type: "json" })).toEqual({ x: 2 });
  });
  it("limits per key", async () => {
    const rl = new MemoryRateLimit(2, 60);
    expect((await rl.limit({ key: "x" })).success).toBe(true);
    expect((await rl.limit({ key: "x" })).success).toBe(true);
    expect((await rl.limit({ key: "x" })).success).toBe(false);
    expect((await rl.limit({ key: "y" })).success).toBe(true);
  });
});

/** Minimal stored (uncompressed) zip with one entry, for the archive scan. */
function zipWith(name: string, data: Uint8Array) {
  const n = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + n.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, n.length, true);
  local.set(n, 30); local.set(data, 30 + n.length);
  const cd = new Uint8Array(46 + n.length);
  const cv = new DataView(cd.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, n.length, true);
  cd.set(n, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, cd.length, true); ev.setUint32(16, local.length, true);
  return new Uint8Array([...local, ...cd, ...end]);
}

describe("drop on Node.js", () => {
  let drop: Awaited<ReturnType<typeof startDrop>>;
  let dir: string;
  const auth = (t = MASTER) => ({ authorization: `Bearer ${t}` });
  const upload = (body: string | Uint8Array, name: string, token = MASTER) => {
    const f = new FormData();
    f.append("file", new Blob([body as string]), name);
    return fetch(`${drop.url}/api/upload`, { method: "POST", headers: auth(token), body: f });
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "drop-node-"));
    drop = await startDrop({ dataDir: dir, migrationsDir: migrations, vars: { API_TOKEN: MASTER, MAX_MULTIPART_MB: "1", MAX_STREAM_MB: "2" }, port: 0, host: "127.0.0.1", cron: false });
  });
  afterAll(async () => { await drop.close(); rmSync(dir, { recursive: true, force: true }); });

  it("refuses to start without a token", async () => {
    await expect(startDrop({ dataDir: dir, migrationsDir: migrations, vars: {}, port: 0 })).rejects.toThrow(/API_TOKEN/);
  });

  it("serves the landing page with neutral branding by default", async () => {
    const r = await fetch(`${drop.url}/`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("https://github.com/shiftbloom-studio/drop#self-hosting");
    const rest = html.replaceAll("https://github.com/shiftbloom-studio/drop", "");
    expect(rest).not.toMatch(/shiftbloom|hamburg/i);
    expect(html).toContain(`<link rel="canonical" href="${drop.url}/">`);
  });

  it("uploads, serves and deletes a file", async () => {
    const r = await upload("hello from node", "note.txt");
    expect(r.status).toBe(201);
    const j = await r.json() as { id: string; raw: string; delete: string };
    expect(j.raw).toBe(`${drop.url}/${j.id}/raw.txt`);
    const raw = await fetch(j.raw);
    expect(await raw.text()).toBe("hello from node");
    expect(raw.headers.get("content-security-policy")).toContain("sandbox");
    const part = await fetch(j.raw, { headers: { range: "bytes=6-9" } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("from");
    const etag = raw.headers.get("etag")!;
    expect((await fetch(j.raw, { headers: { "if-none-match": etag } })).status).toBe(304);
    expect((await fetch(j.delete, { method: "POST" })).status).toBe(200);
    expect((await fetch(j.raw)).status).toBe(404);
  });

  it("streams raw PUT uploads and checks their first bytes", async () => {
    const ok = await fetch(`${drop.url}/api/upload?filename=notes.txt`, { method: "PUT", headers: auth(), body: new Uint8Array(300_000).fill(97) });
    expect(ok.status).toBe(201);
    const exe = new Uint8Array(1000); exe.set([0x4d, 0x5a]);
    const bad = await fetch(`${drop.url}/api/upload?filename=photo.jpg`, { method: "PUT", headers: auth(), body: exe });
    expect(bad.status).toBe(422);
    const big = await fetch(`${drop.url}/api/upload?filename=big.bin`, { method: "PUT", headers: auth(), body: new Uint8Array(3 * 1024 * 1024) });
    expect(big.status).toBe(413);
  });

  it("creates pastes and short links", async () => {
    const p = await fetch(`${drop.url}/api/paste?lang=txt`, { method: "POST", headers: { ...auth(), "content-type": "text/plain" }, body: "some text" });
    expect(p.status).toBe(201);
    const pj = await p.json() as { url: string };
    expect(await (await fetch(pj.url)).text()).toContain("some text");
    const s = await fetch(`${drop.url}/api/shorten`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com/x" }) });
    const sj = await s.json() as { url: string };
    const go = await fetch(sj.url, { redirect: "manual" });
    expect(go.status).toBe(302);
    expect(go.headers.get("location")).toBe("https://example.com/x");
  });

  it("keeps each named token's history private and lets only the master token release files", async () => {
    const tok = "drop_" + "a".repeat(40);
    await drop.env.DB.prepare("INSERT INTO api_tokens (id, label, prefix, hash, created_at) VALUES ('t1', 'test', 'drop_aaaa', ?, unixepoch())").bind(await sha256Hex(tok)).run();
    const mine = await (await upload("named token file", "named.txt", tok)).json() as { id: string };
    const list = await (await fetch(`${drop.url}/api/list`, { headers: auth(tok) })).json() as { items: { id: string }[] };
    expect(list.items.map((i) => i.id)).toEqual([mine.id]);

    const zip = zipWith("setup.exe", new Uint8Array([0x4d, 0x5a, 0, 0]));
    const z = await (await upload(zip, "tools.zip", tok)).json() as { id: string; url: string };
    await drop.queue.idle();
    expect((await fetch(z.url)).status).toBe(451);
    expect((await fetch(`${drop.url}/api/items/${z.id}?release`, { method: "POST", headers: auth(tok) })).status).toBe(403);
    expect((await fetch(`${drop.url}/api/items/${z.id}?release`, { method: "POST", headers: auth() })).status).toBe(200);
    expect((await fetch(z.url)).status).toBe(200);
  });

  it("deletes expired items in the cleanup job", async () => {
    const r = await (await upload("short lived", "tmp.txt")).json() as { id: string; raw: string };
    await drop.env.DB.prepare("UPDATE items SET expires_at = 1 WHERE id = ?").bind(r.id).run();
    await drop.runCleanup();
    expect(await drop.env.DB.prepare("SELECT 1 FROM items WHERE id = ?").bind(r.id).first()).toBeNull();
  });

  it("ignores a client-supplied cf-connecting-ip, so rate limits can't be dodged", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await fetch(`${drop.url}/api/list`, { headers: { authorization: "Bearer wrong", "cf-connecting-ip": `10.0.0.${i}` } })).status;
    expect(last).toBe(429);
  });
});

describe("brand config", () => {
  it("is neutral unless configured", () => {
    expect(brandFrom({}).operator).toBeNull();
    expect(brandFrom({ OPERATOR_NAME: "Acme", OPERATOR_URL: "javascript:alert(1)" }).operator).toEqual({ name: "Acme", url: null, place: null });
    expect(brandFrom({ SOURCE_URL: "https://git.example.com/me/drop" }).sourceUrl).toBe("https://git.example.com/me/drop");
    expect(brandFrom({ BRAND: "shiftbloom" }).studioWordmark).toBe(true);
  });
});

describe("token command", () => {
  it("creates, lists and revokes named tokens", async () => {
    const { tokenCommand } = await import("../src/node/tokens");
    const dir = mkdtempSync(join(tmpdir(), "drop-tok-"));
    const db = new SqliteD1(join(dir, "t.sqlite"));
    db.migrate(migrations);
    const lines: string[] = [];
    expect(await tokenCommand(db, ["create", "laptop", "--days", "30"], (l) => lines.push(l))).toBe(0);
    const secret = lines[1];
    expect(secret).toMatch(/^drop_[A-Za-z0-9]{40}$/);
    const row = await db.prepare("SELECT id, hash, expires_at FROM api_tokens").first<{ id: string; hash: string; expires_at: number }>();
    expect(row!.hash).toBe(await sha256Hex(secret));
    expect(row!.expires_at).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
    expect(await tokenCommand(db, ["revoke", row!.id], () => {})).toBe(0);
    expect(await tokenCommand(db, ["revoke", row!.id], () => {})).toBe(1);
    expect(await tokenCommand(db, ["bogus"], () => {})).toBe(1);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
