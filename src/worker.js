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

// blobs: [trigger, status] doubles: [durationMs, added, notFound, alreadyProcessed]
function recordMetric(env, { trigger, status, durationMs, stats }) {
  env.ANALYTICS_ENGINE.writeDataPoint({
    blobs: [trigger, status],
    doubles: [
      durationMs,
      stats?.added ?? 0,
      stats?.notFound ?? 0,
      stats?.alreadyProcessed ?? 0,
    ],
  });
}

export default {
  async scheduled(event, env, ctx) {
    console.log(
      "Scheduled trigger at:",
      new Date(event.scheduledTime).toISOString(),
    );
    const start = Date.now();
    try {
      const stats = await runSync(env);
      console.log("Sync completed:", stats);
      recordMetric(env, {
        trigger: "scheduled",
        status: "success",
        durationMs: Date.now() - start,
        stats,
      });
    } catch (error) {
      console.error("Sync failed:", error);
      recordMetric(env, {
        trigger: "scheduled",
        status: "error",
        durationMs: Date.now() - start,
      });
      throw error;
    }
  },

  async fetch(request, env, ctx) {
    const start = Date.now();
    try {
      const stats = await runSync(env);
      recordMetric(env, {
        trigger: "manual",
        status: "success",
        durationMs: Date.now() - start,
        stats,
      });
      return new Response(JSON.stringify({ success: true, stats }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Sync failed:", error);
      recordMetric(env, {
        trigger: "manual",
        status: "error",
        durationMs: Date.now() - start,
      });
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
