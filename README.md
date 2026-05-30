# audiosyncrasies-spotify

Automatically syncs tracks from the [Audiosyncrasies radio show](https://bff.fm/shows/audiosyncrasies) to a Spotify playlist. Runs daily on Cloudflare Workers.

## Setup

```bash
# Install dependencies
npm install

# Configure credentials
cp .env.example .env
# Edit .env with your Cloudflare and Spotify credentials

# Login to Cloudflare
npx wrangler login

# Deploy
bin/deploy
```

## Development

```bash
# Run worker locally
npm run dev:worker

# Deploy to Cloudflare
bin/deploy

# View live logs
npm run tail
```

## How It Works

1. Fetches RSS feed from BFF.FM daily at 2am UTC
2. Parses track listings from episode descriptions
3. Searches Spotify for each track
4. Adds new tracks to playlist (skips duplicates)

## Architecture

- **Runtime**: Cloudflare Workers
- **Schedule**: Cron trigger (2am UTC daily)
- **Config**: `wrangler.toml` (infrastructure as code)
- **Secrets**: Cloudflare Workers secrets (encrypted)
