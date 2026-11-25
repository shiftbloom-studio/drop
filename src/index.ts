/**
 * drop — ShareX-compatible file host, pastebin and URL shortener on Cloudflare Workers.
 * Storage: R2 (blobs + thumbnails), D1 (metadata, source of truth), KV (hot lookup cache for short ids).
 * Background: Queue consumer builds thumbnails (Images binding) and alt text + NSFW flag (Workers AI).
 */
import { landingPage, viewPage, notFoundPage, handleAsset } from "./ui.js";

export interface Env {
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
}
type Job = { type: "analyze"; id: string };

const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const THUMB_TYPES = /^image\/(jpeg|png|gif|webp|avif|bmp|tiff)$/;
const EXPIRY: Record<string, number> = { "10m": 600, "1h": 3600, "1d": 86400, "7d": 604800, "30d": 2592000, "90d": 7776000, "1y": 31536000 };

// ---------- helpers ----------
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
const err = (status: number, message: string) => json({ error: message }, status);

function randomString(len: number, alphabet = ID_ALPHABET) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function timingSafeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function isAuthed(req: Request, env: Env) {
  if (!env.API_TOKEN) return false;
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : req.headers.get("x-api-key") || new URL(req.url).searchParams.get("token") || "";
  return token.length > 0 && timingSafeEqual(token, env.API_TOKEN);
}

function parseExpiry(v: string | null | undefined): number | null | undefined {
  if (!v || v === "never" || v === "0") return null;
  if (v in EXPIRY) return Math.floor(Date.now() / 1000) + EXPIRY[v];
  const m = /^(\d+)([mhdw])$/.exec(v);
  if (m) return Math.floor(Date.now() / 1000) + Number(m[1]) * { m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as "m"];
  return undefined; // invalid
}

function extOf(name: string | null) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function sanitizeName(name: string) {
  return name.replace(/[\u0000-\u001f\/\\"]/g, "_").slice(0, 200) || "file";
}

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
    thumbnail: it.kind === "file" && THUMB_TYPES.test(it.mime || "") ? `${b}/${it.id}/thumb` : null,
    delete: `${b}/d/${it.id}/${it.delete_token}`,
    expires_at: it.expires_at ? new Date(it.expires_at * 1000).toISOString() : null,
  };
}

async function newId(env: Env) {
  for (let len = 5; len < 10; len++) {
    for (let i = 0; i < 3; i++) {
      const id = randomString(len);
      const hit = await env.DB.prepare("SELECT 1 FROM items WHERE id = ?").bind(id).first();
      if (!hit) return id;
    }
  }
  throw new Error("could not allocate id");
}

