/**
 * drop — ShareX-compatible file host, pastebin and URL shortener on Cloudflare Workers
 * (or on Node.js through src/node, which provides the same bindings backed by disk and SQLite).
 * Storage: R2 (blobs + thumbnails), D1 (metadata, source of truth), KV (hot lookup cache for short ids).
 * Background: Queue consumer builds thumbnails (Images binding) and alt text + NSFW flag (Workers AI).
 */
import { landingPage, viewPage, notFoundPage, handleAsset, heldPage, checkingPage, deletePage, legalPage, configureUi, requestPage, requestSentPage, requestStatusPage, tokenShownPage } from "./ui.js";
import { CLAIM_WINDOW, KEEP_REQUESTS, MAX_PENDING, isClaimCode, newApiToken, newClaimCode, readRequestForm, requestState, verifyTurnstile, type RequestRow } from "./requests";
import { sniff, blockReason, effectiveType, INLINE_TYPES, stripJpegLocation, stripPngLocation, inspectZip } from "./safety";
import { brandFrom, type BrandEnv } from "./brand";
import { CHECKING, NOT_CHECKED, limitKey, PUBLIC_ACTION, PUBLIC_ID_LENGTH, PUBLIC_OWNER, PUBLIC_PREFIX, publicEnabled, publicExpiry, publicLimits, publicTypeAllowed, usageKey, utcDay, withinDailyCap, type PublicEnv, type PublicLimits } from "./public";
import { randomString, timingSafeEqual, parseExpiry, extOf, isAuthed, isNamedToken, requestToken, sha256Hex, tokenUsable, sanitizeName, robotsTxt, ownerFilter, canManage, MASTER_OWNER, type Principal } from "./util";

export interface Env extends BrandEnv, PublicEnv {
  FILES: R2Bucket;
  DB: D1Database;
  LINKS: KVNamespace;
  JOBS: Queue<Job>;
  AI?: Ai;
  IMAGES?: ImagesBinding;
  API_TOKEN: string;
  MAX_MULTIPART_MB?: string;
  MAX_STREAM_MB?: string;
  AI_MODEL?: string;
  /** Rate limiters (optional): failed token attempts and unknown ids, both per IP. */
  AUTH_RL?: RateLimit;
  MISS_RL?: RateLimit;
  /** abuse.ch MalwareBazaar Auth-Key. When set, the SHA-256 of every upload is checked against it. */
  MB_AUTH_KEY?: string;
  /** Address for "Report this file" links. Hidden when unset. */
  ABUSE_EMAIL?: string;
  /** Operator details for the imprint and privacy policy, as JSON. Legal pages are hidden when unset. */
  LEGAL?: string;
  /** Token requests at /request: on when both Turnstile keys are set. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Rate limiter for sent token requests, per IP. */
  REQ_RL?: RateLimit;
  /** Rate limiter for public uploads (no token), per IP. */
  PUB_RL?: RateLimit;
}

type Kind = "file" | "paste" | "link";
export interface Item {
  id: string;
  kind: Kind;
  r2_key: string | null;
  name: string | null;
  mime: string | null;
  size: number;
  target: string | null;
  lang: string | null;
  created_at: number;
  expires_at: number | null;
  delete_token: string;
  thumb_key: string | null;
  alt: string | null;
  nsfw: number | null;
  views: number;
  width?: number | null;
  height?: number | null;
  /** Why the file is on hold (quarantine), or null. */
  blocked?: string | null;
  sha256?: string | null;
  /** 'master' or the api_tokens.id that uploaded it; null for items from before owners were recorded. */
  owner?: string | null;
}
type Job = { type: "analyze" | "scan"; id: string };
const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp|avif|bmp)$/;

// ---------- helpers ----------
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const err = (status: number, message: string) => json({ error: message }, status);

function baseUrl(req: Request) {
  return new URL(req.url).origin;
}

function links(req: Request, it: Item) {
  const b = baseUrl(req);
  const ext = extOf(it.name);
  return {
    id: it.id,
    kind: it.kind,
    url: `${b}/${it.id}`,
    raw: it.kind === "link" ? it.target : `${b}/${it.id}/raw${ext ? "." + ext : ""}`,
    thumbnail: it.kind === "file" && IMAGE_TYPES.test(it.mime || "") ? `${b}/${it.id}/thumb` : null,
    delete: `${b}/d/${it.id}/${it.delete_token}`,
    expires_at: it.expires_at ? new Date(it.expires_at * 1000).toISOString() : null,
  };
}

/** Public items get longer ids (10+ characters, about 58 bits), so their links can't be guessed or enumerated. */
async function newId(env: Env, min = 5) {
  for (let len = min; len < min + 5; len++) {
    for (let i = 0; i < 3; i++) {
      const id = randomString(len);
      const hit = await env.DB.prepare("SELECT 1 FROM items WHERE id = ?").bind(id).first();
      if (!hit) return id;
    }
  }
  throw new Error("could not allocate id");
}

async function saveItem(env: Env, it: Item, p: Principal) {
  it.owner = p.owner;
  await env.DB.prepare(
    `INSERT INTO items (id, kind, r2_key, name, mime, size, target, lang, created_at, expires_at, delete_token, thumb_key, alt, nsfw, views, blocked, owner)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`
  ).bind(it.id, it.kind, it.r2_key, it.name, it.mime, it.size, it.target, it.lang, it.created_at, it.expires_at, it.delete_token, it.thumb_key, it.alt, it.nsfw, it.blocked ?? null, it.owner).run();
  await cacheItem(env, it);
}

async function cacheItem(env: Env, it: Item) {
  const opts: KVNamespacePutOptions = {};
  if (it.expires_at) opts.expiration = Math.max(it.expires_at, Math.floor(Date.now() / 1000) + 60);
  await env.LINKS.put(`i:${it.id}`, JSON.stringify(it), opts);
}

