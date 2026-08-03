// One-time local script: crawls bff.fm's full episode archive (every
// episode ever listed, not just the ~20-episode rolling window the RSS
// feed exposes), adds any tracks missing from the playlist, dedupes, and
// seeds KV. This is a much bigger crawl than the regular backfill (150+
// episodes vs ~20), so requests to bff.fm are rate limited - tune via
// BFF_REQUEST_DELAY_MS if needed.
//
// Usage:
//   node --env-file=.dev.vars scripts/archive-sync.js
//   BFF_REQUEST_DELAY_MS=2000 node --env-file=.dev.vars scripts/archive-sync.js

import { fileURLToPath } from "node:url";
import { getAccessTokenFromRefreshToken } from "../src/lib/spotify.js";
import { removeDuplicateTracks } from "../src/lib/dedupe.js";
import { fetchFullArchive } from "../src/lib/archive.js";
import { seedKv } from "./lib/seed-kv.js";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
  PLAYLIST_ID,
  BFF_REQUEST_DELAY_MS,
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
  throw new Error(
    "Missing Spotify credentials. Run with: node --env-file=.dev.vars scripts/archive-sync.js"
  );
}

const delayMs = BFF_REQUEST_DELAY_MS ? parseInt(BFF_REQUEST_DELAY_MS, 10) : undefined;

console.log("Fetching access token...");
const accessToken = await getAccessTokenFromRefreshToken(
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
);

const tracks = await fetchFullArchive(
  delayMs ? { delayMs } : {}
);
console.log(`\nCrawled ${tracks.length} tracks from the full archive.`);

const result = await removeDuplicateTracks(accessToken, PLAYLIST_ID, tracks, {
  addMissingTracks: true,
});

console.log("\nSummary:");
console.log(`  Playlist tracks scanned: ${result.playlistTracksScanned}`);
console.log(`  Duplicates removed:      ${result.duplicatesRemoved}`);
console.log(`  Archive tracks scanned:  ${result.tracksScanned}`);
console.log(`  Already in playlist:     ${result.matched}`);
console.log(`  Newly added:             ${result.added}`);
console.log(`  Not found on Spotify:    ${result.notFound}`);

const outFile = fileURLToPath(
  new URL("../.archive-sync-kv-records.json", import.meta.url)
);
await seedKv(result.records, outFile);

console.log("\nDone.");
