// find stuff played on audiosyncrasies and add the tracks to a spotify playlist
// https://bff.fm/broadcasts/40216

import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import { decode } from 'html-entities';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';

const rssUrl = 'https://data.bff.fm/shows/audiosyncrasies.rss';
const playlistId = '5MpC0JxMZJ7bIJPwPFCtNv?si=01c3489b886e45fe';

const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

console.log('Starting to sync Audiosyncrasies');

console.log('Found Spotify creds', spotifyClientId, spotifyClientSecret, spotifyRefreshToken);

SpotifyApi.


const response = await fetch(rssUrl);
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

  playlist.forEach(song => {
    const songParts = song.strong;
    const title = decode(songParts[0], { level: 'html5' });
    const artist = decode(songParts[1], { level: 'html5' });

    console.log(`Found song, ${artist}: ${title}`);
  });
});

console.log('Finished syncing');
