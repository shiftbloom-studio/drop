import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDrop } from "../src/node/app";
import { MemoryRateLimit } from "../src/node/bindings";
import { PUBLIC_MAX_SECONDS, publicEnabled, publicExpiry, publicLimits, publicTypeAllowed, usageKey, withinDailyCap } from "../src/public";
import { legalPage, landingPage } from "../src/html";

const MASTER = "master-token-for-tests-0123456789";
const migrations = join(__dirname, "..", "migrations");

describe("public upload rules", () => {
  it("is on only with the flag and both Turnstile keys", () => {
    expect(publicEnabled({ PUBLIC_UPLOADS: "on", TURNSTILE_SITE_KEY: "k", TURNSTILE_SECRET: "s" })).toBe(true);
    expect(publicEnabled({ PUBLIC_UPLOADS: "on", TURNSTILE_SITE_KEY: "k" })).toBe(false);
    expect(publicEnabled({ TURNSTILE_SITE_KEY: "k", TURNSTILE_SECRET: "s" })).toBe(false);
    expect(publicEnabled({ PUBLIC_UPLOADS: "off", TURNSTILE_SITE_KEY: "k", TURNSTILE_SECRET: "s" })).toBe(false);
  });
  it("never lets a public item live longer than 12 hours", () => {
    const now = 1_000_000;
    expect(publicExpiry("10m", now)).toBe(now + 600);
    expect(publicExpiry("1h", now)).toBe(now + 3600);
    for (const v of ["12h", "never", "1y", "30d", "13h", "", null, undefined]) expect(publicExpiry(v, now)).toBe(now + PUBLIC_MAX_SECONDS);
  });
  it("takes only passive types", () => {
    expect(publicTypeAllowed("image/png")).toBe(true);
    expect(publicTypeAllowed("text/plain; charset=utf-8")).toBe(true);
    expect(publicTypeAllowed("application/zip")).toBe(false);
    expect(publicTypeAllowed("application/octet-stream")).toBe(false);
    expect(publicTypeAllowed("image/svg+xml")).toBe(false);
  });
  it("caps uploads per day and keys the counter by day", async () => {
    const lim = publicLimits({ PUBLIC_DAILY_UPLOADS: "2", PUBLIC_DAILY_MB: "1" });
    expect(withinDailyCap(null, 1000, lim)).toBe(true);
    expect(withinDailyCap({ uploads: 2, bytes: 0 }, 1, lim)).toBe(false);
    expect(withinDailyCap({ uploads: 0, bytes: 1024 * 1024 }, 1, lim)).toBe(false);
    const a = await usageKey("203.0.113.7", 1, "s"), b = await usageKey("203.0.113.7", 2, "s");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("203");
  });
  it("adds public upload sections to the legal pages only when on", () => {
    const l = { name: "N", street: "S", city: "C", country: { en: "E", de: "D" }, email: "e@example.com", authority: "A" };
    for (const kind of ["privacy", "datenschutz", "imprint", "impressum"] as const) {
      const on = legalPage(kind, l, { malwareLookup: false, abuseEmail: "abuse@example.com", public: true });
      const off = legalPage(kind, l, { malwareLookup: false, abuseEmail: "abuse@example.com" });
      expect(on).toMatch(/12 (hours|Stunden)/);
      expect(off).not.toMatch(/12 (hours|Stunden)/);
    }
  });
  it("puts the Turnstile widget on the start page only when on", () => {
    expect(landingPage("drop.example.com", { multiMb: 95, maxMb: 500, pub: { siteKey: "k", maxMb: 25, pasteKb: 512 } })).toContain("turnstile/v0/api.js");
    expect(landingPage("drop.example.com")).not.toContain("challenges.cloudflare.com");
  });
});

