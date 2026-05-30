import { getPlaylistTracks, searchTrack, addTrackToPlaylist } from "./spotify.js";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncTracksToPlaylist(
  accessToken,
  tracks,
  playlistId,
  { delayBetweenAdds = 200 } = {}
) {
  console.log(`Found ${tracks.length} tracks in feed`);

  const existingIds = await getPlaylistTracks(accessToken, playlistId);
  console.log(`Playlist has ${existingIds.length} existing tracks`);

  const stats = { added: 0, skipped: 0, notFound: 0 };

  for (const track of tracks) {
    const result = await searchTrack(accessToken, track);

    if (!result) {
      console.log(`No match: ${track.artist} - ${track.title}`);
      stats.notFound++;
      continue;
    }

    if (existingIds.includes(result.id)) {
      stats.skipped++;
      continue;
    }

    await addTrackToPlaylist(accessToken, result.uri, playlistId);
    existingIds.push(result.id);
    console.log(`Added: ${track.artist} - ${track.title}`);
    stats.added++;

    if (delayBetweenAdds > 0) {
      await sleep(delayBetweenAdds);
    }
  }

  console.log(
    `Done. Added: ${stats.added}, Skipped: ${stats.skipped}, Not found: ${stats.notFound}`
  );

  return stats;
}