async function getItem(env: Env, id: string): Promise<Item | null> {
  if (!/^[A-Za-z0-9]{3,16}$/.test(id)) return null;
  let it = await env.LINKS.get<Item>(`i:${id}`, { type: "json", cacheTtl: 60 });
  // KV keeps a copy at the edge for up to a minute, so a public upload still marked "checking" there is
  // looked up in D1 again: otherwise its link would keep saying "still checking" long after the scan.
  // Only a real miss writes KV back: the scan has already stored the new state, and rewriting the key on
  // every request during that minute would run into KV's limit of one write per second per key.
  if (!it || it.blocked === CHECKING) {
    const miss = !it;
    it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
    if (it && miss) await cacheItem(env, it);
  }
  if (it && it.expires_at && it.expires_at < Date.now() / 1000) return null;
  return it;
}

async function deleteItem(env: Env, it: Item) {
  const keys = [it.r2_key, it.thumb_key].filter(Boolean) as string[];
  if (keys.length) await env.FILES.delete(keys);
  await env.LINKS.delete(`i:${it.id}`);
  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(it.id).run();
}

function baseItem(id: string, kind: Kind, expires_at: number | null): Item {
  return {
    id, kind, r2_key: null, name: null, mime: null, size: 0, target: null, lang: null,
    created_at: Math.floor(Date.now() / 1000), expires_at, delete_token: randomString(24),
    thumb_key: null, alt: null, nsfw: null, views: 0,
  };
}

// ---------- API handlers ----------
const BLOCK_MSG: Record<string, (n: string) => string> = {
  program: (n) => `${n} is a program, script or installer. drop doesn\u2019t host those.`,
  macro: () => `Office files with macros can\u2019t be uploaded. Save it as .docx or .xlsx and try again.`,
  malware: () => `A virus scan flagged this file, so it wasn\u2019t uploaded.`,
};

/** `pub` is set for uploads without a token (see public.ts): smaller limit, 12 hour expiry, passive types only. */
async function handleUpload(req: Request, env: Env, ctx: ExecutionContext, p: Principal, pub?: PublicLimits) {
  const url = new URL(req.url);
  const ct = req.headers.get("content-type") || "";
  let expiresRaw = req.headers.get("x-expires") || url.searchParams.get("expires");
  // set by Cloudflare's malicious uploads detection (managed transform) when the zone has it
  const scan = req.headers.get("malicious-uploads-detection");

  let name: string, declared: string;
  const id = await newId(env, pub ? PUBLIC_ID_LENGTH : 5);
  let it: Item;

  if (ct.startsWith("multipart/form-data")) {
    const max = pub ? pub.maxBytes : Number(env.MAX_MULTIPART_MB || 95) * 1024 * 1024;
    const len = Number(req.headers.get("content-length") || 0);
    if (pub && len > max + 65536) return err(413, `without a token, files are limited to ${Math.round(max / 1048576)} MB`);
    if (!pub && len > max) return err(413, `multipart uploads are limited to ${env.MAX_MULTIPART_MB || 95} MB; use PUT /api/upload for larger files`);
    const form = await req.formData();
    const f = (form.get("file") || form.get("sharex") || form.get("files[]")) as unknown;
    if (!f || typeof f === "string") return err(400, "missing form field 'file'");
    const file = f as File;
    expiresRaw = (form.get("expires") as string | null) || expiresRaw;
    name = sanitizeName(file.name || "upload");
    declared = file.type;
    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) return err(400, "empty file");
    if (pub && bytes.length > max) return err(413, `without a token, files are limited to ${Math.round(max / 1048576)} MB`);
    const sniffed = sniff(bytes.subarray(0, 4100));
    const reason = scan === "1" ? "malware" : blockReason(name, sniffed);
    if (reason) return err(422, BLOCK_MSG[reason](name));
    const mime = effectiveType(declared, sniffed, bytes.subarray(0, 1024));
    if (pub && !publicTypeAllowed(mime)) return err(415, `Without a token, drop takes images, videos, audio, PDFs and plain text. ${name} isn\u2019t one of those.`);
    if (mime === "image/jpeg") bytes = stripJpegLocation(bytes).bytes;
    else if (mime === "image/png") bytes = stripPngLocation(bytes).bytes;
    const expires_at = pub ? publicExpiry(expiresRaw) : parseExpiry(expiresRaw);
    if (expires_at === undefined) return err(400, "invalid expires (use 10m, 1h, 1d, 7d, 30d, 90d, 1y, never or e.g. 12h)");
    it = Object.assign(baseItem(id, "file", expires_at), { r2_key: `${pub ? PUBLIC_PREFIX : ""}f/${id}/${name}`, name, mime, size: bytes.length });
    await env.FILES.put(it.r2_key!, bytes, { httpMetadata: { contentType: mime }, customMetadata: { id } });
  } else {
    // raw streaming upload: PUT/POST /api/upload?filename=foo.mp4 with the bytes as body
    if (pub) return err(415, "send the file as multipart/form-data");
    const len = Number(req.headers.get("content-length") || 0);
    if (!len || !req.body) return err(411, "content-length required for raw uploads");
    if (len > Number(env.MAX_STREAM_MB || 500) * 1024 * 1024) return err(413, "file too large");
    name = sanitizeName(url.searchParams.get("filename") || req.headers.get("x-filename") || "upload");
    declared = ct.split(";")[0];
    const pre = blockReason(name, null);
    if (pre || scan === "1") return err(422, BLOCK_MSG[pre || "malware"](name));
    const expires_at = parseExpiry(expiresRaw);
    if (expires_at === undefined) return err(400, "invalid expires (use 10m, 1h, 1d, 7d, 30d, 90d, 1y, never or e.g. 12h)");
    // keep the first bytes while streaming to R2, so the type can be checked without buffering
    const head = new Uint8Array(4100);
    let got = 0;
    const tap = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        if (got < head.length) { const n = Math.min(chunk.length, head.length - got); head.set(chunk.subarray(0, n), got); got += n; }
        c.enqueue(chunk);
      },
    });
    it = Object.assign(baseItem(id, "file", expires_at), { r2_key: `f/${id}/${name}`, name, mime: "application/octet-stream", size: len });
    await env.FILES.put(it.r2_key!, req.body.pipeThrough(tap).pipeThrough(new FixedLengthStream(len)), { customMetadata: { id } });
    const first = head.subarray(0, got);
    const sniffed = sniff(first);
    const reason = blockReason(name, sniffed);
    if (reason) { await env.FILES.delete(it.r2_key!); return err(422, BLOCK_MSG[reason](name)); }
    it.mime = effectiveType(declared, sniffed, first);
  }
  if (scan === "2") it.blocked = "scan failed";
  // public files stay closed until the background scan (and, for images, the sensitive content check) has run
  else if (pub) it.blocked = CHECKING;
  await saveItem(env, it, p);
  ctx.waitUntil(env.JOBS.send({ type: "scan", id }));
  return json(links(req, it), 201);
}

