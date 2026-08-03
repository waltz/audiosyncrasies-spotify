# audiosyncrasies-spotify

Syncs tracks from the [Audiosyncrasies radio show](https://bff.fm/shows/audiosyncrasies) to a Spotify playlist, running daily on Cloudflare Workers.

## Requirements

- Node 22+ (see `.node-version` — required by Wrangler v4)
- A Spotify app ([developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)) with a redirect URI registered for `http://127.0.0.1:5173` (not `localhost` — Spotify rejects that as insecure)
- A Cloudflare account

## Setup

```bash
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
```

Fill in `.env` with your Spotify app's client ID and secret (`VITE_SPOTIFY_CLIENT_ID`/`VITE_SPOTIFY_CLIENT_SECRET`) — these are only used by the local browser auth tool below, never deployed.

**Get a Spotify refresh token:**

```bash
npm run start
```

Click "start auth flow", authorize on Spotify, and the refresh token will appear in the page's input field. Copy it into `.dev.vars` along with `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `PLAYLIST_ID`.

**Provision Cloudflare resources:**

```bash
npx wrangler login
npx wrangler kv namespace create PROCESSED_TRACKS
# paste the printed id into the [[kv_namespaces]] block in wrangler.toml
```

**Deploy:**

```bash
npm run deploy
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put SPOTIFY_REFRESH_TOKEN
```

## Scripts

| Command | What it does |
|---|---|
| `npm run start` | Local browser tool to get a Spotify refresh token (standard Authorization Code flow) |
| `npm run dev:worker` | Run the Worker locally against real Cloudflare resources (`wrangler dev --remote`) |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run tail` | View live logs |
| `npm run backfill` | Dedupe the playlist and seed KV from the RSS feed's rolling ~20-episode window |
| `npm run archive-sync` | Crawl bff.fm's full historical episode archive (rate-limited — tune via `BFF_REQUEST_DELAY_MS`), add anything missing, dedupe, seed KV |

`backfill` and `archive-sync` are one-time/occasional maintenance tasks, not part of the daily cron — they touch the entire feed or archive at once, which would exceed Cloudflare Workers' per-invocation subrequest limit if run as a Worker route, so they run as local Node scripts instead.

## How it works

1. A daily cron trigger (9am UTC, ~2am Pacific) fetches the RSS feed and searches Spotify for each track.
2. Workers KV tracks which feed tracks have already been processed, keyed by normalized artist/title — so a track is only ever searched once, regardless of which Spotify catalog entry the search happens to match (Spotify's search isn't fully deterministic across runs, which previously caused duplicate entries).
3. Matches not already in the playlist get added; results get recorded in KV either way.

## Spotify authentication

`src/browser.js` uses the **standard Authorization Code flow** (client ID + client secret) to get a refresh token, not the Authorization Code **with PKCE** flow the Spotify SDK's `withUserAuthorization()` helper defaults to. That wasn't the original choice — it's the fix for a real failure:

- The first version used PKCE, since that's the conventional choice for a browser-based auth flow (no client secret exposed to the page). It worked for exactly one sync.
- Spotify's PKCE flow rotates the refresh token on use — sometimes a call to refresh an access token returns a *new* refresh token and silently invalidates the old one. Since the deployed Worker only had the original token stored as a secret, the very next scheduled sync failed with `invalid_grant: Refresh token revoked`.
- PKCE exists specifically to protect clients that *can't* safely hold a secret (public browser apps, mobile apps) — token rotation is the compensating control for not having one. That constraint doesn't apply here: `browser.js` is a tool only run locally, by hand, never shipped to or executed by anyone else. There's no real reason to pay PKCE's rotation cost with no corresponding security benefit.
- Switching to the standard flow (Basic-auth token exchange with `client_id:client_secret`, no PKCE verifier) uses the same confidential-client convention `spotify.js`'s daily refresh call already used. Confidential-client refresh tokens are expected to stay valid indefinitely rather than rotating on each use, which is what actually makes an unattended daily cron viable without re-running the browser auth flow constantly.
- Spotify's docs don't *guarantee* zero rotation for any flow ("a refresh token might not be included in each response... depending on the grant"), so `getAccessTokenFromRefreshToken` in `src/lib/spotify.js` still defensively logs a warning if a refresh call ever returns a new `refresh_token` anyway — that would mean the stored `SPOTIFY_REFRESH_TOKEN` secret needs updating, since the code can't persist the new one to Workers secrets on its own.

If you ever see `refresh token revoked` in the logs, re-run `npm run start` to mint a fresh one and update the deployed secret.

## Architecture

- **Runtime**: Cloudflare Workers, private (`workers_dev = false` — `fetch()` is only reachable via `wrangler dev --remote`, not a public URL). The cron trigger is unaffected by this.
- **Schedule**: cron trigger, `0 9 * * *` (9am UTC daily)
- **Storage**: Workers KV (`PROCESSED_TRACKS`) — tracks already-handled feed/archive entries. Free tier caps at 1,000 write operations/day account-wide; the daily sync's write volume is tiny, but a full re-run of `backfill`/`archive-sync` can exceed it in one shot.
- **Auth**: standard Authorization Code flow — see [Spotify authentication](#spotify-authentication) above for why.
- **Observability**: `[observability] enabled = true` in `wrangler.toml` — persists logs/traces to the Cloudflare dashboard so past `scheduled()` runs are queryable after the fact, not just visible while live-tailing with `npm run tail`.
- **Metrics**: Analytics Engine (`ANALYTICS_ENGINE` binding, dataset `audiosyncrasies-spotify`) — every run (cron or manual) writes one data point: trigger type, success/error, duration, and tracks added/not-found/already-processed. Needed a one-time manual activation in the Cloudflare dashboard (Workers & Pages → Analytics Engine) before the binding would deploy. Query it via the SQL API, e.g.:
  ```bash
  curl -X POST "https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql" \
    -H "Authorization: Bearer <token>" \
    -d 'SELECT blob1 AS trigger, blob2 AS status, double1 AS duration_ms, double2 AS added, timestamp FROM "audiosyncrasies-spotify" ORDER BY timestamp DESC LIMIT 20'
  ```
  Data points take roughly a minute or two to become queryable after being written.
- **Config**: `wrangler.toml`
- **Secrets**: Cloudflare Workers secrets (encrypted), set via `wrangler secret put`
