async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getPlaylistTracks(accessToken, playlistId) {
  const ids = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=next,items(track(id))&limit=50`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: ${response.status}`);
    }

    const data = await response.json();
    for (const item of data.items) {
      if (item.track?.id) ids.push(item.track.id);
    }
    url = data.next;
  }

  return ids;
}

export async function searchTrack(accessToken, { artist, title }) {
  const q = encodeURIComponent(`${artist} ${title}`);

  while (true) {
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (response.status === 429) {
      const wait = parseInt(response.headers.get("Retry-After") || "5", 10);
      console.log(`Rate limited. Retrying in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.tracks?.items?.[0] ?? null;
  }
}

export async function addTrackToPlaylist(accessToken, uri, playlistId) {
  while (true) {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [uri], position: 0 }),
      }
    );

    if (response.status === 429) {
      const wait = parseInt(response.headers.get("Retry-After") || "5", 10);
      console.log(`Rate limited on add. Retrying in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to add track: ${response.status}`);
    }

    return;
  }
}

export async function getAccessTokenFromRefreshToken(
  clientId,
  clientSecret,
  refreshToken
) {
  const credentials = `${clientId}:${clientSecret}`;
  const base64Credentials = btoa(credentials);

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${base64Credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get access token: ${response.status} ${await response.text()}`
    );
  }

  const data = await response.json();

  if (data.refresh_token) {
    console.warn(
      "Spotify issued a new refresh token. The stored SPOTIFY_REFRESH_TOKEN secret is now stale and needs to be updated, or the next sync will fail."
    );
  }

  return data.access_token;
}
