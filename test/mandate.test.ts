// Agents with a stem mandate: drop maps each request to an action, name and size and asks stem.
// stem is played by a small HTTP server here; the chain checks themselves are tested in stem.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { startDrop } from "../src/node/app";
import { parseMandate } from "../src/mandate";

const MASTER = "master-token-for-tests-0123456789";
const migrations = join(__dirname, "..", "migrations");
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** A chain whose root names mandate `jti`. Only stem reads the signatures, and stem is faked here. */
const chain = (jti: string, hops = 1) => [`${b64u({ alg: "EdDSA" })}.${b64u({ jti })}.sig`, ...Array.from({ length: hops }, (_, i) => `${b64u({ alg: "EdDSA" })}.${b64u({ del_depth: i + 1 })}.sig`)].join("~");

type Ask = { chain: string[]; pop: string; method: string; url: string; action: string; path?: string; bytes?: number };

describe("mandates", () => {
  let drop: Awaited<ReturnType<typeof startDrop>>;
  let plain: Awaited<ReturnType<typeof startDrop>>;
  let stem: Server;
  let dir: string;
  const asked: Ask[] = [];
  /** What the fake stem allows: mandate m1, upload/list/delete under "screens-", up to 1000 bytes; m2 is stopped. */
  const decide = (a: Ask) => {
    const jti = JSON.parse(Buffer.from(a.chain[0].split(".")[1], "base64url").toString()).jti;
    if (jti === "m2-stopped-mandate") return { allowed: false, reason: "revoked", message: "This mandate was stopped by the person who signed it." };
    const fits = ["upload", "list", "delete"].includes(a.action) && (a.path ?? "").startsWith("screens-") && (a.bytes ?? 0) <= 1000;
    return fits ? { allowed: true, mandate: jti, sub: "u1", purpose: "test", depth: a.chain.length - 1 } : { allowed: false, reason: "outside_mandate", message: "The mandate doesn't cover this request." };
  };
  const as = (jti: string) => ({ authorization: `Mandate ${chain(jti)}`, "mandate-pop": "pop.jwt.sig" });
  const upload = (name: string, body: string, jti = "m1-good-mandate") =>
    fetch(`${drop.url}/api/upload?filename=${encodeURIComponent(name)}`, { method: "PUT", headers: { ...as(jti), "content-type": "image/png" }, body });

  beforeAll(async () => {
    stem = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url !== "/api/mandates/authorize") { res.writeHead(404).end(); return; }
        const a = JSON.parse(body) as Ask;
        asked.push(a);
        const d = decide(a);
        res.writeHead(d.allowed ? 200 : 403, { "content-type": "application/json" }).end(JSON.stringify(d));
      });
    });
    await new Promise<void>((ok) => stem.listen(0, "127.0.0.1", ok));
    dir = mkdtempSync(join(tmpdir(), "drop-mandate-"));
    const issuer = `http://127.0.0.1:${(stem.address() as AddressInfo).port}`;
    drop = await startDrop({ dataDir: join(dir, "a"), migrationsDir: migrations, vars: { API_TOKEN: MASTER, MANDATE_ISSUER: issuer }, port: 0, host: "127.0.0.1", cron: false });
    plain = await startDrop({ dataDir: join(dir, "b"), migrationsDir: migrations, vars: { API_TOKEN: MASTER }, port: 0, host: "127.0.0.1", cron: false });
  });
  afterAll(async () => {
    await drop.close();
    await plain.close();
    stem.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses the chain header", () => {
    expect(parseMandate(`Mandate ${chain("x1234567")}`)).toHaveLength(2);
    expect(parseMandate("Bearer abc")).toBeNull();
    expect(parseMandate("Mandate not-a-jwt")).toBeNull();
  });

  it("uploads inside the mandate and asks stem with the file's name and size", async () => {
    const r = await upload("screens-a.png", "hello");
    expect(r.status).toBe(201);
    const last = asked.at(-1)!;
    expect(last).toMatchObject({ action: "upload", path: "screens-a.png", bytes: 5, method: "PUT", pop: "pop.jwt.sig" });
    expect(last.url).toBe(`${drop.url}/api/upload?filename=screens-a.png`);
    expect(last.chain).toHaveLength(2);
  });

  it("checks the mandate before reading a body, so multipart uploads are refused unread", async () => {
    const n = asked.length;
    const f = new FormData();
    f.append("file", new Blob(["x".repeat(1000)]), "screens-m.png");
    const r = await fetch(`${drop.url}/api/upload`, { method: "POST", headers: as("m1-good-mandate"), body: f });
    expect(r.status).toBe(415);
    expect(asked.length).toBe(n);
  });

  it("refuses an upload outside the mandate and stores nothing", async () => {
    const r = await upload("private.png", "secret");
    expect(r.status).toBe(403);
    expect(((await r.json()) as { reason: string }).reason).toBe("outside_mandate");
    const all = (await (await fetch(`${drop.url}/api/list`, { headers: { authorization: `Bearer ${MASTER}` } })).json()) as { items: { name: string }[] };
    expect(all.items.map((i) => i.name)).not.toContain("private.png");
  });

  it("refuses everything once the mandate is stopped", async () => {
    const r = await upload("screens-b.png", "x", "m2-stopped-mandate");
    expect(r.status).toBe(403);
    expect(((await r.json()) as { reason: string }).reason).toBe("revoked");
  });

  it("lists only the mandate's own files, inside its prefix, and deletes them", async () => {
    await fetch(`${drop.url}/api/upload`, { method: "POST", headers: { authorization: `Bearer ${MASTER}` }, body: (() => { const f = new FormData(); f.append("file", new Blob(["m"]), "screens-master.png"); return f; })() });
    await upload("screens-c.png", "ccc");
    const noPrefix = await fetch(`${drop.url}/api/list`, { headers: as("m1-good-mandate") });
    expect(noPrefix.status).toBe(403);
    const r = await fetch(`${drop.url}/api/list?prefix=screens-`, { headers: as("m1-good-mandate") });
    expect(r.status).toBe(200);
    const items = ((await r.json()) as { items: { id: string; name: string }[] }).items;
    expect(items.map((i) => i.name).sort()).toEqual(["screens-a.png", "screens-c.png"]);
    expect(asked.at(-1)).toMatchObject({ action: "list", path: "screens-", method: "GET" });
    // Another mandate's view is empty.
    const other = (await (await fetch(`${drop.url}/api/list?prefix=screens-`, { headers: as("m3-other-mandate") })).json()) as { items: unknown[] };
    expect(other.items).toHaveLength(0);

    const c = items.find((i) => i.name === "screens-c.png")!;
    const del = await fetch(`${drop.url}/api/items/${c.id}`, { method: "DELETE", headers: as("m1-good-mandate") });
    expect(del.status).toBe(200);
    expect(asked.at(-1)).toMatchObject({ action: "delete", path: "screens-c.png", method: "DELETE" });
    // The master's file isn't the mandate's: it looks missing, and stem isn't even asked.
    const masterItem = ((await (await fetch(`${drop.url}/api/list`, { headers: { authorization: `Bearer ${MASTER}` } })).json()) as { items: { id: string; name: string }[] }).items.find((i) => i.name === "screens-master.png")!;
    const n = asked.length;
    expect((await fetch(`${drop.url}/api/items/${masterItem.id}`, { method: "DELETE", headers: as("m1-good-mandate") })).status).toBe(404);
    expect(asked.length).toBe(n);
  });

  it("covers upload, list and delete only", async () => {
    const r = await fetch(`${drop.url}/api/paste`, { method: "POST", headers: { ...as("m1-good-mandate"), "content-type": "text/plain" }, body: "hi" });
    expect(r.status).toBe(403);
    const s = await fetch(`${drop.url}/api/sharex`, { headers: as("m1-good-mandate") });
    expect(s.status).toBe(403);
  });

  it("asks for the proof header and says so when mandates are off", async () => {
    expect((await fetch(`${drop.url}/api/list`, { headers: { authorization: `Mandate ${chain("m1-good-mandate")}` } })).status).toBe(401);
    const off = await fetch(`${plain.url}/api/list`, { headers: as("m1-good-mandate") });
    expect(off.status).toBe(401);
    expect(((await off.json()) as { error: string }).error).toContain("doesn't take mandates");
    // Tokens keep working next to mandates.
    expect((await fetch(`${drop.url}/api/list`, { headers: { authorization: `Bearer ${MASTER}` } })).status).toBe(200);
  });
});