async function saveItem(env: Env, it: Item) {
  await env.DB.prepare(
    `INSERT INTO items (id, kind, r2_key, name, mime, size, target, lang, created_at, expires_at, delete_token, thumb_key, alt, nsfw, views)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
  ).bind(it.id, it.kind, it.r2_key, it.name, it.mime, it.size, it.target, it.lang, it.created_at, it.expires_at, it.delete_token, it.thumb_key, it.alt, it.nsfw).run();
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
  if (!it) {
    it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
    if (it) await cacheItem(env, it);
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
async function handleUpload(req: Request, env: Env, ctx: ExecutionContext) {
  const url = new URL(req.url);
  const ct = req.headers.get("content-type") || "";
  let body: ReadableStream | ArrayBuffer, name: string, mime: string, size: number;
  let expiresRaw = req.headers.get("x-expires") || url.searchParams.get("expires");

  if (ct.startsWith("multipart/form-data")) {
    const max = Number(env.MAX_MULTIPART_MB || 95) * 1024 * 1024;
    const len = Number(req.headers.get("content-length") || 0);
    if (len > max) return err(413, `multipart uploads are limited to ${env.MAX_MULTIPART_MB || 95} MB; use PUT /api/upload for larger files`);
    const form = await req.formData();
    const f = (form.get("file") || form.get("sharex") || form.get("files[]")) as unknown;
    if (!f || typeof f === "string") return err(400, "missing form field 'file'");
    const file = f as File;
    expiresRaw = (form.get("expires") as string | null) || expiresRaw;
    name = sanitizeName(file.name || "upload");
    mime = file.type || "application/octet-stream";
    size = file.size;
    body = await file.arrayBuffer();
  } else {
    // raw streaming upload: PUT/POST /api/upload?filename=foo.mp4 with the bytes as body
    const len = Number(req.headers.get("content-length") || 0);
    if (!len || !req.body) return err(411, "content-length required for raw uploads");
    if (len > Number(env.MAX_STREAM_MB || 500) * 1024 * 1024) return err(413, "file too large");
    name = sanitizeName(url.searchParams.get("filename") || req.headers.get("x-filename") || "upload");
    mime = ct.split(";")[0] || "application/octet-stream";
    size = len;
    body = req.body.pipeThrough(new FixedLengthStream(len));
  }
  if (size === 0) return err(400, "empty file");
  const expires_at = parseExpiry(expiresRaw);
  if (expires_at === undefined) return err(400, "invalid expires (use 10m, 1h, 1d, 7d, 30d, 90d, 1y, never or e.g. 12h)");

  const id = await newId(env);
  const it = baseItem(id, "file", expires_at);
  Object.assign(it, { r2_key: `f/${id}/${name}`, name, mime, size });
  await env.FILES.put(it.r2_key!, body, {
    httpMetadata: { contentType: mime, contentDisposition: `inline; filename="${name}"` },
    customMetadata: { id },
  });
  await saveItem(env, it);
  if (THUMB_TYPES.test(mime)) ctx.waitUntil(env.JOBS.send({ type: "analyze", id }));
  return json(links(req, it), 201);
}

async function handlePaste(req: Request, env: Env) {
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
  const expires_at = parseExpiry(expires);
  if (expires_at === undefined) return err(400, "invalid expires");
  const id = await newId(env);
  const it = baseItem(id, "paste", expires_at);
  const name = sanitizeName(title || `${id}.${lang || "txt"}`);
  Object.assign(it, { r2_key: `p/${id}.txt`, name, mime: "text/plain; charset=utf-8", size: new TextEncoder().encode(content).length, lang: lang.replace(/[^a-z0-9+#-]/gi, "").slice(0, 20) || null });
  await env.FILES.put(it.r2_key!, content, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
  await saveItem(env, it);
  return json(links(req, it), 201);
}

async function handleShorten(req: Request, env: Env) {
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
  await saveItem(env, it);
  return json(links(req, it), 201);
}

function sharexConfig(req: Request, env: Env, type: string) {
  const b = baseUrl(req);
  const host = new URL(req.url).host;
  const common = { Version: "16.1.0", Name: "", DestinationType: "", RequestMethod: "POST", RequestURL: "", Headers: { Authorization: `Bearer ${env.API_TOKEN}` }, Body: "", URL: "{json:url}", DeletionURL: "{json:delete}", ErrorMessage: "{json:error}" } as Record<string, unknown>;
  if (type === "paste") Object.assign(common, { Name: `${host} (paste)`, DestinationType: "TextUploader", RequestURL: `${b}/api/paste`, Body: "MultipartFormData", Arguments: { content: "{input}", lang: "txt" } });
  else if (type === "shorten") Object.assign(common, { Name: `${host} (shorten)`, DestinationType: "URLShortener", RequestURL: `${b}/api/shorten`, Body: "MultipartFormData", Arguments: { url: "{input}" }, DeletionURL: "{json:delete}" });
  else Object.assign(common, { Name: `${host} (upload)`, DestinationType: "ImageUploader, FileUploader", RequestURL: `${b}/api/upload`, Body: "MultipartFormData", FileFormName: "file", ThumbnailURL: "{json:thumbnail}" });
  return new Response(JSON.stringify(common, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${host}-${type || "upload"}.sxcu"`, "cache-control": "no-store" },
  });
}

async function handleList(req: Request, env: Env) {
  const u = new URL(req.url);
  const limit = Math.min(Number(u.searchParams.get("limit") || 50), 200);
  const kind = u.searchParams.get("kind");
  const stmt = kind
    ? env.DB.prepare("SELECT * FROM items WHERE kind = ? ORDER BY created_at DESC LIMIT ?").bind(kind, limit)
    : env.DB.prepare("SELECT * FROM items ORDER BY created_at DESC LIMIT ?").bind(limit);
  const { results } = await stmt.all<Item>();
  const stats = await env.DB.prepare("SELECT kind, COUNT(*) n, COALESCE(SUM(size),0) bytes FROM items GROUP BY kind").all();
  return json({ items: results.map((it) => ({ ...links(req, it), name: it.name, mime: it.mime, size: it.size, alt: it.alt, nsfw: it.nsfw, views: it.views, created_at: new Date(it.created_at * 1000).toISOString() })), stats: stats.results });
}

