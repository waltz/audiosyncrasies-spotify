// One-time/occasional local maintenance script: dedupes the live playlist
// and seeds KV so the deployed Worker's daily sync knows what's already
// handled. Runs outside the Workers runtime entirely, so it isn't bound by
// the per-invocation subrequest limit that a Worker-hosted route would be.
//
// Usage:
//   node --env-file=.dev.vars scripts/backfill.js

import { fileURLToPath } from "node:url";
import { getAccessTokenFromRefreshToken } from "../src/lib/spotify.js";
import { removeDuplicateTracks } from "../src/lib/dedupe.js";
import { fetchAndParseFeed } from "../src/lib/rss.js";
import { seedKv } from "./lib/seed-kv.js";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
  PLAYLIST_ID,
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
  throw new Error(
    "Missing Spotify credentials. Run with: node --env-file=.dev.vars scripts/backfill.js"
  );
}

console.log("Fetching access token...");
const accessToken = await getAccessTokenFromRefreshToken(
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
);

console.log("Fetching RSS feed...");
const tracks = await fetchAndParseFeed();

const result = await removeDuplicateTracks(accessToken, PLAYLIST_ID, tracks);

console.log("\nSummary:");
console.log(`  Playlist tracks scanned: ${result.playlistTracksScanned}`);
console.log(`  Duplicates removed:      ${result.duplicatesRemoved}`);
console.log(`  Feed tracks scanned:     ${result.tracksScanned}`);
console.log(`  Matched to playlist:     ${result.matched}`);
console.log(`  Not found on Spotify:    ${result.notFound}`);

const outFile = fileURLToPath(
  new URL("../.backfill-kv-records.json", import.meta.url)
);
await seedKv(result.records, outFile);

console.log("\nDone. KV is seeded - the daily sync should run within budget now.");
