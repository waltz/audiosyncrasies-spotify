import {
  getPlaylistTracksDetailed,
  removeTracksFromPlaylist,
  addTrackToPlaylist,
  searchTrack,
} from "./spotify.js";
import { normalizeTrackKey } from "./normalize.js";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Not tied to a Worker, a particular storage binding, or a particular
// track source - runs a full pass over the live playlist and the given
// tracks, and returns the records to persist (rather than writing them
// itself) so it can run outside the Workers runtime, unconstrained by the
// per-invocation subrequest limit.
//
// By default, tracks found on Spotify but not currently in the playlist
// are left unrecorded rather than added - appropriate when `tracks` is the
// RSS feed's rolling window, since the next daily sync will pick them up
// naturally. Pass `addMissingTracks: true` when that's not true of the
// track source (e.g. a one-time historical archive crawl the daily sync
// will never see again), so this pass is the only chance to add them.
export async function removeDuplicateTracks(
  accessToken,
  playlistId,
  tracks,
  { delayBetweenSearches = 200, addMissingTracks = false } = {}
) {
  console.log("Fetching playlist tracks for dedup...");
  const playlistTracks = await getPlaylistTracksDetailed(accessToken, playlistId);
  console.log(`Playlist has ${playlistTracks.length} tracks`);

  const groups = new Map();
  for (const track of playlistTracks) {
    const key = normalizeTrackKey(track.artist, track.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(track);
  }

  const toRemove = [];
  const keptIds = new Set();
  for (const group of groups.values()) {
    const [first, ...rest] = group;
    keptIds.add(first.id);
    for (const dup of rest) {
      toRemove.push(dup.uri);
    }
  }

  if (toRemove.length > 0) {
    console.log(`Removing ${toRemove.length} duplicate tracks...`);
    await removeTracksFromPlaylist(accessToken, toRemove, playlistId);
  } else {
    console.log("No duplicates found.");
  }

  console.log(`Matching ${tracks.length} tracks against the playlist...`);
  const records = new Map();
  let matched = 0;
  let added = 0;
  let notFound = 0;

  for (const track of tracks) {
    const key = normalizeTrackKey(track.artist, track.title);

    const result = await searchTrack(accessToken, track);

    if (!result) {
      records.set(key, JSON.stringify({ status: "not-found" }));
      notFound++;
      await sleep(delayBetweenSearches);
      continue;
    }

    if (keptIds.has(result.id)) {
      records.set(
        key,
        JSON.stringify({ status: "added", spotifyId: result.id })
      );
      matched++;
    } else if (addMissingTracks) {
      await addTrackToPlaylist(accessToken, result.uri, playlistId);
      keptIds.add(result.id);
      records.set(
        key,
        JSON.stringify({ status: "added", spotifyId: result.id })
      );
      added++;
      console.log(`Added: ${track.artist} - ${track.title}`);
    } else {
      console.log(`Not yet in playlist: ${track.artist} - ${track.title}`);
    }

    await sleep(delayBetweenSearches);
  }

  console.log(
    `Matched ${matched} existing, added ${added} new, ${notFound} not found on Spotify.`
  );

  return {
    playlistTracksScanned: playlistTracks.length,
    duplicatesRemoved: toRemove.length,
    tracksScanned: tracks.length,
    matched,
    added,
    notFound,
    records,
  };
}