// ---------- public views ----------
function safeRawHeaders(it: Item, obj: R2ObjectBody | R2Object, download: boolean) {
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("accept-ranges", "bytes");
  h.set("x-content-type-options", "nosniff");
  h.set("cache-control", it.expires_at ? "public, max-age=300" : "public, max-age=86400");
  // never let uploaded content run as active content on our origin
  const mime = (it.mime || "").toLowerCase();
  if (/html|xml|svg|javascript|ecmascript/.test(mime)) {
    h.set("content-security-policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    if (/html|javascript|ecmascript/.test(mime)) h.set("content-type", "text/plain; charset=utf-8");
  }
  h.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${it.name || it.id}"`);
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
  if (it.kind === "file" && THUMB_TYPES.test(it.mime || "")) return serveRaw(req, env, it, false);
  return notFound();
}

const PAGE_CSP = "default-src 'none'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; object-src 'self'; base-uri 'none'; form-action 'self'";
const htmlHeaders = (cache: string) => ({ "content-type": "text/html; charset=utf-8", "cache-control": cache, "content-security-policy": PAGE_CSP, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
const notFound = () => new Response(notFoundPage(), { status: 404, headers: htmlHeaders("no-store") });

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
    it.thumb_key = `t/${id}.webp`;
    await env.FILES.put(it.thumb_key, thumb, { httpMetadata: { contentType: "image/webp" } });
  }
  if (!aiInput && it.size < 4 * 1024 * 1024 && /jpeg|png|webp/.test(it.mime || "")) {
    aiInput = await (await env.FILES.get(it.r2_key))!.arrayBuffer();
    aiMime = it.mime!;
  }
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
      if (answer) it.nsfw = /^\s*yes/i.test(String(answer)) ? 1 : 0;
    } catch (e) { console.warn("nsfw check failed", id, String(e)); }
  }
  await env.DB.prepare("UPDATE items SET thumb_key = ?, alt = ?, nsfw = ? WHERE id = ?").bind(it.thumb_key, it.alt, it.nsfw, id).run();
  await cacheItem(env, it);
}

async function cleanup(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  for (let round = 0; round < 10; round++) {
    const { results } = await env.DB.prepare("SELECT * FROM items WHERE expires_at IS NOT NULL AND expires_at < ? LIMIT 200").bind(now).all<Item>();
    if (!results.length) break;
    for (const it of results) await deleteItem(env, it);
  }
}

// ---------- router ----------
async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const m = req.method;

  if (m === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (path === "/" && (m === "GET" || m === "HEAD")) return new Response(landingPage(url.host), { headers: htmlHeaders("public, max-age=300") });
  if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  if (m === "GET" && (path.startsWith("/assets/") || path.startsWith("/favicon"))) {
    const a = await handleAsset(req, ctx);
    if (a) return a;
  }
  if (path === "/health") return json({ ok: true });

  if (path.startsWith("/api/")) {
    if (!isAuthed(req, env)) return err(401, "unauthorized: send Authorization: Bearer <token>");
    if (path === "/api/upload" && (m === "POST" || m === "PUT")) return handleUpload(req, env, ctx);
    if (path === "/api/paste" && m === "POST") return handlePaste(req, env);
    if (path === "/api/shorten" && m === "POST") return handleShorten(req, env);
    if (path === "/api/list" && m === "GET") return handleList(req, env);
    if (path === "/api/sharex" && m === "GET") return sharexConfig(req, env, url.searchParams.get("type") || "upload");
    const im = /^\/api\/items\/([A-Za-z0-9]+)$/.exec(path);
    if (im) {
      const it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(im[1]).first<Item>();
      if (!it) return err(404, "not found");
      if (m === "DELETE") { await deleteItem(env, it); return json({ deleted: it.id }); }
      if (m === "GET") return json({ ...it, ...links(req, it) });
      if (m === "POST" && url.searchParams.get("reanalyze") !== null) { await env.JOBS.send({ type: "analyze", id: it.id }); return json({ queued: it.id }); }
    }
    return err(404, "unknown endpoint");
  }

  const del = /^\/d\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/.exec(path);
  if (del && (m === "GET" || m === "POST" || m === "DELETE")) {
    const it = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(del[1]).first<Item>();
    if (!it || !timingSafeEqual(it.delete_token, del[2])) return err(404, "not found");
    await deleteItem(env, it);
    return new Response(`deleted ${it.id}\n`, { headers: { "content-type": "text/plain" } });
  }

  const v = /^\/([A-Za-z0-9]{3,16})(?:\.[A-Za-z0-9]{1,8})?(?:\/(raw|dl|thumb)(?:\.[A-Za-z0-9]{1,8})?)?$/.exec(path);
  if (v && (m === "GET" || m === "HEAD")) {
    const it = await getItem(env, v[1]);
    if (!it) return notFound();
    const sub = v[2];
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

function corsHeaders() {
  return { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, x-expires, x-filename, x-api-key", "access-control-max-age": "86400" };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    try {
      const res = await route(req, env, ctx);
      if (new URL(req.url).pathname.startsWith("/api/")) {
        const r = new Response(res.body, res);
        for (const [k, v] of Object.entries(corsHeaders())) r.headers.set(k, v);
        return r;
      }
      return res;
    } catch (e) {
      console.error("unhandled", String(e), (e as Error)?.stack);
      return err(500, "internal error");
    }
  },
  async queue(batch: MessageBatch<Job>, env: Env) {
    for (const msg of batch.messages) {
      try {
        if (msg.body.type === "analyze") await analyze(env, msg.body.id);
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
