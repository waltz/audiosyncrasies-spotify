import { fetchAndParseFeed } from "./lib/rss.js";
import { getAccessTokenFromRefreshToken } from "./lib/spotify.js";
import { syncTracksToPlaylist } from "./lib/sync.js";

async function runSync(env) {
  const playlistId = env.PLAYLIST_ID;

  console.log("Fetching access token...");
  const accessToken = await getAccessTokenFromRefreshToken(
    env.SPOTIFY_CLIENT_ID,
    env.SPOTIFY_CLIENT_SECRET,
    env.SPOTIFY_REFRESH_TOKEN,
  );

  console.log("Fetching RSS feed...");
  const tracks = await fetchAndParseFeed();

  console.log("Syncing tracks to playlist...");
  const stats = await syncTracksToPlaylist(
    accessToken,
    tracks,
    playlistId,
    env.PROCESSED_TRACKS,
  );

  return stats;
}

export default {
  async scheduled(event, env, ctx) {
    console.log(
      "Scheduled trigger at:",
      new Date(event.scheduledTime).toISOString(),
    );
    try {
      const stats = await runSync(env);
      console.log("Sync completed:", stats);
    } catch (error) {
      console.error("Sync failed:", error);
      throw error;
    }
  },

  async fetch(request, env, ctx) {
    try {
      const stats = await runSync(env);
      return new Response(JSON.stringify({ success: true, stats }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Sync failed:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }, null, 2),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
