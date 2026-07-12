console.log("Loading auth bootstrap UI");

const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const spotifyClientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET;
const scopes = [
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
];

const startButton = document.getElementById("start");
const refreshTokenInput = document.getElementById("refresh_token");

startButton.addEventListener("click", doUserAuth);

if (new URLSearchParams(window.location.search).has("code")) {
  console.log("Returned from Spotify redirect, resuming auth flow.");
  doUserAuth();
}

async function doUserAuth() {
  console.log("Authing with Spotify");

  const redirectUri = window.location.origin;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (!code) {
    redirectToSpotify(redirectUri);
    return;
  }

  const token = await exchangeCodeForToken(code, redirectUri);
  removeCodeFromUrl();

  refreshTokenInput.value = token?.refresh_token ?? "";
}

function redirectToSpotify(redirectUri) {
  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code, redirectUri) {
  const credentials = btoa(`${spotifyClientId}:${spotifyClientSecret}`);

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to exchange code for token: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

function removeCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  window.history.replaceState({}, document.title, url.href.replace(/\?$/, ""));
}
