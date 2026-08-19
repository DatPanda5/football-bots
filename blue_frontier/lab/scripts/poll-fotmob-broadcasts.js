#!/usr/bin/env node
/**
 * Poll FotMob for US TV listings on upcoming Everton PL fixtures.
 * Dry-run by default — prints suggested `broadcast` values only.
 *
 *   node blue_frontier/lab/scripts/poll-fotmob-broadcasts.js
 *   node blue_frontier/lab/scripts/poll-fotmob-broadcasts.js --apply
 *   node blue_frontier/lab/scripts/poll-fotmob-broadcasts.js --days 14
 */
const fs = require("fs");
const path = require("path");
const { normalizeBroadcastLabel } = require("../../lib/broadcast-label");

const ROOT = path.join(__dirname, "..", "..");
const INDEX = path.join(ROOT, "index.js");
const FOTMOB_BASE = "https://www.fotmob.com/api/data";
const COUNTRY = "US";
const EVERTON_TEAM_ID = "8668";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const daysAhead = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] || 21);

function extractFixtures() {
  const src = fs.readFileSync(INDEX, "utf8");
  const m = src.match(/const ALL_FIXTURES = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error("ALL_FIXTURES not found in index.js");
  return eval("[" + m[1] + "]");
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 BlueFrontierLab/1.0" },
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/** @returns {Promise<Map<number, string[]>>} matchId → raw station names */
async function fetchTvListings() {
  const data = await fetchJson(`${FOTMOB_BASE}/tvlistings?countryCode=${COUNTRY}`);
  /** @type {Map<number, string[]>} */
  const byMatch = new Map();
  for (const [matchId, entries] of Object.entries(data)) {
    const names = (entries || [])
      .map((e) => e?.station?.name || e?.station?.callSign)
      .filter(Boolean);
    if (names.length) byMatch.set(Number(matchId), names);
  }
  return byMatch;
}

/** @returns {Promise<Map<number, string[]>>} */
async function fetchTvGuide() {
  const data = await fetchJson(`${FOTMOB_BASE}/tvguide?countryCode=ENG`);
  /** @type {Map<number, string[]>} */
  const byMatch = new Map();
  for (const blocks of Object.values(data)) {
    for (const block of blocks) {
      for (const match of block.matches || []) {
        const names = (match.channels || []).map((c) => c.name).filter(Boolean);
        if (names.length) byMatch.set(match.id, names);
      }
    }
  }
  return byMatch;
}

/** Normalize kickoff for cross-source matching (index.js vs FotMob). */
function kickoffKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toISOString();
}

/** @returns {Promise<Map<string, number>>} key: kickoff|opponent → fotmob match id */
async function fetchEvertonFotmobIds() {
  const team = await fetchJson(`${FOTMOB_BASE}/teams?id=${EVERTON_TEAM_ID}&ccode3=ENG`);
  const fixtures = team?.fixtures?.allFixtures?.fixtures || [];
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const f of fixtures) {
    const kickoff = kickoffKey(f?.status?.utcTime);
    const opponent = f?.opponent?.name || "";
    if (kickoff && opponent) map.set(`${kickoff}|${opponentKey(opponent)}`, Number(f.id));
  }
  return map;
}

function opponentKey(opponent) {
  return opponent.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ").trim();
}

function resolveFotmobId(fixture, fotmobMap) {
  const key = `${kickoffKey(fixture.kickoffUTC)}|${opponentKey(fixture.opponent)}`;
  if (fotmobMap.has(key)) return fotmobMap.get(key);
  // Fuzzy: same kickoff, opponent substring (AFC Bournemouth vs Bournemouth)
  const kick = kickoffKey(fixture.kickoffUTC);
  const opp = opponentKey(fixture.opponent);
  for (const [k, id] of fotmobMap) {
    const [kKick, kOpp] = k.split("|");
    if (kKick === kick && (kOpp.includes(opp) || opp.includes(kOpp))) return id;
  }
  return null;
}

function collectRawNames(matchId, tvListings, tvGuide) {
  const names = [];
  if (tvListings.has(matchId)) names.push(...tvListings.get(matchId));
  if (tvGuide.has(matchId)) names.push(...tvGuide.get(matchId));
  return names;
}

function upsertBroadcastInIndex(fixtureId, broadcast) {
  let src = fs.readFileSync(INDEX, "utf8");
  const re = new RegExp(
    `(id:\\s*"${fixtureId}"[\\s\\S]*?)(\\n\\s*\\},)`,
    "m",
  );
  const block = src.match(re);
  if (!block) throw new Error(`Fixture block ${fixtureId} not found`);

  let segment = block[1];
  if (/broadcast:\s*"/.test(segment)) {
    segment = segment.replace(/broadcast:\s*"[^"]*"/, `broadcast: "${broadcast}"`);
  } else {
    segment = segment.replace(/(srMatchId:\s*null,?)/, `$1\n    broadcast: "${broadcast}",`);
  }
  src = src.replace(block[1], segment);
  fs.writeFileSync(INDEX, src);
}

async function main() {
  const now = Date.now();
  const horizon = now + daysAhead * 86400000;
  const fixtures = extractFixtures().filter(
    (f) => f.competition === "premier_league" && new Date(f.kickoffUTC).getTime() > now && new Date(f.kickoffUTC).getTime() <= horizon,
  );

  console.log(`Polling FotMob (${COUNTRY}) for ${fixtures.length} upcoming PL fixtures (next ${daysAhead} days)…\n`);

  const [tvListings, tvGuide, fotmobMap] = await Promise.all([
    fetchTvListings(),
    fetchTvGuide(),
    fetchEvertonFotmobIds(),
  ]);

  const updates = [];
  for (const f of fixtures) {
    const fotmobId = resolveFotmobId(f, fotmobMap);
    const rawNames = fotmobId ? collectRawNames(fotmobId, tvListings, tvGuide) : [];
    const label = rawNames.length ? normalizeBroadcastLabel(rawNames) : null;
    const existing = f.broadcast || null;

    console.log(`${f.id}  ${f.evertonHome ? "Everton vs" : "vs Everton"} ${f.opponent}`);
    console.log(`  FotMob id: ${fotmobId ?? "—"}`);
    console.log(`  Raw: ${rawNames.length ? rawNames.join(" | ") : "(none)"}`);
    console.log(`  Verified label: ${label ?? "(skip — not publishable)"}`);
    console.log(`  Current index.js: ${existing ?? "(none)"}`);

    if (label && label !== existing) {
      updates.push({ id: f.id, broadcast: label, fotmobId, rawNames });
      console.log(`  → would set broadcast: "${label}"`);
    } else if (!label) {
      console.log("  → no change (wait for listings)");
    } else {
      console.log("  → already up to date");
    }
    console.log();
  }

  if (!updates.length) {
    console.log("No publishable broadcast updates.");
    return;
  }

  if (!apply) {
    console.log(`Dry run: ${updates.length} update(s). Re-run with --apply to write index.js`);
    return;
  }

  for (const u of updates) {
    upsertBroadcastInIndex(u.id, u.broadcast);
    console.log(`Applied ${u.id} → broadcast: "${u.broadcast}"`);
  }
  console.log("\nRun: node blue_frontier/scripts/regenerate-reference-md.js");
  console.log("Then lab restart or deploy production.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
