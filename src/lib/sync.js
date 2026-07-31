import { searchTrack, addTrackToPlaylist } from "./spotify.js";
import { normalizeTrackKey } from "./normalize.js";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function syncTracksToPlaylist(
  accessToken,
  tracks,
  playlistId,
  kv,
  { delayBetweenAdds = 200 } = {}
) {
  console.log(`Found ${tracks.length} tracks in feed`);

  const keyed = tracks.map((track) => ({
    track,
    key: normalizeTrackKey(track.artist, track.title),
  }));

  const alreadyProcessed = new Map();
  for (const batch of chunk(keyed, 100)) {
    const results = await kv.get(batch.map((entry) => entry.key));
    for (const [key, value] of results) {
      if (value) alreadyProcessed.set(key, value);
    }
  }

  console.log(
    `${alreadyProcessed.size} of ${tracks.length} feed tracks already processed`
  );

  const stats = { added: 0, notFound: 0, alreadyProcessed: alreadyProcessed.size };

  for (const { track, key } of keyed) {
    if (alreadyProcessed.has(key)) continue;

    const result = await searchTrack(accessToken, track);

    if (!result) {
      console.log(`No match: ${track.artist} - ${track.title}`);
      stats.notFound++;
      await kv.put(key, JSON.stringify({ status: "not-found" }));
      continue;
    }

    await addTrackToPlaylist(accessToken, result.uri, playlistId);
    await kv.put(
      key,
      JSON.stringify({ status: "added", spotifyId: result.id })
    );
    console.log(`Added: ${track.artist} - ${track.title}`);
    stats.added++;

    if (delayBetweenAdds > 0) {
      await sleep(delayBetweenAdds);
    }
  }

  console.log(
    `Done. Added: ${stats.added}, Not found: ${stats.notFound}, Already processed: ${stats.alreadyProcessed}`
  );

  return stats;
}
