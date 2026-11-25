# drop

ShareX-compatible file host, pastebin and URL shortener on Cloudflare Workers. Live at **https://drop.shiftbloom.studio**.

- **Uploads** (images, video, any file) stored in R2, with view pages, raw links, range requests (video seeking) and Discord/OG embeds
- **Pastes** with syntax highlighting and raw view
- **Short links** with 302 redirects
- **Expiry** per item (`10m`, `1h`, `1d`, `7d`, `30d`, `90d`, `1y`, `never` or e.g. `12h`), cleaned up hourly by a cron trigger
- **Thumbnails** via the Images binding and **alt text + NSFW flag** via Workers AI, generated in the background through a Queue
- **Deletion URLs** per item (ShareX "Deletion URL" works out of the box)
- Web UI at `/` for drag & drop, Ctrl+V paste, pastes, shortening and a list of recent items

Uploads and the API need the API token; viewing is public for anyone with the link.

## Cloudflare resources

| Binding | Type | Name |
| --- | --- | --- |
| `FILES` | R2 bucket | `drop-files` (`f/<id>/<name>`, `p/<id>.txt`, `t/<id>.webp`) |
| `DB` | D1 | `drop-db` (table `items`, source of truth) |
| `LINKS` | KV | `drop-links` (hot cache `i:<id>`, TTL = expiry) |
| `JOBS` | Queue | `drop-jobs` (thumbnail + AI analysis) |
| `AI` | Workers AI | `@cf/moondream/moondream3.1-9B-A2B` (override with `AI_MODEL`) |
| `IMAGES` | Images | thumbnail transforms |
| `API_TOKEN` | secret | upload/API auth |

Cron: `17 * * * *` deletes expired items from R2, KV and D1.

## API

All `/api/*` routes need `Authorization: Bearer <token>` (or `X-API-Key`).

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/upload` | multipart `file` (+ optional `expires`) | up to `MAX_MULTIPART_MB` (95) |
| `PUT` | `/api/upload?filename=x.mp4` | raw bytes | streamed to R2, up to `MAX_STREAM_MB` (500) |
| `POST` | `/api/paste` | JSON `{content, lang, title, expires}`, form `content`, or raw text | |
| `POST` | `/api/shorten` | JSON `{url, expires}`, form `url`, or raw text | |
| `GET` | `/api/list?limit=50&kind=file` | | recent items + stats |
| `GET/DELETE` | `/api/items/:id` | | `POST ?reanalyze` re-queues AI |
| `GET` | `/api/sharex?type=upload\|paste\|shorten` | | downloads a ready `.sxcu` |

Expiry can also be sent as `X-Expires` header. Responses:

```json
{ "id": "aB3dE", "url": "https://drop.shiftbloom.studio/aB3dE", "raw": ".../aB3dE/raw.png",
  "thumbnail": ".../aB3dE/thumb", "delete": ".../d/aB3dE/<token>", "expires_at": null }
```

Public routes: `/:id` (view page / redirect), `/:id/raw`, `/:id.ext` (direct), `/:id/dl` (download), `/:id/thumb`, `/d/:id/:deleteToken`.

## ShareX

Open https://drop.shiftbloom.studio, enter the token and click *Upload-Config* / *Paste-Config* / *Shortener-Config*, then double-click the `.sxcu` files. Or:

```sh
curl -H "Authorization: Bearer $DROP_TOKEN" "https://drop.shiftbloom.studio/api/sharex?type=upload" -o drop.sxcu
```

## CLI examples

```sh
curl -H "Authorization: Bearer $DROP_TOKEN" -F file=@shot.png https://drop.shiftbloom.studio/api/upload
cat log.txt | curl -H "Authorization: Bearer $DROP_TOKEN" --data-binary @- "https://drop.shiftbloom.studio/api/paste?lang=log&expires=7d"
curl -H "Authorization: Bearer $DROP_TOKEN" -d url=https://example.com https://drop.shiftbloom.studio/api/shorten
```

## Development

```sh
npm install
npm run typecheck
npx wrangler d1 migrations apply drop-db --local
npm run dev
npm run deploy           # needs CLOUDFLARE_API_TOKEN
npx wrangler secret put API_TOKEN
```

## Security notes

- HTML/JS/SVG uploads are served with `Content-Security-Policy: sandbox` and HTML/JS as `text/plain`, so uploads can't run script on this origin.
- Delete tokens and the API token are compared in constant time.
- `robots.txt` disallows indexing; view pages carry `noindex`.

## Costs

R2 storage ($0.015/GB-month, no egress), D1/KV reads are tiny per request, one Queue message plus two Workers AI calls per image upload. Turn off AI by removing the `ai` binding.
