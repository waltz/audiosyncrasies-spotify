import { decode } from "html-entities";

const SHOW_URL = "https://bff.fm/shows/audiosyncrasies";
const DEFAULT_DELAY_MS = 1000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetches a bff.fm page, backing off on 429/503 (respecting Retry-After
// when present), and always waits `delayMs` after a successful fetch so
// we don't hammer their servers on a long crawl.
export async function fetchWithRateLimit(url, { delayMs = DEFAULT_DELAY_MS } = {}) {
  while (true) {
    const response = await fetch(url);

    if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get("Retry-After");
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : delayMs * 5;
      console.log(
        `Rate limited by bff.fm (${response.status}) on ${url}. Waiting ${wait}ms.`
      );
      await sleep(wait);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const html = await response.text();
    await sleep(delayMs);
    return html;
  }
}

// Crawls the show's paginated listing (page 1, page:2, page:3, ...) until
// a 404, collecting every episode's broadcast id.
export async function fetchEpisodeIds({ delayMs = DEFAULT_DELAY_MS } = {}) {
  const ids = new Set();
  let page = 1;

  while (true) {
    const url = page === 1 ? SHOW_URL : `${SHOW_URL}/page:${page}`;

    let html;
    try {
      html = await fetchWithRateLimit(url, { delayMs });
    } catch (error) {
      console.log(`Stopped crawling listing pages at page ${page}: ${error.message}`);
      break;
    }

    const matches = [...html.matchAll(/href="\/broadcasts\/(\d+)"/g)];
    if (matches.length === 0) break;

    for (const [, id] of matches) ids.add(id);
    console.log(`Page ${page}: found ${matches.length} episode links (${ids.size} total so far)`);
    page++;
  }

  return [...ids];
}

// Extracts {artist, title} pairs from a single broadcast page's tracklist.
export function parseTracklist(html) {
  const listMatch = html.match(
    /<ol class="Tracklisting-list">([\s\S]*?)<\/ol>/
  );
  if (!listMatch) return [];

  const listHtml = listMatch[1];
  const itemRegex =
    /<li class="Tracklisting-listItem[\s\S]*?itemprop="recordingOf"><a[^>]*>([^<]+)<\/a><\/strong>[\s\S]*?itemprop="byArtist"><a[^>]*>([^<]+)<\/a>/g;

  const tracks = [];
  let match;
  while ((match = itemRegex.exec(listHtml)) !== null) {
    tracks.push({
      title: decode(match[1], { level: "html5" }),
      artist: decode(match[2], { level: "html5" }),
    });
  }
  return tracks;
}

export async function fetchEpisodeTracklist(
  broadcastId,
  { delayMs = DEFAULT_DELAY_MS } = {}
) {
  const html = await fetchWithRateLimit(
    `https://bff.fm/broadcasts/${broadcastId}`,
    { delayMs }
  );
  return parseTracklist(html);
}

// Crawls the entire show archive - every episode ever listed, not just
// the ~20-episode rolling window the RSS feed exposes - and returns every
// track found across all of them.
export async function fetchFullArchive({ delayMs = DEFAULT_DELAY_MS } = {}) {
  console.log("Crawling episode list...");
  const episodeIds = await fetchEpisodeIds({ delayMs });
  console.log(`Found ${episodeIds.length} episodes.`);

  const tracks = [];
  for (const [index, id] of episodeIds.entries()) {
    const episodeTracks = await fetchEpisodeTracklist(id, { delayMs });
    console.log(
      `Episode ${index + 1}/${episodeIds.length} (broadcast ${id}): ${episodeTracks.length} tracks`
    );
    tracks.push(...episodeTracks);
  }

  return tracks;
}
