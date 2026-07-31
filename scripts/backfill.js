// One-time/occasional local maintenance script: dedupes the live playlist
// and seeds KV so the deployed Worker's daily sync knows what's already
// handled. Runs outside the Workers runtime entirely, so it isn't bound by
// the per-invocation subrequest limit that a Worker-hosted route would be.
//
// Usage:
//   node --env-file=.dev.vars scripts/backfill.js

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { getAccessTokenFromRefreshToken } from "../src/lib/spotify.js";
import { removeDuplicateTracks } from "../src/lib/dedupe.js";

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

const result = await removeDuplicateTracks(accessToken, PLAYLIST_ID);

console.log("\nSummary:");
console.log(`  Playlist tracks scanned: ${result.tracksScanned}`);
console.log(`  Duplicates removed:      ${result.duplicatesRemoved}`);
console.log(`  Feed tracks scanned:     ${result.feedTracksScanned}`);
console.log(`  Matched to playlist:     ${result.matched}`);
console.log(`  Not found on Spotify:    ${result.notFound}`);

const outFile = fileURLToPath(
  new URL("../.backfill-kv-records.json", import.meta.url)
);
const bulkPayload = [...result.records].map(([key, value]) => ({
  key,
  value,
}));
await writeFile(outFile, JSON.stringify(bulkPayload, null, 2));
console.log(`\nWrote ${bulkPayload.length} records to .backfill-kv-records.json`);

console.log("\nSeeding KV...");
execFileSync(
  "npx",
  [
    "wrangler",
    "kv",
    "bulk",
    "put",
    outFile,
    "--binding=PROCESSED_TRACKS",
    "--remote",
  ],
  { stdio: "inherit" }
);

console.log("\nDone. KV is seeded - the daily sync should run within budget now.");
