import { XMLParser } from "fast-xml-parser";
import { decode } from "html-entities";

const RSS_URL = "https://bff.fm/feed/shows/audiosyncrasies.rss";

export async function fetchAndParseFeed(url = RSS_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`);
  }

  const xml = await response.text();
  return parseTracksFromFeed(xml);
}

export function parseTracksFromFeed(xml) {
  const parser = new XMLParser();
  const contents = parser.parse(xml);
  const episodes = [contents.rss.channel.item].flat();
  const tracks = [];

  for (const ep of episodes) {
    const content = ep["content:encoded"];
    if (!content) continue;

    const parsedContent = parser.parse(String(content));
    const playlist = parsedContent.ol?.li;
    if (!playlist) continue;

    for (const song of [playlist].flat()) {
      const parts = song.strong;
      if (!Array.isArray(parts) || parts.length < 2) continue;
      tracks.push({
        title: decode(String(parts[0]), { level: "html5" }),
        artist: decode(String(parts[1]), { level: "html5" }),
      });
    }
  }

  return tracks;
}
