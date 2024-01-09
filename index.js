// find stuff played on audiosyncrasies and add the tracks to a spotify playlist
// https://bff.fm/broadcasts/40216

import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import { decode } from 'html-entities';

const rssUrl = 'https://data.bff.fm/shows/audiosyncrasies.rss';
const playlistUrl = 'https://open.spotify.com/playlist/5MpC0JxMZJ7bIJPwPFCtNv?si=01c3489b886e45fe';
const spotifyAppId = 'a63602813cf94b709962b84a9c9da8ad';

console.log('Starting to sync Audiosyncrasies');

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
