/**
 * Normalize FotMob TV station names to short Discord fixture labels.
 * Used by lab poll script; index.js only displays pre-verified `broadcast` strings.
 */

/** @type {Array<{ test: RegExp, label: string }>} */
const CANONICAL = [
  { test: /peacock/i, label: "Peacock" },
  { test: /paramount\+?\s*\(us\)|^paramount\+?$/i, label: "Paramount+" },
  { test: /usa\s*network/i, label: "USA" },
  { test: /^usa$/i, label: "USA" },
  { test: /espn/i, label: "ESPN" },
  { test: /nbc/i, label: "NBC" },
  { test: /fox\s*(one|sports|deportes)?/i, label: "FOX" },
  { test: /cbs\s*sports/i, label: "CBS" },
  { test: /telemundo/i, label: "Telemundo" },
  { test: /\btudn\b/i, label: "TUDN" },
  { test: /fubo/i, label: "Fubo" },
  { test: /apple\s*tv/i, label: "Apple TV" },
  { test: /sky\s*sports/i, label: "Sky" },
  { test: /tnt\s*sports/i, label: "TNT" },
];

/** Prefer these when multiple US outlets list the same match (TBF: USA Network first). */
const DISPLAY_PRIORITY = [
  "USA",
  "Peacock",
  "Paramount+",
  "ESPN",
  "NBC",
  "FOX",
  "CBS",
  "Telemundo",
  "TUDN",
  "Fubo",
  "Apple TV",
  "Sky",
  "TNT",
];

/**
 * Split compound FotMob strings (slashes, commas, "and").
 * @param {string} raw
 * @returns {string[]}
 */
function splitRawTokens(raw) {
  return String(raw)
    .split(/[/,]|(?:\s+and\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Map one raw token to a canonical label, or null if unrecognized.
 * @param {string} token
 * @returns {string | null}
 */
function mapToken(token) {
  for (const { test, label } of CANONICAL) {
    if (test.test(token)) return label;
  }
  return null;
}

/**
 * Normalize FotMob station name(s) to a short publishable label.
 * Returns null if nothing maps to a known canonical (do not publish).
 *
 * @param {string | string[]} raw - station.name and/or callSign from tvlistings/tvguide
 * @param {{ maxLabels?: number }} [opts]
 * @returns {string | null} e.g. "Peacock", "USA · ESPN"
 */
function normalizeBroadcastLabel(raw, opts = {}) {
  const maxLabels = opts.maxLabels ?? 3;
  const tokens = Array.isArray(raw) ? raw.flatMap(splitRawTokens) : splitRawTokens(raw);
  const labels = new Set();
  for (const token of tokens) {
    const label = mapToken(token);
    if (label) labels.add(label);
  }
  if (!labels.size) return null;

  const ordered = DISPLAY_PRIORITY.filter((l) => labels.has(l));
  const extras = [...labels].filter((l) => !ordered.includes(l));
  const final = [...ordered, ...extras].slice(0, maxLabels);
  return final.join(" · ");
}

module.exports = { normalizeBroadcastLabel, mapToken, splitRawTokens, CANONICAL, DISPLAY_PRIORITY };
