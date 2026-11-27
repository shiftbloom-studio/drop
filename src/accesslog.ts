// One cleaned log line per request, written when the Worker's logs are exported (POSTHOG_LOGS set).
// Cloudflare's own invocation logs carry the full URL, so turn them off for the export
// ("invocation_logs": false) and rely on this line instead: no query string, file/text/link ids,
// deletion codes and claim codes are masked, and only a few harmless headers are kept.

import { trimTrailingSlashes } from "./util";

const KEEP = new Set([
  "/", "/robots.txt", "/sitemap.xml", "/og.png", "/og-card", "/llms.txt", "/health", "/request",
  "/privacy", "/datenschutz", "/imprint", "/impressum", "/terms", "/nutzungsbedingungen", "/content-policy", "/inhaltsrichtlinie",
  "/api/upload", "/api/paste", "/api/shorten", "/api/list", "/api/sharex", "/api/public/upload", "/api/public/paste",
]);

/** The request path with everything that could open, delete or claim something replaced by a placeholder. */
export function logPath(pathname: string): string {
  const p = trimTrailingSlashes(pathname) || "/";
  if (KEEP.has(p) || /^\/(assets\/[\w./-]+|favicon[\w.-]*)$/.test(p)) return p;
  if (p.startsWith("/api/items/")) return "/api/items/:id";
  if (p.startsWith("/api/")) return "/api/:other";
  if (p.startsWith("/request/")) return "/request/:code";
  if (p.startsWith("/d/")) return "/d/:id/:code";
  const sub = /^\/[^/]+\/(raw|dl|thumb)(\.[A-Za-z0-9]{1,8})?$/.exec(p);
  return sub ? `/:id/${sub[1]}` : "/:id";
}

const HEADERS = ["user-agent", "accept-language", "content-type", "content-length"];

export function accessLog(req: Request, status: number, ms: number) {
  const cf = (req as Request & { cf?: { country?: string; colo?: string } }).cf;
  const headers: Record<string, string> = {};
  for (const h of HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v.slice(0, 200);
  }
  console.log({
    message: "request",
    method: req.method,
    path: logPath(new URL(req.url).pathname),
    status,
    ms,
    ip: req.headers.get("cf-connecting-ip") || undefined,
    country: cf?.country,
    colo: cf?.colo,
    headers,
  });
}
