// find stuff played on audiosyncrasies and add the tracks to a spotify playlist
// the radio show: https://bff.fm/broadcasts/40216
// the playlist url: https://open.spotify.com/playlist/5MpC0JxMZJ7bIJPwPFCtNv 

import { XMLParser } from 'fast-xml-parser';
import { decode } from 'html-entities';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';

console.log('Loading');

const playlistId = '5MpC0JxMZJ7bIJPwPFCtNv';
const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

let sdk = undefined;
let tracksToFind = [];
let playlistSongs = [];
let baseDelay = 10000;

const startButton = document.getElementById("start");
const processButton = document.getElementById("process");
const searchButton = document.getElementById("search");

startButton.addEventListener('click', doUserAuth);
processButton.addEventListener('click', processEpisodes);
searchButton.addEventListener('click', handleFindTracksClick);

console.log('Setup done.');

async function doUserAuth() {
  console.log('Authing with Spotify');

  const currentUrl = window.location.origin;
  console.log('currentUrl', currentUrl);
  sdk = SpotifyApi.withUserAuthorization(
    spotifyClientId,
    currentUrl,
    [
      "playlist-read-private",
      "playlist-modify-private",
      "playlist-modify-public"
    ]
  );

  const profile = await sdk.currentUser.profile();
  console.log(profile);

  await fetchPlaylistSongs();
}

async function fetchPlaylistSongs(offset) {
  if (sdk === undefined) {
    console.error("SDK isn't setup. Can't fetch playlist songs.");
    return;
  };

  console.log('fetching playlist songs');

  try {
    const limit = 50;
    offset = offset || playlistSongs.length;
    console.log('current page:', limit, offset);
    const results = await sdk.playlists.getPlaylistItems(playlistId, "", "", limit, offset);
    const resultIds = results.items.map(item => item.track.id)
    resultIds.forEach(songId => playlistSongs.push(songId));
    console.log(`Fetched ${resultIds.length} songs, playlist now has ${playlistSongs.length} songs.`);

    if (resultIds.length === limit) {
      console.log('Fetching more playlist songs.');
      setTimeout(() => fetchPlaylistSongs(offset + limit), baseDelay);
    }
	} catch (e) {
    console.error("Failed to fetch playlist items.", e);
	}
}

async function handleFindTracksClick() {
  console.log("Finding tracks...");
  findTracks(tracksToFind);
}

async function findTracks(tracks) {
  if (tracks === undefined || tracks.length == 0) {
    console.log("Finished. No more tracks to process.");
    return;
  }

  console.log(`Found ${tracks.length} to process.`);

  const [currentTrack, ...restOfTracks] = tracks;

  const result = await findTrack(currentTrack);
    
  if (result === "no-match") {
    console.log("Couldn't find a match for song.");
    findTracks(restOfTracks);
  } else if (result === "skipped") {
    console.log("Skipped song.");
    findTracks(restOfTracks);
  } else if (result === "rate-limited") {
    console.log("Rate limited. Waiting.");
    setTimeout(() => findTracks(tracks), baseDelay);
  } else if (result === "success") {
    console.log("Saved track.");
    findTracks(restOfTracks);
  } else if (result === "error") {
    console.log("Got error processing track.");
    findTracks(restOfTracks);
  } else {
    console.log("Got an unknown result.", result);
  }
}

async function findTrack({ artist, title }) {
  if (sdk === undefined) {
    console.error('Spotify SDK has not been set up. Cannot find this track.');
    return;
  }

  const searchTerm = `${artist} - ${title}`;
  console.log(`Searching Spotify for "${searchTerm}"`);
  const results = await sdk.search(searchTerm, ["track"]);
  const candidate = results?.tracks?.items[0];

  if (!candidate) {
    return "no-match";
  }

  const { id, artists, album: { name: albumName }, href, uri } = candidate;
  console.log("Found song.", id, artists.map(a => a.name).join(", "), albumName, href);

  if (playlistSongs.includes(id)) {
    return "skipped";
  }

  try {
    await sdk.playlists.addItemsToPlaylist(playlistId, [uri], 0);
    return "success";
  } catch(e) {
    console.error(e);
    return "error";
  }
}

async function processEpisodes() {
  console.log('Starting to sync Audiosyncrasies');

  const response = await fetch("/feed/shows/audiosyncrasies.rss");
  const xml = await response.text();

  const parser = new XMLParser();
  const contents = parser.parse(xml);
  const episodes = contents.rss.channel.item;

  console.log('Processing episodes');

  episodes.forEach(ep => {
    const title = ep.title;

    console.log(`Processing episode: ${title}`);

    const content = ep['content:encoded'];
    const parsedContent = parser.parse(content);
    const playlist = parsedContent.ol?.li;

    if (playlist === undefined)
      return;

    playlist.forEach(async (song) => {
      const songParts = song.strong;
      const title = decode(songParts[0], { level: 'html5' });
      const artist = decode(songParts[1], { level: 'html5' });

      const track = { artist, title };
      console.log(`Found song in feed: ${artist}: ${title}`);

      tracksToFind.push(track);
    });
  });

  console.log('Finished syncing');
}