describe("public uploads on Node.js", () => {
  let drop: Awaited<ReturnType<typeof startDrop>>;
  let dir: string;
  const realFetch = globalThis.fetch;
  let verdict: { success: boolean; action?: string; hostname?: string } = { success: true, action: "public-upload", hostname: "127.0.0.1" };
  const up = (body: string | Uint8Array, name: string, headers: Record<string, string> = { "x-turnstile": "ok" }) => {
    const f = new FormData();
    f.append("file", new Blob([body as string]), name);
    return realFetch(`${drop.url}/api/public/upload`, { method: "POST", headers, body: f });
  };

  beforeAll(async () => {
    // Turnstile's siteverify is answered here; everything else goes to the real network stack
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (u.startsWith("https://challenges.cloudflare.com/")) return new Response(JSON.stringify(verdict));
      return realFetch(input, init);
    });
    dir = mkdtempSync(join(tmpdir(), "drop-public-"));
    drop = await startDrop({
      dataDir: dir, migrationsDir: migrations, port: 0, host: "127.0.0.1", cron: false,
      vars: { API_TOKEN: MASTER, TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET: "secret", PUBLIC_UPLOADS: "on", PUBLIC_MAX_MB: "1", PUBLIC_PASTE_KB: "1", PUBLIC_DAILY_UPLOADS: "5" },
    });
    // the per-minute limit has its own test below; here it would get in the way of the daily cap
    (drop.env as unknown as Record<string, unknown>).PUB_RL = new MemoryRateLimit(1000, 60);
  });
  afterAll(async () => { await drop.close(); rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it("uploads without a token, with a long id, at most 12 hours and no history", async () => {
    const r = await up("hello public", "hi.txt", { "x-turnstile": "ok", "x-expires": "never" });
    expect(r.status).toBe(201);
    const j = await r.json() as { id: string; url: string; raw: string; delete: string; expires_at: string };
    expect(j.id).toHaveLength(10);
    const left = (Date.parse(j.expires_at) - Date.now()) / 1000;
    expect(left).toBeGreaterThan(PUBLIC_MAX_SECONDS - 60);
    expect(left).toBeLessThanOrEqual(PUBLIC_MAX_SECONDS);
    await drop.queue.idle();
    expect(await (await realFetch(j.raw)).text()).toBe("hello public");
    const row = await drop.env.DB.prepare("SELECT owner, r2_key FROM items WHERE id = ?").bind(j.id).first<{ owner: string; r2_key: string }>();
    expect(row).toEqual({ owner: "public", r2_key: `pub/f/${j.id}/hi.txt` });
    // no token's history shows it; the master token can look at public items on request
    const mine = await (await realFetch(`${drop.url}/api/list`, { headers: { authorization: `Bearer ${MASTER}` } })).json() as { items: { id: string }[] };
    expect(mine.items.map((i) => i.id)).not.toContain(j.id);
    const pub = await (await realFetch(`${drop.url}/api/list?scope=public`, { headers: { authorization: `Bearer ${MASTER}` } })).json() as { items: { id: string }[] };
    expect(pub.items.map((i) => i.id)).toContain(j.id);
    expect((await realFetch(`${drop.url}/api/list?scope=public`)).status).toBe(401);
    expect((await realFetch(j.delete, { method: "POST" })).status).toBe(200);
    expect((await realFetch(j.raw)).status).toBe(404);
  });

  it("stays closed until the scan has run", async () => {
    const j = await (await up("checking", "c.txt")).json() as { id: string; url: string };
    const row = await drop.env.DB.prepare("SELECT blocked FROM items WHERE id = ?").bind(j.id).first<{ blocked: string | null }>();
    expect(row?.blocked === "checking" || row?.blocked === null).toBe(true);
    await drop.queue.idle();
    expect((await realFetch(j.url)).status).toBe(200);
  });

  it("refuses failed checks, other actions, other types, big files and big pastes", async () => {
    verdict = { success: false };
    expect((await up("x", "x.txt")).status).toBe(403);
    verdict = { success: true, action: "token-request" };
    expect((await up("x", "x.txt")).status).toBe(403);
    verdict = { success: true, action: "public-upload", hostname: "evil.example" };
    expect((await up("x", "x.txt")).status).toBe(403);
    verdict = { success: true, action: "public-upload", hostname: "127.0.0.1" };
    expect((await up("x", "x.txt", {})).status).toBe(403);
    expect((await up(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]), "a.zip")).status).toBe(415);
    expect((await up(new Uint8Array(2 * 1024 * 1024), "big.txt")).status).toBe(413);
    const paste = await realFetch(`${drop.url}/api/public/paste`, { method: "POST", headers: { "x-turnstile": "ok", "content-type": "application/json" }, body: JSON.stringify({ content: "x".repeat(2000) }) });
    expect(paste.status).toBe(413);
    // short links and raw PUT uploads still need a token
    expect((await realFetch(`${drop.url}/api/shorten`, { method: "POST", body: "https://example.com" })).status).toBe(401);
    expect((await realFetch(`${drop.url}/api/public/upload?filename=a.txt`, { method: "PUT", headers: { "x-turnstile": "ok" }, body: "a" })).status).toBe(405);
  });

  it("keeps to the daily cap per address and forgets the counters", async () => {
    // 5 per day: two successful uploads so far, so three more pass and the next one is refused
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await up(`n${i}`, `n${i}.txt`)).status);
    expect(codes.slice(0, 3)).toEqual([201, 201, 201]);
    expect(codes[3]).toBe(429);
    await drop.env.DB.prepare("UPDATE public_usage SET day = day - 5").run();
    await drop.runCleanup();
    expect(await drop.env.DB.prepare("SELECT COUNT(*) n FROM public_usage").first("n")).toBe(0);
  });

  it("limits public uploads per minute", async () => {
    const env = drop.env as unknown as Record<string, unknown>, keep = env.PUB_RL;
    env.PUB_RL = new MemoryRateLimit(1, 60);
    verdict = { success: false };
    expect((await up("x", "x.txt")).status).toBe(403);
    expect((await up("x", "x.txt")).status).toBe(429);
    verdict = { success: true, action: "public-upload", hostname: "127.0.0.1" };
    env.PUB_RL = keep;
  });

  it("creates public pastes", async () => {
    const r = await realFetch(`${drop.url}/api/public/paste`, { method: "POST", headers: { "x-turnstile": "ok", "content-type": "application/json" }, body: JSON.stringify({ content: "short text", expires: "1h" }) });
    expect(r.status).toBe(201);
    const j = await r.json() as { id: string; url: string; expires_at: string };
    expect(j.id).toHaveLength(10);
    expect(Date.parse(j.expires_at) - Date.now()).toBeLessThanOrEqual(3600_000);
    expect(await (await realFetch(j.url)).text()).toContain("short text");
  });
});

describe("public uploads switched off", () => {
  it("has no public endpoints", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drop-nopub-"));
    const drop = await startDrop({ dataDir: dir, migrationsDir: migrations, port: 0, host: "127.0.0.1", cron: false, vars: { API_TOKEN: MASTER, TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET: "secret" } });
    const f = new FormData(); f.append("file", new Blob(["x"]), "x.txt");
    expect((await fetch(`${drop.url}/api/public/upload`, { method: "POST", headers: { "x-turnstile": "ok" }, body: f })).status).toBe(404);
    await drop.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