async function handlePaste(req: Request, env: Env, p: Principal, pub?: PublicLimits) {
  const ct = req.headers.get("content-type") || "";
  let content = "", lang = "", title = "", expires: string | null = new URL(req.url).searchParams.get("expires") || req.headers.get("x-expires");
  if (ct.includes("application/json")) {
    const b = await req.json<any>();
    content = String(b.content ?? ""); lang = String(b.lang ?? ""); title = String(b.title ?? ""); expires = b.expires ?? expires;
  } else if (ct.includes("form")) {
    const f = await req.formData();
    const c = f.get("content") ?? f.get("text") ?? f.get("file");
    content = typeof c === "string" ? c : c ? await (c as File).text() : "";
    if (c && typeof c !== "string") title = (c as File).name;
    lang = String(f.get("lang") ?? ""); title = String(f.get("title") ?? title); expires = (f.get("expires") as string) || expires;
  } else {
    content = await req.text();
    lang = new URL(req.url).searchParams.get("lang") || "";
    title = new URL(req.url).searchParams.get("title") || "";
  }
  if (!content) return err(400, "empty paste");
  if (content.length > 10 * 1024 * 1024) return err(413, "paste too large (10 MB)");
  if (pub && new TextEncoder().encode(content).length > pub.pasteBytes) return err(413, `without a token, pastes are limited to ${Math.round(pub.pasteBytes / 1024)} KB`);
  const expires_at = pub ? publicExpiry(expires) : parseExpiry(expires);
  if (expires_at === undefined) return err(400, "invalid expires");
  const id = await newId(env, pub ? PUBLIC_ID_LENGTH : 5);
  const it = baseItem(id, "paste", expires_at);
  const name = sanitizeName(title || `${id}.${lang || "txt"}`);
  Object.assign(it, { r2_key: `${pub ? PUBLIC_PREFIX : ""}p/${id}.txt`, name, mime: "text/plain; charset=utf-8", size: new TextEncoder().encode(content).length, lang: lang.replace(/[^a-z0-9+#-]/gi, "").slice(0, 20) || null });
  await env.FILES.put(it.r2_key!, content, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
  await saveItem(env, it, p);
  return json(links(req, it), 201);
}

async function handleShorten(req: Request, env: Env, p: Principal) {
  const ct = req.headers.get("content-type") || "";
  const u = new URL(req.url);
  let target = u.searchParams.get("url") || "", expires = u.searchParams.get("expires") || req.headers.get("x-expires");
  if (!target) {
    if (ct.includes("application/json")) { const b = await req.json<any>(); target = b.url; expires = b.expires ?? expires; }
    else if (ct.includes("form")) { const f = await req.formData(); target = String(f.get("url") || ""); expires = (f.get("expires") as string) || expires; }
    else target = (await req.text()).trim();
  }
  let parsed: URL;
  try { parsed = new URL(target); } catch { return err(400, "invalid url"); }
  if (!/^https?:$/.test(parsed.protocol)) return err(400, "only http(s) urls");
  const expires_at = parseExpiry(expires);
  if (expires_at === undefined) return err(400, "invalid expires");
  const id = await newId(env);
  const it = baseItem(id, "link", expires_at);
  it.target = parsed.toString();
  await saveItem(env, it, p);
  return json(links(req, it), 201);
}

// The .sxcu carries the token it was requested with, so a named token yields a config that
// stops working when that token expires or is revoked.
function sharexConfig(req: Request, token: string, type: string) {
  const b = baseUrl(req);
  const host = new URL(req.url).host;
  const common = { Version: "16.1.0", Name: "", DestinationType: "", RequestMethod: "POST", RequestURL: "", Headers: { Authorization: `Bearer ${token}` }, Body: "", URL: "{json:url}", DeletionURL: "{json:delete}", ErrorMessage: "{json:error}" } as Record<string, unknown>;
  if (type === "paste") Object.assign(common, { Name: `${host} (paste)`, DestinationType: "TextUploader", RequestURL: `${b}/api/paste`, Body: "MultipartFormData", Arguments: { content: "{input}", lang: "txt" } });
  else if (type === "shorten") Object.assign(common, { Name: `${host} (shorten)`, DestinationType: "URLShortener", RequestURL: `${b}/api/shorten`, Body: "MultipartFormData", Arguments: { url: "{input}" }, DeletionURL: "{json:delete}" });
  else Object.assign(common, { Name: `${host} (upload)`, DestinationType: "ImageUploader, FileUploader", RequestURL: `${b}/api/upload`, Body: "MultipartFormData", FileFormName: "file", ThumbnailURL: "{json:thumbnail}" });
  return new Response(JSON.stringify(common, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${host}-${type || "upload"}.sxcu"`, "cache-control": "no-store" },
  });
}

async function handleList(req: Request, env: Env, p: Principal) {
  const u = new URL(req.url);
  const limit = Math.min(Number(u.searchParams.get("limit") || 50), 200);
  const offset = Math.max(0, Math.floor(Number(u.searchParams.get("offset")) || 0));
  const kind = u.searchParams.get("kind");
  // every token sees only its own history; the links themselves stay public.
  // The master token can also look at uploads without a token (?scope=public), to moderate them.
  const own = p.master && u.searchParams.get("scope") === "public" ? { sql: "owner = ?", args: [PUBLIC_OWNER] } : ownerFilter(p);
  const stmt = kind
    ? env.DB.prepare(`SELECT * FROM items WHERE ${own.sql} AND kind = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...own.args, kind, limit, offset)
    : env.DB.prepare(`SELECT * FROM items WHERE ${own.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...own.args, limit, offset);
  const { results } = await stmt.all<Item>();
  const stats = await env.DB.prepare(`SELECT kind, COUNT(*) n, COALESCE(SUM(size),0) bytes FROM items WHERE ${own.sql} GROUP BY kind`).bind(...own.args).all();
  return json({ items: results.map((it) => ({ ...links(req, it), name: it.name, mime: it.mime, size: it.size, alt: it.alt, nsfw: it.nsfw, views: it.views, blocked: it.blocked ?? null, created_at: new Date(it.created_at * 1000).toISOString() })), stats: stats.results });
}

// ---------- public views ----------
function safeRawHeaders(it: Item, obj: R2ObjectBody | R2Object, download: boolean) {
  const h = new Headers();
  h.set("etag", obj.httpEtag);
  h.set("accept-ranges", "bytes");
  h.set("x-content-type-options", "nosniff");
  h.set("cache-control", it.expires_at ? "public, max-age=300" : "public, max-age=86400");
  // Only an allowlist of passive types is shown inline; everything else (html, svg, scripts, archives,
  // unknown binaries) is a download as application/octet-stream, so nothing uploaded can run on our origin.
  const mime = (it.mime || "").toLowerCase().split(";")[0].trim();
  // a public PDF is only ever a download: the browser's PDF viewer can't run under the sandbox CSP
  const publicPdf = it.owner === PUBLIC_OWNER && mime === "application/pdf";
  const inline = INLINE_TYPES.has(mime) && !download && !publicPdf;
  h.set("content-type", !INLINE_TYPES.has(mime) ? "application/octet-stream" : mime === "text/plain" ? "text/plain; charset=utf-8" : mime);
  if (mime !== "application/pdf" || publicPdf) h.set("content-security-policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  const fname = (it.name || it.id).replace(/[^\x20-\x7e]/g, "_");
  h.set("content-disposition", `${inline ? "inline" : "attachment"}; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(it.name || it.id)}`);
  return h;
}

async function serveRaw(req: Request, env: Env, it: Item, download: boolean) {
  if (!it.r2_key) return notFound();
  const range = req.headers.get("range");
  const obj = await env.FILES.get(it.r2_key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return notFound();
  const h = safeRawHeaders(it, obj, download);
  if (!("body" in obj)) return new Response(null, { status: 304, headers: h });
  if (range && obj.range && "offset" in obj.range) {
    const off = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - off;
    h.set("content-range", `bytes ${off}-${off + len - 1}/${obj.size}`);
    h.set("content-length", String(len));
    return new Response(req.method === "HEAD" ? null : obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(req.method === "HEAD" ? null : obj.body, { headers: h });
}

async function serveThumb(req: Request, env: Env, it: Item) {
  if (it.thumb_key) {
    const obj = await env.FILES.get(it.thumb_key);
    if (obj) return new Response(obj.body, { headers: { "content-type": "image/webp", "cache-control": "public, max-age=604800, immutable" } });
  }
  if (it.kind === "file" && IMAGE_TYPES.test(it.mime || "")) return serveRaw(req, env, it, false);
  return notFound();
}

const PAGE_CSP = "default-src 'none'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; object-src 'self'; base-uri 'none'; form-action 'self'";
const htmlHeaders = (cache: string) => ({ "content-type": "text/html; charset=utf-8", "cache-control": cache, "content-security-policy": PAGE_CSP, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
const ip = (req: Request) => req.headers.get("cf-connecting-ip") || "unknown";
/** Guessing ids or deletion links: after too many misses per IP and minute, answer 429. */
async function missLimited(req: Request, env: Env) {
  if (env.MISS_RL && !(await env.MISS_RL.limit({ key: ip(req) })).success)
    return new Response("Too many requests. Wait a minute.\n", { status: 429, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "60" } });
  return null;
}

const LEGAL_PATHS: Record<string, "privacy" | "datenschutz" | "imprint" | "impressum"> = {
  "/privacy": "privacy", "/datenschutz": "datenschutz", "/imprint": "imprint", "/impressum": "impressum",
};
export type Legal = { name: string; business?: string; street: string; city: string; country: { en: string; de: string }; email: string; phone?: string; vatId?: string; authority: string };
function parseLegal(raw?: string): Legal | null {
  if (!raw) return null;
  try { const l = JSON.parse(raw) as Legal; return l.name && l.street && l.email ? l : null; } catch { return null; }
}

const notFound = () => new Response(notFoundPage(), { status: 404, headers: htmlHeaders("no-store") });

// ---------- token requests ----------
const TURNSTILE = "https://challenges.cloudflare.com";
const REQUEST_CSP = PAGE_CSP.replace("script-src 'self' 'unsafe-inline'", `script-src 'self' 'unsafe-inline' ${TURNSTILE}`).replace("frame-src 'self'", `frame-src 'self' ${TURNSTILE}`).replace("connect-src 'self'", `connect-src 'self' ${TURNSTILE}`);
/** Claim pages carry a secret in the path: never cached, never indexed, never sent as a referrer. */
const reqHtml = (body: string, status = 200, csp = PAGE_CSP) =>
  new Response(body, { status, headers: { ...htmlHeaders("no-store"), "content-security-policy": csp, "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" } });

async function handleTokenRequest(req: Request, env: Env, url: URL): Promise<Response> {
  const siteKey = env.TURNSTILE_SITE_KEY!, now = Math.floor(Date.now() / 1000);
  const form404 = (error: string, v: { name?: string; reason?: string } = {}, status = 400) => reqHtml(requestPage(siteKey, { error, ...v }), status, REQUEST_CSP);
  if (env.REQ_RL && !(await env.REQ_RL.limit({ key: ip(req) })).success) return form404("Too many requests from your connection. Wait a minute, then try again.", {}, 429);
  if (Number(req.headers.get("content-length") || 0) > 16384) return form404("That\u2019s too long. Keep it short.", {}, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return form404("Something went wrong. Reload the page and try again."); }
  const v = readRequestForm(form);
  if ("error" in v) return form404(v.error, { name: String(form.get("name") || ""), reason: String(form.get("reason") || "") });
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET!, String(form.get("cf-turnstile-response") || ""), req.headers.get("cf-connecting-ip"))))
    return form404("We couldn\u2019t confirm you\u2019re a person. Try the check again.", v, 403);
  // housekeeping: forget old requests, but keep approved ones until their claim window has passed
  await env.DB.prepare("DELETE FROM token_requests WHERE created_at < ? AND (status != 'approved' OR decided_at < ?)").bind(now - KEEP_REQUESTS, now - CLAIM_WINDOW).run();
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM token_requests WHERE status = 'pending'").first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING) return form404("We have a lot of requests waiting right now. Try again in a few days.", v, 503);
  const code = newClaimCode();
  await env.DB.prepare("INSERT INTO token_requests (id, name, reason, claim_hash, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)")
    .bind(randomString(12), v.name, v.reason, await sha256Hex(code), now).run();
  return reqHtml(requestSentPage(`${url.origin}/request/${code}`));
}

async function handleClaim(req: Request, env: Env, code: string): Promise<Response> {
  const hash = await sha256Hex(code), now = Math.floor(Date.now() / 1000);
  const row = isClaimCode(code) ? await env.DB.prepare("SELECT id, status, decided_at, token_expires_at FROM token_requests WHERE claim_hash = ?").bind(hash).first<Pick<RequestRow, "id" | "status" | "decided_at" | "token_expires_at">>() : null;
  if (!row) return (await missLimited(req, env)) ?? notFound();
  const state = requestState(row, now);
  if (req.method === "POST" && state === "approved") {
    const tok = await newApiToken();
    // one statement each, in one transaction: the token row only appears if the request is still collectable
    const [ins] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO api_tokens (id, label, prefix, hash, created_at, created_by, expires_at)
        SELECT ?, COALESCE(label, 'request: ' || name), ?, ?, ?, 'request', token_expires_at FROM token_requests
        WHERE claim_hash = ? AND status = 'approved' AND decided_at >= ?`).bind(tok.id, tok.prefix, tok.hash, now, hash, now - CLAIM_WINDOW),
      env.DB.prepare("UPDATE token_requests SET status = 'claimed', claimed_at = ?, token_id = ? WHERE claim_hash = ? AND status = 'approved' AND decided_at >= ?").bind(now, tok.id, hash, now - CLAIM_WINDOW),
    ]);
    if ((ins.meta?.changes ?? 0) === 1) return reqHtml(tokenShownPage(tok.secret, row.token_expires_at));
    return reqHtml(requestStatusPage("claimed"));
  }
  return reqHtml(requestStatusPage(state));
}

async function serveView(req: Request, env: Env, ctx: ExecutionContext, it: Item) {
  ctx.waitUntil(env.DB.prepare("UPDATE items SET views = views + 1 WHERE id = ?").bind(it.id).run());
  if (it.kind === "link") return Response.redirect(it.target!, 302);
  let pasteText: string | null = null;
  if (it.kind === "paste") {
    const obj = await env.FILES.get(it.r2_key!);
    if (!obj) return notFound();
    pasteText = await obj.text();
  }
  return new Response(viewPage(it, links(req, it), pasteText), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "content-security-policy": PAGE_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

// ---------- background jobs ----------
function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function analyze(env: Env, id: string) {
  const it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
  if (!it || !it.r2_key) return;
  const obj = await env.FILES.get(it.r2_key);
  if (!obj) return;

  let thumb: ArrayBuffer | null = null;
  let aiInput: ArrayBuffer | null = null;
  let aiMime = "image/jpeg";
  if (env.IMAGES) {
    try {
      // dimensions for og:image:width/height (link previews)
      const src = await env.FILES.get(it.r2_key);
      const info = src ? await env.IMAGES.info(src.body) : null;
      if (info && "width" in info) { it.width = info.width; it.height = info.height; }
    } catch (e) {
      console.warn("image info failed", id, String(e));
    }
    try {
      const [a, b] = obj.body.tee();
      const out = await env.IMAGES.input(a).transform({ width: 480, height: 480, fit: "scale-down" }).output({ format: "image/webp", quality: 80 });
      thumb = await out.response().arrayBuffer();
      const ai = await env.IMAGES.input(b).transform({ width: 768, height: 768, fit: "scale-down" }).output({ format: "image/jpeg", quality: 85 });
      aiInput = await ai.response().arrayBuffer();
    } catch (e) {
      console.warn("thumbnail failed", id, String(e));
    }
  }
  if (thumb) {
    it.thumb_key = `${it.owner === PUBLIC_OWNER ? PUBLIC_PREFIX : ""}t/${id}.webp`;
    await env.FILES.put(it.thumb_key, thumb, { httpMetadata: { contentType: "image/webp" } });
  }
  if (!aiInput && it.size < 4 * 1024 * 1024 && /jpeg|png|webp/.test(it.mime || "")) {
    aiInput = await (await env.FILES.get(it.r2_key))!.arrayBuffer();
    aiMime = it.mime!;
  }
  let checked = false;
  if (env.AI && aiInput) {
    const model = (env.AI_MODEL || "@cf/moondream/moondream3.1-9B-A2B") as any;
    const image = `data:${aiMime};base64,${toBase64(aiInput)}`;
    // the binding may return the payload directly or wrapped in { result }
    const pick = (r: any, k: string) => r?.[k] ?? r?.result?.[k];
    try {
      const cap: any = await env.AI.run(model, { task: "caption", image, caption_length: "short", stream: false } as any);
      const caption = pick(cap, "caption");
      if (caption) it.alt = String(caption).trim().slice(0, 500);
    } catch (e) { console.warn("caption failed", id, String(e)); }
    try {
      const q: any = await env.AI.run(model, {
        task: "query", image, reasoning: false, max_tokens: 5, temperature: 0, stream: false,
        question: "Does this image contain nudity, sexual content or graphic gore? Answer only yes or no.",
      } as any);
      const answer = pick(q, "answer");
      if (answer) { it.nsfw = /^\s*yes/i.test(String(answer)) ? 1 : 0; checked = true; }
    } catch (e) { console.warn("nsfw check failed", id, String(e)); }
  }
  await env.DB.prepare("UPDATE items SET thumb_key = ?, alt = ?, nsfw = ?, width = ?, height = ? WHERE id = ?").bind(it.thumb_key, it.alt, it.nsfw, it.width ?? null, it.height ?? null, id).run();
  // a public image opens only once the sensitive content check has answered "no". If it flagged the image,
  // or couldn't run (no AI input, an AI error, no answer), the image stays on hold for the operator.
  if (it.blocked === CHECKING || it.blocked === NOT_CHECKED) {
    it.blocked = !checked ? NOT_CHECKED : it.nsfw === 1 ? "flagged as sensitive" : null;
    await env.DB.prepare("UPDATE items SET blocked = ? WHERE id = ?").bind(it.blocked, id).run();
    if (it.blocked) console.warn("file on hold", id, it.blocked);
  }
  await cacheItem(env, it);
}

/** Background safety pass for every upload: content hash, archive contents, optional malware hash lookup.
 * Runs as a Queue consumer (on Node.js: the in-process queue), never in the uploader's browser. Images go on to `analyze`. */
async function scanFile(env: Env, id: string) {
  const it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
  if (!it || !it.r2_key || it.kind !== "file") return;
  const obj = await env.FILES.get(it.r2_key);
  if (!obj) return;
  const ds = new crypto.DigestStream("SHA-256");
  await obj.body.pipeTo(ds);
  const sha256 = [...new Uint8Array(await ds.digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  // "checking" is the placeholder of a public upload that hasn't been scanned yet; "not checked" is retried on re-scan
  const pending = it.blocked === CHECKING || it.blocked === NOT_CHECKED;
  let blocked = pending ? null : it.blocked ?? null;

  if (!blocked && it.mime === "application/zip") {
    const tailLen = Math.min(it.size, 4 * 1024 * 1024);
    const tailObj = await env.FILES.get(it.r2_key, { range: { suffix: tailLen } });
    if (tailObj && "body" in tailObj) {
      const z = inspectZip(new Uint8Array(await tailObj.arrayBuffer()), it.size - tailLen);
      if (z?.programs.length) blocked = `archive contains programs: ${z.programs.slice(0, 5).join(", ")}`;
      else if (z?.encrypted) blocked = "encrypted archive";
    }
  }

  if (!blocked && env.MB_AUTH_KEY) {
    try {
      const r = await fetch("https://mb-api.abuse.ch/api/v1/", {
        method: "POST",
        headers: { "auth-key": env.MB_AUTH_KEY, "content-type": "application/x-www-form-urlencoded" },
        body: `query=get_info&hash=${sha256}`,
      });
      const j = (await r.json().catch(() => null)) as { query_status?: string; data?: { signature?: string }[] } | null;
      if (j?.query_status === "ok") blocked = `known malware${j.data?.[0]?.signature ? `: ${j.data[0].signature}` : ""}`;
    } catch (e) {
      console.warn("malware lookup failed", id, String(e));
    }
  }

  // public images wait for the sensitive content check in `analyze`, which needs Workers AI
  if (!blocked && pending && env.AI && IMAGE_TYPES.test(it.mime || "")) blocked = CHECKING;
  await env.DB.prepare("UPDATE items SET sha256 = ?, blocked = ? WHERE id = ?").bind(sha256, blocked, id).run();
  Object.assign(it, { sha256, blocked });
  await cacheItem(env, it);
  if (blocked === CHECKING) await analyze(env, id);
  else if (blocked) console.warn("file on hold", id, blocked);
  else if (IMAGE_TYPES.test(it.mime || "")) await analyze(env, id);
}

async function cleanup(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  for (let round = 0; round < 10; round++) {
    const { results } = await env.DB.prepare("SELECT * FROM items WHERE expires_at IS NOT NULL AND expires_at < ? LIMIT 200").bind(now).all<Item>();
    if (!results.length) break;
    for (const it of results) await deleteItem(env, it);
  }
  // daily counters of public uploads are only needed for the current day
  await env.DB.prepare("DELETE FROM public_usage WHERE day < ?").bind(utcDay() - 1).run().catch(() => null); // table missing until migration 0007
}

// ---------- public uploads (no token) ----------
async function handlePublic(req: Request, env: Env, ctx: ExecutionContext, url: URL, kind: "upload" | "paste"): Promise<Response> {
  if (!publicEnabled(env)) return err(404, "unknown endpoint");
  if (req.method !== "POST") return err(405, "method not allowed");
  const lim = publicLimits(env);
  const limitAddr = limitKey(ip(req));
  if (env.PUB_RL && !(await env.PUB_RL.limit({ key: limitAddr })).success) return err(429, "too many uploads, wait a minute");
  const len = Number(req.headers.get("content-length") || 0);
  if (!len || !req.body) return err(411, "content-length required");
  if (kind === "upload" && !(req.headers.get("content-type") || "").startsWith("multipart/form-data")) return err(415, "send the file as multipart/form-data");
  if (kind === "paste" && len > lim.pasteBytes * 6 + 65536) return err(413, `without a token, pastes are limited to ${Math.round(lim.pasteBytes / 1024)} KB`);
  const day = utcDay();
  const key = await usageKey(limitAddr, day, env.API_TOKEN || env.TURNSTILE_SECRET!);
  const used = await env.DB.prepare("SELECT uploads, bytes FROM public_usage WHERE key = ? AND day = ?").bind(key, day).first<{ uploads: number; bytes: number }>();
  if (!withinDailyCap(used, len, lim)) return err(429, "That\u2019s today\u2019s limit for uploads without a token. Try again tomorrow.");
  // every upload needs its own Turnstile check, solved on this site for this action
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET!, req.headers.get("x-turnstile") || "", req.headers.get("cf-connecting-ip"), fetch, PUBLIC_ACTION, url.hostname)))
    return err(403, "We couldn\u2019t confirm you\u2019re a person. Try again.");
  const who: Principal = { token: "", owner: PUBLIC_OWNER, master: false };
  const res = kind === "upload" ? await handleUpload(req, env, ctx, who, lim) : await handlePaste(req, env, who, lim);
  if (res.status === 201)
    await env.DB.prepare("INSERT INTO public_usage (key, day, uploads, bytes) VALUES (?, ?, 1, ?) ON CONFLICT (key, day) DO UPDATE SET uploads = uploads + 1, bytes = bytes + excluded.bytes")
      .bind(key, day, len).run();
  return res;
}

// ---------- router ----------
/**
 * Returns who the request is authorised as, or null.
 * Accepts the API_TOKEN secret (master token) and named tokens from the api_tokens table,
 * as long as they are not revoked and not expired.
 */
async function authenticate(req: Request, env: Env, ctx: ExecutionContext): Promise<Principal | null> {
  if (isAuthed(req, env.API_TOKEN)) return { token: env.API_TOKEN!, owner: MASTER_OWNER, master: true };
  const token = requestToken(req);
  if (!isNamedToken(token)) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT id, expires_at, revoked_at, last_used_at FROM api_tokens WHERE hash = ?")
    .bind(hash)
    .first<{ id: string; expires_at: number | null; revoked_at: number | null; last_used_at: number | null }>()
    .catch(() => null); // table missing until migration 0004 is applied
  const now = Math.floor(Date.now() / 1000);
  if (!row || !tokenUsable(row, now)) return null;
  if (!row.last_used_at || now - row.last_used_at >= 60) ctx.waitUntil(env.DB.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").bind(now, row.id).run());
  return { token, owner: row.id, master: false };
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;

  if (m === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (path === "/" && (m === "GET" || m === "HEAD")) {
    const pub = publicEnabled(env) ? publicLimits(env) : null;
    const lim = { multiMb: Number(env.MAX_MULTIPART_MB || 95), maxMb: Number(env.MAX_STREAM_MB || 500), ...(pub ? { pub: { siteKey: env.TURNSTILE_SITE_KEY!, maxMb: Math.round(pub.maxBytes / 1048576), pasteKb: Math.round(pub.pasteBytes / 1024) } } : {}) };
    // with public uploads on, the start page carries the Turnstile widget
    return new Response(landingPage(url.host, lim, url.origin), { headers: { ...htmlHeaders("public, max-age=300"), ...(pub ? { "content-security-policy": REQUEST_CSP } : {}) } });
  }
  // SEO: only the landing page is meant to be found; uploads carry X-Robots-Tag: noindex (see fetch below).
  if (path === "/robots.txt") return new Response(robotsTxt(url.origin), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/sitemap.xml") return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc><changefreq>monthly</changefreq></url></urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/og.png") {
    const og = await env.FILES.get("_static/og.png");
    return og ? new Response(og.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }) : notFound();
  }
  if (m === "GET" && (path.startsWith("/assets/") || path.startsWith("/favicon") || path === "/llms.txt" || path === "/og-card")) {
    const a = await handleAsset(req, ctx);
    if (a) return a;
  }
  if (path === "/health") return json({ ok: true });

  if (LEGAL_PATHS[path] && (m === "GET" || m === "HEAD")) {
    const legal = parseLegal(env.LEGAL);
    if (!legal) return notFound();
    return new Response(legalPage(LEGAL_PATHS[path], legal, { malwareLookup: !!env.MB_AUTH_KEY, abuseEmail: env.ABUSE_EMAIL || null, requests: !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET), public: publicEnabled(env) }), { headers: htmlHeaders("public, max-age=3600") });
  }

  if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && (path === "/request" || path.startsWith("/request/"))) {
    if (path === "/request") {
      if (m === "GET" || m === "HEAD") return reqHtml(requestPage(env.TURNSTILE_SITE_KEY), 200, REQUEST_CSP);
      if (m === "POST") return handleTokenRequest(req, env, url);
    } else {
      const code = path.slice(9);
      if (m === "GET" || m === "HEAD" || m === "POST") return handleClaim(req, env, code);
    }
    return err(405, "method not allowed");
  }

  if (path === "/api/public/upload" || path === "/api/public/paste") return handlePublic(req, env, ctx, url, path === "/api/public/upload" ? "upload" : "paste");

  if (path.startsWith("/api/")) {
    const who = await authenticate(req, env, ctx);
    if (!who) {
      // slow down token guessing: a handful of failed attempts per IP and minute, then 429
      if (env.AUTH_RL && !(await env.AUTH_RL.limit({ key: ip(req) })).success) return err(429, "too many attempts, wait a minute");
      return err(401, "unauthorized: send Authorization: Bearer <token>");
    }
    if (path === "/api/upload" && (m === "POST" || m === "PUT")) return handleUpload(req, env, ctx, who);
    if (path === "/api/paste" && m === "POST") return handlePaste(req, env, who);
    if (path === "/api/shorten" && m === "POST") return handleShorten(req, env, who);
    if (path === "/api/list" && m === "GET") return handleList(req, env, who);
    if (path === "/api/sharex" && m === "GET") return sharexConfig(req, who.token, url.searchParams.get("type") || "upload");
    const im = /^\/api\/items\/([A-Za-z0-9]+)$/.exec(path);
    if (im) {
      const it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(im[1]).first<Item>();
      // another token's item looks exactly like a missing one
      if (!it || !canManage(who, it.owner)) return err(404, "not found");
      if (m === "DELETE") { await deleteItem(env, it); return json({ deleted: it.id }); }
      if (m === "GET") return json({ ...it, ...links(req, it) });
      if (m === "POST" && url.searchParams.get("reanalyze") !== null) { await env.JOBS.send({ type: "scan", id: it.id }); return json({ queued: it.id }); }
      if (m === "POST" && url.searchParams.get("release") !== null) {
        // releasing a quarantined file overrides the scanners, so only the operator's master token may do it
        if (!who.master) return err(403, "only the operator can release a file on hold");
        await env.DB.prepare("UPDATE items SET blocked = NULL WHERE id = ?").bind(it.id).run();
        it.blocked = null;
        await cacheItem(env, it);
        return json({ released: it.id });
      }
    }
    return err(404, "unknown endpoint");
  }

  const del = /^\/d\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/.exec(path);
  if (del && (m === "GET" || m === "POST" || m === "DELETE")) {
    const it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(del[1]).first<Item>();
    if (!it || !timingSafeEqual(it.delete_token, del[2])) return (await missLimited(req, env)) ?? err(404, "not found");
    // GET only asks: link previews and crawlers that open a deletion URL must not delete anything
    if (m === "GET") return new Response(deletePage(it.name || it.id, false), { headers: htmlHeaders("no-store") });
    await deleteItem(env, it);
    if (m === "DELETE") return new Response(`deleted ${it.id}\n`, { headers: { "content-type": "text/plain" } });
    return new Response(deletePage(it.name || it.id, true), { headers: htmlHeaders("no-store") });
  }


  const v = /^\/([A-Za-z0-9]{3,16})(?:\.[A-Za-z0-9]{1,8})?(?:\/(raw|dl|thumb)(?:\.[A-Za-z0-9]{1,8})?)?$/.exec(path);
  if (v && (m === "GET" || m === "HEAD")) {
    const it = await getItem(env, v[1]);
    if (!it) return (await missLimited(req, env)) ?? notFound();
    const sub = v[2];
    if (it.blocked === CHECKING) return new Response(checkingPage(), { status: 503, headers: { ...htmlHeaders("no-store"), "retry-after": "5", refresh: "5" } });
    if (it.blocked) return new Response(heldPage(), { status: 451, headers: htmlHeaders("no-store") });
    // "/id.png" (ShareX-style direct link) behaves like /id/raw
    const direct = !sub && path.includes(".");
    if (sub === "thumb") return serveThumb(req, env, it);
    if (sub === "raw" || sub === "dl" || direct) {
      if (it.kind === "link") return Response.redirect(it.target!, 302);
      return serveRaw(req, env, it, sub === "dl");
    }
    return serveView(req, env, ctx, it);
  }
  return notFound();
}

const INDEXABLE = new Set(["/", "/robots.txt", "/sitemap.xml", "/llms.txt", "/og.png", "/favicon.svg", "/favicon.ico"]); // legal pages carry their own noindex meta

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, x-expires, x-filename, x-api-key", "access-control-max-age": "86400" };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    try {
      configureUi({ legal: !!parseLegal(env.LEGAL), abuseEmail: env.ABUSE_EMAIL || null, requests: !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET), public: publicEnabled(env), brand: brandFrom(env) });
      const res = await route(req, env, ctx);
      const path = new URL(req.url).pathname;
      if (INDEXABLE.has(path) || path.startsWith("/assets/")) return res;
      // everything user-generated (views, raw files, thumbs, short links, API, 404) stays out of search engines
      const r = new Response(res.body, res);
      r.headers.set("x-robots-tag", "noindex, nofollow, noimageindex");
      if (path.startsWith("/api/")) {
        for (const [k, v] of Object.entries(corsHeaders())) r.headers.set(k, v);
        // API answers depend on the token: never store them in a shared cache
        if (!r.headers.has("cache-control")) r.headers.set("cache-control", "private, no-store");
        r.headers.set("vary", "authorization");
      }
      return r;
    } catch (e) {
      console.error("unhandled", String(e), (e as Error)?.stack);
      return err(500, "internal error");
    }
  },
  async queue(batch: MessageBatch<Job>, env: Env) {
    for (const msg of batch.messages) {
      try {
        if (msg.body.type === "scan") await scanFile(env, msg.body.id);
        else if (msg.body.type === "analyze") await analyze(env, msg.body.id);
        msg.ack();
      } catch (e) {
        console.error("job failed", msg.body, String(e));
        msg.retry({ delaySeconds: 30 });
      }
    }
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env, Job>;
