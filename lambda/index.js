import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { XMLParser } from 'fast-xml-parser';
import { decode } from 'html-entities';

const RSS_URL = 'https://bff.fm/feed/shows/audiosyncrasies.rss';
const PLAYLIST_ID = process.env.PLAYLIST_ID || '5MpC0JxMZJ7bIJPwPFCtNv';

async function getSpotifyCredentials() {
  if (process.env.SPOTIFY_SECRET_ARN) {
    const client = new SecretsManagerClient({});
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.SPOTIFY_SECRET_ARN })
    );
    return JSON.parse(response.SecretString);
  }

  // local fallback
  return {
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
  };
}

async function getAccessToken({ client_id, client_secret, refresh_token }) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
}

async function getPlaylistTrackIds(accessToken) {
  const ids = [];
  let url = `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks?fields=next,items(track(id))&limit=50`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error(`Failed to fetch playlist: ${response.status}`);

    const data = await response.json();
    for (const item of data.items) {
      if (item.track?.id) ids.push(item.track.id);
    }
    url = data.next;
  }

  return ids;
}

function parseTracksFromFeed(xml) {
  const parser = new XMLParser();
  const contents = parser.parse(xml);
  const episodes = [contents.rss.channel.item].flat(); // handle single-item feeds
  const tracks = [];

  for (const ep of episodes) {
    const content = ep['content:encoded'];
    if (!content) continue;

    const parsedContent = parser.parse(String(content));
    const playlist = parsedContent.ol?.li;
    if (!playlist) continue;

    for (const song of [playlist].flat()) {
      const parts = song.strong;
      if (!Array.isArray(parts) || parts.length < 2) continue;
      tracks.push({
        title:  decode(String(parts[0]), { level: 'html5' }),
        artist: decode(String(parts[1]), { level: 'html5' }),
      });
    }
  }

  return tracks;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function spotifyGet(url, accessToken) {
  while (true) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 429) {
      const wait = parseInt(response.headers.get('Retry-After') || '5', 10);
      console.log(`Rate limited. Retrying in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }

    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
    return response.json();
  }
}

async function searchTrack(accessToken, { artist, title }) {
  const q = encodeURIComponent(`${artist} ${title}`);
  const data = await spotifyGet(
    `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
    accessToken
  );
  return data.tracks?.items?.[0] ?? null;
}

async function addTrackToPlaylist(accessToken, uri) {
  while (true) {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [uri], position: 0 }),
      }
    );

    if (response.status === 429) {
      const wait = parseInt(response.headers.get('Retry-After') || '5', 10);
      console.log(`Rate limited on add. Retrying in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }

    if (!response.ok) throw new Error(`Failed to add track: ${response.status}`);
    return;
  }
}

export async function handler() {
  const credentials = await getSpotifyCredentials();
  const accessToken = await getAccessToken(credentials);

  console.log('Fetching RSS feed');
  const rssResponse = await fetch(RSS_URL);
  if (!rssResponse.ok) throw new Error(`Failed to fetch RSS: ${rssResponse.status}`);
  const tracks = parseTracksFromFeed(await rssResponse.text());
  console.log(`Found ${tracks.length} tracks in feed`);

  const existingIds = await getPlaylistTrackIds(accessToken);
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

    await addTrackToPlaylist(accessToken, result.uri);
    existingIds.push(result.id); // prevent re-adding within this run
    console.log(`Added: ${track.artist} - ${track.title}`);
    stats.added++;

    await sleep(200); // gentle pacing between adds
  }

  console.log(`Done. Added: ${stats.added}, Skipped: ${stats.skipped}, Not found: ${stats.notFound}`);
  return stats;
}
