// find stuff played on audiosyncrasies and add the tracks to a spotify playlist
// https://bff.fm/broadcasts/40216

import { XMLParser } from 'fast-xml-parser';
import { decode } from 'html-entities';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';

console.log('Loading');

const rssUrl = 'https://data.bff.fm/shows/audiosyncrasies.rss';
const playlistId = '5MpC0JxMZJ7bIJPwPFCtNv'; //https://open.spotify.com/playlist/5MpC0JxMZJ7bIJPwPFCtNv
const currentUrl = 'http://localhost:4545';
const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

let sdk = undefined;
let tracks = [];
const startButton = document.getElementById("start");
const processButton = document.getElementById("process");
const searchButton = document.getElementById("search");

startButton.addEventListener('click', doUserAuth);
processButton.addEventListener('click', processEpisodes);
searchButton.addEventListener('click', findTracks);

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('setup done', currentUrl, spotifyClientId);

async function doUserAuth() {
  console.log('Authing with Spotify');

  sdk = SpotifyApi.withUserAuthorization(spotifyClientId, currentUrl, ["playlist-read-private", "playlist-modify-private", "playlist-modify-public"]);

  const profile = await sdk.currentUser.profile();
  console.log(profile);
}

async function findTracks() {
  console.log('finding all tracks');
  console.log(tracks);

  await findTrack(tracks[0]);

  // tracks.forEach(async track => {
  //   await findTrack(track);
  //   await timeout(4000);
  // });
}

async function findTrack({ artist, title }) {
  if (sdk === undefined) {
    console.error('Spotify SDK has not been set up. Cannot find this track.');
    return;
  }

  const searchTerm = `${artist} - ${title}`;
  console.log(`Searching Spotify for ${searchTerm}`);
  const results = await sdk.search(searchTerm, ["track"]);
  const candidate = results?.tracks?.items[0];

  // debugger

  if (candidate) {
    console.log('Found possible result', candidate);
  } else {
    console.log(`Could not find a track that matched: ${searchTerm}`);
  }

  const trackUri = candidate.uri;
  console.log('Adding track to playlist', playlistId, [trackUri], 0);

  try {
    await sdk.playlists.addItemsToPlaylist(playlistId, [trackUri], 0);
  } catch(e) {
    console.log('Unable to add track to playlist');
    console.error(e);
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

      tracks.push(track);
    });
  });

  console.log('Finished syncing');
}
