import {
  getPlaylistTracksDetailed,
  removeTracksFromPlaylist,
  searchTrack,
} from "./spotify.js";
import { fetchAndParseFeed } from "./rss.js";
import { normalizeTrackKey } from "./normalize.js";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Not tied to a Worker or a particular storage binding - runs a full pass
// over the live playlist and feed, and returns the records to persist
// (rather than writing them itself) so it can run outside the Workers
// runtime, unconstrained by the per-invocation subrequest limit.
export async function removeDuplicateTracks(
  accessToken,
  playlistId,
  { delayBetweenSearches = 200 } = {}
) {
  console.log("Fetching playlist tracks for dedup...");
  const tracks = await getPlaylistTracksDetailed(accessToken, playlistId);
  console.log(`Playlist has ${tracks.length} tracks`);

  const groups = new Map();
  for (const track of tracks) {
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

  console.log("Matching feed tracks against the playlist...");
  const feedTracks = await fetchAndParseFeed();
  const records = new Map();
  let matched = 0;
  let notFound = 0;

  for (const feedTrack of feedTracks) {
    const feedKey = normalizeTrackKey(feedTrack.artist, feedTrack.title);

    const result = await searchTrack(accessToken, feedTrack);

    if (!result) {
      records.set(feedKey, JSON.stringify({ status: "not-found" }));
      notFound++;
      await sleep(delayBetweenSearches);
      continue;
    }

    if (keptIds.has(result.id)) {
      records.set(
        feedKey,
        JSON.stringify({ status: "added", spotifyId: result.id })
      );
      matched++;
    } else {
      console.log(
        `Feed track not yet in playlist: ${feedTrack.artist} - ${feedTrack.title}`
      );
    }

    await sleep(delayBetweenSearches);
  }

  console.log(
    `Matched ${matched} feed tracks to playlist entries. ${notFound} confirmed not on Spotify.`
  );

  return {
    tracksScanned: tracks.length,
    duplicatesRemoved: toRemove.length,
    feedTracksScanned: feedTracks.length,
    matched,
    notFound,
    records,
  };
}
