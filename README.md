# drop.

drop is where shiftbloom studio's screenshots go before they get sent anywhere. It's one Cloudflare Worker. Files land in R2 and you get back a five-character link on your own domain. Text pastes and short URLs use the same kind of link, and ShareX can upload to it directly.

It runs at [drop.shiftbloom.studio](https://drop.shiftbloom.studio) and is made by [shiftbloom studio](https://shiftbloom.studio). The code is licensed under AGPL-3.0-or-later.

## What it does

- Every upload gets a page, a raw link and a download link. Videos support seeking, and links unfurl in Discord and Slack.
- Pastes get syntax highlighting and a raw view.
- Short links are plain 302 redirects.
- Every item can expire: `10m`, `1h`, `1d`, `7d`, `30d`, `90d`, `1y`, `never`, or a custom value like `12h` or `2w`. An hourly cron cleans up.
- A queue job makes a 480px WebP thumbnail with the Images binding and asks Workers AI for alt text and an NSFW flag.
- Each upload comes with its own deletion URL, which ShareX picks up on its own.
- The web UI takes drag and drop or Ctrl+V, shows upload progress, and lists recent items with a short undo window on delete.
- Fonts and highlight.js are proxied through the Worker, so visitors never talk to third-party CDNs. The homepage may be indexed. Uploads, pastes, raw files and short links send `X-Robots-Tag: noindex`.

Uploading and every `/api/*` route need an API token: the `API_TOKEN` secret or a named token (see [API tokens](#api-tokens)). Viewing an item is public for anyone who has its link.

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
| `API_TOKEN` | secret | – | master token for uploads and the API |
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

The config turns the `workers.dev` address off, because it bypasses the zone's WAF and rate limiting rules. Without a custom domain, set `"workers_dev": true` and the worker answers on `drop.<your-subdomain>.workers.dev`. To run without AI or thumbnails, remove the `ai`/`images` bindings. Everything else keeps working.

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

## API tokens

Besides the `API_TOKEN` secret, drop accepts named tokens. Each one has a label, an optional expiry date and can be revoked on its own, so a lost laptop or an old ShareX setup doesn't mean rotating the one token everything else uses.

Named tokens start with `drop_` and live in the `api_tokens` table (migration `0004_api_tokens.sql`). Only the SHA-256 hash of a token is stored, never the token itself. A token stops working the moment its `expires_at` (unix seconds) has passed or `revoked_at` is set. `last_used_at` is updated at most once a minute.

drop has no screen of its own for issuing them. [field](https://github.com/shiftbloom-studio/field) creates, lists and revokes them through its D1 binding to drop's database. Without field, insert a row yourself:

```sh
TOKEN="drop_$(openssl rand -hex 24)"
HASH=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)
npx wrangler d1 execute drop-db --remote --command \
  "INSERT INTO api_tokens (id, label, prefix, hash, created_at, expires_at) VALUES (lower(hex(randomblob(8))), 'laptop', substr('$TOKEN',1,12), '$HASH', unixepoch(), unixepoch() + 90*86400)"
echo "$TOKEN"
```

A `.sxcu` file downloaded from `/api/sharex` carries the token it was requested with, so it stops working together with that token.

## Security model

- Uploads are protected by the `API_TOKEN` secret and by named tokens. Treat `.sxcu` files like passwords. Rotate the master token with `wrangler secret put API_TOKEN`; revoke a named token instead of rotating the master token when only one device or person should lose access.
- Failed token attempts and requests for ids that don't exist are rate limited per IP (`AUTH_RL`, `MISS_RL` in `wrangler.jsonc`).
- drop looks at the first bytes of every upload instead of trusting the file name or the client's content type. Programs, scripts, installers, disk images and Office files with macros are refused, also when they are renamed.
- Only passive types (common images, audio, video, PDF and plain text) are shown inline. Everything else, including HTML and SVG, is served as `application/octet-stream` with `Content-Disposition: attachment`. Raw files also get `Content-Security-Policy: sandbox`, so nothing uploaded runs script on your origin.
- Location data (GPS) is removed from JPEG and PNG uploads before they are stored. The image itself isn't re-encoded.
- A queue job checks every upload in the background on Cloudflare: it hashes the file, looks inside ZIP archives for programs and macros, refuses encrypted archives, and, if you set `MB_AUTH_KEY`, looks the hash up in [MalwareBazaar](https://bazaar.abuse.ch/). Files that fail are put on hold (HTTP 451) instead of being deleted. Release one with `POST /api/items/<id>?release`.
- If your zone has Cloudflare's malicious uploads detection and the "Add malicious uploads detection header" managed transform, drop refuses uploads the scanner flags and holds the ones it couldn't scan.
- Deletion links ask before they delete, so link previews and crawlers can't remove files by opening them.
- Delete tokens and the master token are compared in constant time. Named tokens are stored only as SHA-256 hashes.

### Legal pages

Set `LEGAL` (JSON with `name`, optional `business`, `street`, `city`, `country.en`, `country.de`, `email`, optional `phone` and `vatId`, `authority`) to publish an imprint and a privacy policy in English and German at `/imprint`, `/impressum`, `/privacy` and `/datenschutz`. Set `ABUSE_EMAIL` to show "Report this file" on item pages. The privacy policy describes what this code does; check it against your own setup before you publish it.

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
