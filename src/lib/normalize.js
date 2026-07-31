const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function clean(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTrackKey(artist, title) {
  return `${clean(artist)}|${clean(title)}`;
}
