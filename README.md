# drop.

Private file sharing on Cloudflare. Upload, get a link, it expires. Malware and content checks built in.

**Live:** [drop.shiftbloom.studio](https://drop.shiftbloom.studio) · **License:** AGPL-3.0-or-later

drop is where shiftbloom studio's screenshots go before they get sent anywhere. It's one Cloudflare Worker, or one Node.js process if you'd rather run it yourself. Files land in R2 (or a folder on disk) and you get back a five-character link on your own domain. Text pastes and short URLs use the same kind of link, and ShareX can upload to it directly.

## Features

- Every upload gets a page, a raw link and a download link. Videos support seeking, and links unfurl in Discord and Slack.
- Pastes get syntax highlighting and a raw view.
- Short links are plain 302 redirects.
- Every item can expire: `10m`, `1h`, `1d`, `7d`, `30d`, `90d`, `1y`, `never`, or a custom value like `12h` or `2w`. An hourly cron cleans up.
- A queue job makes a 480px WebP thumbnail with the Images binding and asks Workers AI for alt text and an NSFW flag.
- Each upload comes with its own deletion URL, which ShareX picks up on its own.
- The web UI takes drag and drop or Ctrl+V, shows upload progress, and lists recent items with a short undo window on delete.
- Fonts and highlight.js are proxied through the Worker, so visitors never talk to third-party CDNs. The homepage may be indexed. Uploads, pastes, raw files and short links send `X-Robots-Tag: noindex`.

Uploading and every `/api/*` route need an API token: the `API_TOKEN` secret or a named token (see [API tokens](#api-tokens)). The operator can also let visitors upload without a token, for at most 12 hours (see [Public uploads](#public-uploads)). Viewing an item is open to anyone who has its link. There is no public listing, and each token's history is visible only to that token.

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

The same code also runs on Node.js. `src/node/` provides each binding with a local stand-in, so the Worker itself has no idea where it runs:

| On Cloudflare | On Node.js (`src/node/bindings.ts`) |
| --- | --- |
| R2 `FILES` | files in `DATA_DIR/files`, stored under the SHA-256 of their key |
| D1 `DB` | SQLite file `DATA_DIR/drop.sqlite` (built-in `node:sqlite`, no native modules), same migrations |
| KV `LINKS` | in-memory cache (KV only ever holds copies of D1 rows) |
| Queue `JOBS` | in-process queue with retries |
| Rate limiting | in-memory limiter with the same limits |
| Cron | hourly timer |
| Images, Workers AI | not available: no WebP thumbnails, alt text or NSFW flag. Everything else works. |

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

## Tech stack

- TypeScript, bundled with esbuild into two modules (`index.js` for the API, `ui.js` for the pages)
- Cloudflare Workers with R2, D1, KV, Queues, Images, Workers AI, rate limiting and a Cron Trigger
- Node.js 26 for builds and tests, and as a second runtime (built-in `node:sqlite`, also as a Docker image)
- Vitest for tests. `npm run check` runs the typecheck, the tests and both builds.

## Self-hosting

There are two ways to run your own drop. Both use the same code, migrations and API, and ShareX can't tell them apart.

- **Cloudflare Workers**: R2, D1, KV and Queues, plus thumbnails and alt text from the Images binding and Workers AI. Scales to zero and costs cents.
- **Node.js or Docker**: one process, files on disk, metadata in SQLite. Runs on a homelab box, a VPS or your laptop with no Cloudflare account.

Settings that both share (vars on Cloudflare, environment variables on Node.js):

| Setting | Purpose |
| --- | --- |
| `API_TOKEN` | required, master token (a secret on Cloudflare) |
| `MAX_MULTIPART_MB` / `MAX_STREAM_MB` | upload limits, default `95` / `500` |
| `OPERATOR_NAME`, `OPERATOR_URL`, `OPERATOR_PLACE` | who runs the instance, shown in the footer and the page metadata. Without them the pages name nobody. |
| `SOURCE_URL` | where your copy of the code lives (AGPL section 13). Defaults to this repository. |
| `ABUSE_EMAIL`, `LEGAL` | report link and legal pages, see [Legal pages](#legal-pages) |
| `MB_AUTH_KEY` | optional MalwareBazaar lookups |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | optional [token requests](#token-requests) and [public uploads](#public-uploads) |
| `PUBLIC_UPLOADS` | `on` lets visitors upload without a token, see [Public uploads](#public-uploads) |
| `MANDATE_ISSUER` | optional, the origin of a [stem](https://github.com/shiftbloom-studio/stem) that checks [mandates](#agents-with-a-mandate) over HTTP. On Cloudflare, bind stem's `MandateGateway` as `MANDATES` instead. |

### Run with Node.js or Docker

With Docker Compose:

```sh
git clone https://github.com/shiftbloom-studio/drop && cd drop
cp .env.example .env        # set API_TOKEN (openssl rand -base64 32) and PUBLIC_URL
docker compose up -d        # http://127.0.0.1:8787, data in the drop-data volume
```

Without Docker you need Node.js 26:

```sh
npm install
cp .env.example .env
npm run build:node
npm start                   # reads .env, stores everything in ./data
```

The database schema is applied on start. Three settings only exist on Node.js:

- `PUBLIC_URL`: the address people reach drop at, for example `https://drop.example.com`. drop builds its links from it. Without it, links use the request's `Host` header.
- `TRUST_PROXY`: behind a reverse proxy, the header with the client's IP (`x-forwarded-for`, `x-real-ip` or `cf-connecting-ip`). Rate limits key on it. Leave it unset when clients connect directly, since anyone can send that header.
- `DATA_DIR`, `PORT`, `HOST`: where files and `drop.sqlite` live (default `./data`, `/data` in Docker), and where to listen (default `0.0.0.0:8787`).

Put drop behind a reverse proxy that handles TLS (Caddy, nginx, Traefik or a Cloudflare Tunnel) and allows request bodies up to `MAX_STREAM_MB`. With Caddy that's all it takes:

```
drop.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Then set `PUBLIC_URL=https://drop.example.com` and `TRUST_PROXY=x-forwarded-for`.

Named tokens come from the command line, since there's no admin screen ([field](https://github.com/shiftbloom-studio/field) does this on Cloudflare):

```sh
npm run token -- create laptop --days 90     # prints the token once
npm run token -- list
npm run token -- revoke <id>
# in Docker: docker compose exec drop node dist/node/server.js token create laptop
```

Back up `DATA_DIR` while drop is stopped, or copy `drop.sqlite` with `sqlite3 drop.sqlite ".backup backup.sqlite"` and the `files` folder next to it.

### Run on Cloudflare Workers

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

Set the optional vars from the table above in `wrangler.jsonc`. The config turns the `workers.dev` address off, because it bypasses the zone's WAF and rate limiting rules. Without a custom domain, set `"workers_dev": true` and the worker answers on `drop.<your-subdomain>.workers.dev`. To run without AI or thumbnails, remove the `ai`/`images` bindings. Everything else keeps working.

### Deploy on every push (Workers Builds)

Connect the repository to the Worker in the Cloudflare dashboard (Settings > Build). Workers Builds deploys every push to `main`, and no API token is stored on GitHub. To keep your resource ids out of the repository, let the build fill them in and keep the vars you set in the dashboard:

- Build command: `npm ci && npm run check`, then write a deploy config with the ids filled in (for example by replacing `<your-d1-database-id>` and `<your-kv-namespace-id>` from build variables) as `wrangler.deploy.jsonc`
- Deploy command: `npx wrangler d1 migrations apply drop-db --remote -c wrangler.deploy.jsonc && npx wrangler deploy -c wrangler.deploy.jsonc --keep-vars`
- Build variables: your ids and `NODE_VERSION=26`

## Development

```sh
cp .dev.vars.example .dev.vars              # set API_TOKEN
npx wrangler d1 migrations apply drop-db --local
npm run dev                                 # Workers runtime, http://localhost:8787
npm run check                               # typecheck, tests, Worker and Node builds
```

Workers AI and Images need a Cloudflare connection. Locally they fail gracefully, so uploads work and only the thumbnail and alt text are missing. To try the Node.js version instead, run `npm run dev:node` with an `.env` file.

## API

All `/api/*` routes need `Authorization: Bearer <token>`. `X-API-Key: <token>` also works.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/upload` | multipart `file` (+ optional `expires`) | up to `MAX_MULTIPART_MB` |
| `PUT` | `/api/upload?filename=x.mp4` | raw bytes | streamed to R2, up to `MAX_STREAM_MB` |
| `POST` | `/api/paste` | JSON `{content, lang, title, expires}`, form `content`, or raw text | |
| `POST` | `/api/shorten` | JSON `{url, expires}`, form `url`, or raw text | |
| `GET` | `/api/list?limit=50&kind=file` | | your recent items + totals (each token sees only its own; the master token also sees items from before owners were recorded) |
| `GET` / `DELETE` | `/api/items/:id` | | `POST /api/items/:id?reanalyze` re-queues AI |
| `GET` | `/api/sharex?type=upload\|paste\|shorten` | | ready-made `.sxcu` |

You can also send the expiry as an `X-Expires` header. Response:

```json
{ "id": "aB3dE", "kind": "file", "url": "https://drop.example.com/aB3dE",
  "raw": "https://drop.example.com/aB3dE/raw.png", "thumbnail": "https://drop.example.com/aB3dE/thumb",
  "delete": "https://drop.example.com/d/aB3dE/<delete-token>", "expires_at": null }
```

Without a token, the start page uses `POST /api/public/upload` (multipart `file`) and `POST /api/public/paste` (JSON `{content, lang, title, expires}`). Both need a fresh Turnstile token in the `X-Turnstile` header and only exist while [public uploads](#public-uploads) are on.

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

### Agents with a mandate

An agent doesn't need a token at all. With [stem](https://github.com/shiftbloom-studio/stem), the person signs a mandate for it with their passkey: exactly which of upload, list and delete it may do, for which file names, up to what size and for how long. The agent can hand narrower copies to sub-agents without asking anyone, and the person can stop all of them at once on their stem account page. How mandates work is in stem's [docs/mandates.md](https://github.com/shiftbloom-studio/stem/blob/main/docs/mandates.md).

drop sends every request that carries a mandate to stem with its action, the file name it touches and its size, and goes ahead only when stem says the mandate covers it:

| Request | Action | Name stem checks against the mandate's prefix |
| --- | --- | --- |
| `POST`/`PUT /api/upload` | `upload` | the file name as drop stores it (`/` becomes `_`) |
| `GET /api/list?prefix=…` | `list` | the `prefix` parameter. Only names starting with it are listed. |
| `GET`/`DELETE /api/items/<id>` | `list` / `delete` | the item's name |

Everything else (pastes, short links, `/api/sharex`, releasing a held file) needs a token. Items uploaded with a mandate belong to its root mandate: the agent and all its sub-agents see the same history and nothing else. File names can't contain `/`, so use name prefixes such as `screens-2026-11-` where you would use folders.

To turn it on, bind stem on the same Cloudflare account:

```jsonc
"services": [{ "binding": "MANDATES", "service": "stem", "entrypoint": "MandateGateway" }]
```

and add drop to stem's `MANDATE_APPS`. On Node.js, or on another account, set `MANDATE_ISSUER` to stem's origin instead. Requests then go like this (with stem's `tools/mandate-agent.mjs`):

```sh
node tools/mandate-agent.mjs request --stem https://stem.example.com --app https://drop.example.com \
  --actions upload,list,delete --prefix screens- --max-bytes 50000000 --ttl 86400 --depth 1 --out agent.json
node tools/mandate-agent.mjs call --from agent.json --method PUT \
  --url "https://drop.example.com/api/upload?filename=screens-2026-11-a.png" --file a.png
```

### Token requests

drop can take requests for tokens from visitors. It's off until you set both Turnstile keys:

1. Create a [Turnstile](https://developers.cloudflare.com/turnstile/) widget for your drop hostname.
2. Set its site key as the `TURNSTILE_SITE_KEY` var and its secret with `wrangler secret put TURNSTILE_SECRET`.
3. Apply migration `0005_token_requests.sql`.

Then the start page offers "Ask for a token", which leads to a form at `/request` (name and what they want to upload, checked with Turnstile, rate limited per IP by `REQ_RL`, at most 50 open requests at a time). The visitor gets a private claim link. You approve or reject the request in the `token_requests` table; [field](https://github.com/shiftbloom-studio/field) does this from its drop screen. Approving sets `status = 'approved'`, `decided_at`, and optionally `label` and `token_expires_at`. When the visitor opens the claim link and presses "Show my token", drop generates the token, stores its hash in `api_tokens` and shows it once. It is never stored in plain text, never part of a URL and never sent by email.

Approved tokens have to be collected within 14 days. Requests are deleted 30 days after they were made (or once the claim window has passed). For extra protection, add a Cloudflare WAF custom rule with the action *Managed Challenge* for `http.request.uri.path eq "/request"` on your hostname.

## Public uploads

With `PUBLIC_UPLOADS=on` and both Turnstile keys set, visitors without a token can upload from the start page. It's off by default. Apply migration `0007_public_usage.sql` first.

- Files up to `PUBLIC_MAX_MB` (default `25`) and pastes up to `PUBLIC_PASTE_KB` (default `512`). Only what drop can check is taken: images (PNG, JPEG, GIF, WebP, AVIF, BMP) and plain text, and the file name has to match what the bytes are. Anything appended after the end of an image is cut off, and an image that doesn't parse is refused. Animated GIFs can have up to 120 frames. Video, audio, PDFs, icons and archives, short links, raw `PUT` uploads and ShareX need a token. Checking public video is tracked in [#32](https://github.com/shiftbloom-studio/drop/issues/32).
- Every item expires after 12 hours at the latest (`10m`, `1h` or `12h`). The hourly cron deletes it from R2, D1 and KV. Public files live under the `pub/` prefix in R2, so you can add an R2 lifecycle rule (for example "delete objects under `pub/` after 1 day") as a second line of defense.
- Each upload needs its own Turnstile check for the action `public-upload` on your hostname. `PUB_RL` limits uploads per IP and minute (default 6). A daily cap per IP (`PUBLIC_DAILY_UPLOADS`, default `30`, and `PUBLIC_DAILY_MB`, default `200`) is counted in the `public_usage` table under a SHA-256 of the day, the address and the `API_TOKEN` secret, never the address itself. Rows are deleted after two days.
- A public file answers "still checking" (HTTP 503) until the background scan has run. With Workers AI, images also wait for the sensitive content check and stay on hold when it flags them. For an animated GIF every distinct frame is checked, and one flagged frame holds the file. Only the master token can release a file on hold.
- Public items get 10-character ids instead of 5, so their links can't be guessed. They belong to no token: no token's history lists them, and the uploader gets the deletion link once, in the upload result. The master token can review them with `GET /api/list?scope=public`.
- The privacy policy and imprint add sections on public uploads while the feature is on.

## Security model

- Uploads are protected by the `API_TOKEN` secret and by named tokens. Treat `.sxcu` files like passwords. Rotate the master token with `wrangler secret put API_TOKEN`; revoke a named token instead of rotating the master token when only one device or person should lose access.
- Failed token attempts, requests for ids that don't exist, token requests and public uploads are rate limited per IP (`AUTH_RL`, `MISS_RL`, `REQ_RL`, `PUB_RL` in `wrangler.jsonc`).
- Token requests are checked with Turnstile on the server. Claim links are 32 random characters, stored only as a hash, served with `no-store`, `noindex` and `Referrer-Policy: no-referrer`, and a token is issued only from a POST, so link scanners can't collect it.
- drop looks at the first bytes of every upload instead of trusting the file name or the client's content type. Programs, scripts, installers, disk images and Office files with macros are refused, also when they are renamed.
- Only passive types (common images, audio, video, PDF and plain text) are shown inline. Everything else, including HTML and SVG, is served as `application/octet-stream` with `Content-Disposition: attachment`. Raw files also get `Content-Security-Policy: sandbox`, so nothing uploaded runs script on your origin.
- Location data (GPS) is removed from JPEG and PNG uploads before they are stored. The image itself isn't re-encoded.
- A queue job checks every upload in the background: it hashes the file, looks inside ZIP archives for programs and macros, refuses encrypted archives, and, if you set `MB_AUTH_KEY`, looks the hash up in [MalwareBazaar](https://bazaar.abuse.ch/). Files that fail are put on hold (HTTP 451) instead of being deleted. The operator releases one with `POST /api/items/<id>?release` using the master token (`API_TOKEN`); named tokens get 403.
- On Node.js the same checks run in-process. Behind a proxy, set `TRUST_PROXY` so rate limits see real client addresses; drop always replaces any `cf-connecting-ip` header a client sends.
- If your zone has Cloudflare's malicious uploads detection and the "Add malicious uploads detection header" managed transform, drop refuses uploads the scanner flags and holds the ones it couldn't scan.
- Deletion links ask before they delete, so link previews and crawlers can't remove files by opening them.
- Delete tokens and the master token are compared in constant time. Named tokens are stored only as SHA-256 hashes.

### Legal pages

Set `LEGAL` (JSON with `name`, optional `business`, `street`, `city`, `country.en`, `country.de`, `email`, optional `phone` and `vatId`, `authority`) to publish an imprint and a privacy policy in English and German at `/imprint`, `/impressum`, `/privacy` and `/datenschutz`. Set `ABUSE_EMAIL` to show "Report this file" on item pages. The privacy policy describes what this code does; check it against your own setup before you publish it.

The same setting also publishes terms of use at `/terms` and `/nutzungsbedingungen` and a content policy at `/content-policy` and `/inhaltsrichtlinie`. They are written for an operator in Germany: drop as a hosting service under the Digital Services Act (Art. 6), notices under Art. 16 DSA, and `ABUSE_EMAIL` (or the `LEGAL` email) as the point of contact under Art. 11 and 12 DSA. The upload box and the footer link to them. They aren't legal advice, so have them checked for your own instance.

## Design

The UI follows the shiftbloom studio brand book: white paper and ink, Bloom Red `#FF2E52` as the only accent, the Bloom mark drawn as SVG from its construction spec, the shiftbloom studio wordmark, mono labels in small caps and a few sprinkles in the margins. Type is set in Clash Display, General Sans and JetBrains Mono. Motion uses the Bloom Ease `cubic-bezier(.22,1.1,.36,1)`. When you fork, you are welcome to restyle `src/html.ts`. The shiftbloom studio wordmark only appears when `BRAND` is set to `shiftbloom`, which is how drop.shiftbloom.studio runs. Set the `OPERATOR_*` settings for your own name instead.

`src/ui.ts` ships as its own module (`ui.js`), so you can change the look without touching the API code.

## Costs

Expect a few cents a month for personal use. R2 storage costs $0.015/GB-month with no egress fees. Each image upload uses one queue message and two small Workers AI calls. D1 and KV traffic is a handful of operations per request.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please don't report vulnerabilities in public issues. Use GitHub's private vulnerability reporting on this repository or email [safety@shiftbloom.studio](mailto:safety@shiftbloom.studio). [SECURITY.md](SECURITY.md) has the details.

## License

Copyright © 2026 shiftbloom studio and contributors.

drop is free software: you can redistribute it and/or modify it under the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

If you run a modified version for others over a network, AGPL section 13 requires you to offer those users your source code. The footer's *source* link exists for this. Set `SOURCE_URL` to your fork.

---

drop is part of [shiftbloom studio](https://shiftbloom.studio), an open studio from Hamburg. All of our apps are open source at [github.com/shiftbloom-studio](https://github.com/shiftbloom-studio).
