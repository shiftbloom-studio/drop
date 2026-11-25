# drop.

**A tiny, self-hostable file host, pastebin and URL shortener on Cloudflare Workers.** ShareX-compatible, with expiring links, thumbnails and AI alt text.

Runs at [drop.shiftbloom.studio](https://drop.shiftbloom.studio). Made by [shiftbloom studio](https://shiftbloom.studio). Licensed under AGPL-3.0-or-later.

- **Uploads**: images, video and any file, stored in R2. Each upload gets a view page, a raw link, a download link, range requests for video seeking, and OpenGraph/Discord embeds.
- **Pastes**: syntax highlighting and a raw view.
- **Short links**: 302 redirects.
- **Expiry** per item (`10m`, `1h`, `1d`, `7d`, `30d`, `90d`, `1y`, `never` or a custom value like `12h`/`3d`/`2w`). An hourly cron removes expired items.
- **Thumbnails** through the Images binding, and **alt text plus an NSFW flag** through Workers AI. Both run in the background through a Queue.
- **Deletion URLs** per item, so the ShareX "Deletion URL" works out of the box.
- **Web UI** with drag & drop, Ctrl+V paste, pastes, shortening and a list of recent items.
- **Privacy**: fonts and highlight.js are proxied through the worker, so visitors never contact third-party CDNs. `robots.txt` and `noindex` keep items out of search engines.

Uploading and every `/api/*` route need the API token. Viewing an item is public for anyone who has its link.

## Architecture

```
ShareX / curl / browser
        │
        ▼
Worker "drop"  ── index.js (API, routing)  +  ui.js (pages, Bloom SVG, asset proxy)
   │      │        │         │
   R2     D1       KV        Queue ──► consumer (same worker)
 files   items   hot cache    │
 thumbs  (truth) (i:<id>)     ├─ Images binding → 480px WebP thumbnail
                              └─ Workers AI (moondream) → alt text + NSFW flag
Cron (hourly) → delete expired items from R2, KV and D1
```

| Binding | Type | Default name | Purpose |
| --- | --- | --- | --- |
| `FILES` | R2 bucket | `drop-files` | `f/<id>/<name>`, `p/<id>.txt`, `t/<id>.webp` |
| `DB` | D1 | `drop-db` | `items` table, source of truth |
| `LINKS` | KV | any | cache `i:<id>`, TTL = expiry |
| `JOBS` | Queue | `drop-jobs` | thumbnail + AI jobs |
| `AI` | Workers AI | – | optional, `AI_MODEL` overrides `@cf/moondream/moondream3.1-9B-A2B` |
| `IMAGES` | Images | – | optional, thumbnails |
| `API_TOKEN` | secret | – | upload/API auth |
| `MAX_MULTIPART_MB` / `MAX_STREAM_MB` | vars | `95` / `500` | upload limits |

## Self-hosting

You need a Cloudflare account with Workers Paid, which Queues require. R2, D1 and KV are enabled on the account.

```sh
git clone https://github.com/shiftbloom-studio/drop && cd drop
npm install
npx wrangler login

# 1. create resources and paste the printed IDs into wrangler.jsonc
npx wrangler r2 bucket create drop-files
npx wrangler d1 create drop-db              # → database_id
npx wrangler kv namespace create LINKS      # → id
npx wrangler queues create drop-jobs

# 2. schema + secret
npm run db:migrate
npx wrangler secret put API_TOKEN           # use a long random string

# 3. optional: uncomment "routes" in wrangler.jsonc for your own domain
npm run deploy
```

Without a custom domain the worker answers on `drop.<your-subdomain>.workers.dev`. To run without AI or thumbnails, remove the `ai`/`images` bindings. Everything else keeps working.

### Deploy from GitHub Actions

`.github/workflows/deploy.yml` deploys on manual dispatch. Add these repository secrets: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" plus D1/R2/Queues edit) and `CLOUDFLARE_ACCOUNT_ID`.

## Local development

```sh
cp .dev.vars.example .dev.vars              # set API_TOKEN
npx wrangler d1 migrations apply drop-db --local
npm run dev                                 # http://localhost:8787
npm run check                               # typecheck + tests + build
```

Workers AI and Images need a Cloudflare connection. Locally they fail gracefully, so uploads work and only the thumbnail and alt text are missing.

## API

All `/api/*` routes need `Authorization: Bearer <token>`. `X-API-Key: <token>` also works.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/upload` | multipart `file` (+ optional `expires`) | up to `MAX_MULTIPART_MB` |
| `PUT` | `/api/upload?filename=x.mp4` | raw bytes | streamed to R2, up to `MAX_STREAM_MB` |
| `POST` | `/api/paste` | JSON `{content, lang, title, expires}`, form `content`, or raw text | |
| `POST` | `/api/shorten` | JSON `{url, expires}`, form `url`, or raw text | |
| `GET` | `/api/list?limit=50&kind=file` | | recent items + totals |
| `GET` / `DELETE` | `/api/items/:id` | | `POST /api/items/:id?reanalyze` re-queues AI |
| `GET` | `/api/sharex?type=upload\|paste\|shorten` | | ready-made `.sxcu` |

You can also send the expiry as an `X-Expires` header. Response:

```json
{ "id": "aB3dE", "kind": "file", "url": "https://drop.example.com/aB3dE",
  "raw": "https://drop.example.com/aB3dE/raw.png", "thumbnail": "https://drop.example.com/aB3dE/thumb",
  "delete": "https://drop.example.com/d/aB3dE/<delete-token>", "expires_at": null }
```

Public routes: `/:id` (view page or redirect), `/:id/raw`, `/:id.ext` (direct link), `/:id/dl`, `/:id/thumb`, `/d/:id/:deleteToken`.

### ShareX

Open your instance, enter the token and click *upload-config*, *paste-config* or *shortener-config*. Then double-click the downloaded `.sxcu` files. Or from a shell:

```sh
curl -H "Authorization: Bearer $DROP_TOKEN" "https://drop.example.com/api/sharex?type=upload" -o drop.sxcu
```

### curl

```sh
curl -H "Authorization: Bearer $DROP_TOKEN" -F file=@shot.png https://drop.example.com/api/upload
cat log.txt | curl -H "Authorization: Bearer $DROP_TOKEN" --data-binary @- "https://drop.example.com/api/paste?lang=log&expires=7d"
curl -H "Authorization: Bearer $DROP_TOKEN" -d url=https://example.com https://drop.example.com/api/shorten
```

## Security model

- A single shared API token protects uploads. Treat `.sxcu` files like passwords. Rotate the token with `wrangler secret put API_TOKEN`.
- HTML, JS and SVG uploads are served with `Content-Security-Policy: sandbox`, and HTML/JS are served as `text/plain`, so uploads never run script on your origin.
- Delete tokens and the API token are compared in constant time.
- Rate limiting, WAF and bot rules belong in your Cloudflare zone, not in this code.

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Design

The UI follows the shiftbloom studio brand book: white paper and ink, Bloom Red `#FF2E52` as the only accent, and the Bloom mark drawn as SVG from its construction spec. Type is set in Clash Display, General Sans and JetBrains Mono. Motion uses the Bloom Ease `cubic-bezier(.22,1.1,.36,1)`. When you fork, you are welcome to restyle `src/html.ts`.

`src/ui.ts` ships as its own module (`ui.js`), so you can change the look without touching the API code.

## Costs

Expect a few cents a month for personal use. R2 storage costs $0.015/GB-month with no egress fees. Each image upload uses one queue message and two small Workers AI calls. D1 and KV traffic is a handful of operations per request.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright © 2026 shiftbloom studio and contributors.

drop is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

If you run a modified version for others over a network, AGPL section 13 requires you to offer those users your source code. The footer's *source* link exists for this. Point `SOURCE_URL` in `src/html.ts` at your fork.
