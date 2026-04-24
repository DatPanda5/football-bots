const {
  Client,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require("discord.js");
// Lab uses .env.lab (see lab-frontier.sh); production uses Railway vars or .env
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

// ───────────────────────────────────────────────────────────────
//  ENV VALIDATION — fail fast with clear message if credentials missing
// ───────────────────────────────────────────────────────────────
const REQUIRED_ENV  = ["DISCORD_TOKEN", "CLIENT_ID"];
const PLACEHOLDERS  = /your_application_client_id_here|your_discord_server_id_here|your_bot_token_here/i;

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(`[Config] Missing required env: ${missing.join(", ")}`);
    console.error("Add them to .env (see .env.example). Then run: npm start");
    process.exit(1);
  }
  const guildId  = process.env.GUILD_ID?.trim();
  const blueFrontierId = process.env.BLUE_FRONTIER_GUILD_ID?.trim();
  if (!guildId && !blueFrontierId) {
    console.error("[Config] Need at least one of GUILD_ID or BLUE_FRONTIER_GUILD_ID for slash command registration.");
    process.exit(1);
  }
  const token    = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (PLACEHOLDERS.test(token + clientId + (guildId || "") + (blueFrontierId || ""))) {
    console.error("[Config] .env still contains placeholder values.");
    console.error("Replace with your real Discord bot token, application (client) ID, and server (guild) ID(s).");
    process.exit(1);
  }
}

validateEnv();

// ═══════════════════════════════════════════════════════════════
//  THE BLUE FRONTIER COMMITTEE — Discord Bot
// ═══════════════════════════════════════════════════════════════

const BOT_NAME   = "The Blue Frontier Committee";
const BOT_COLOUR = 0x003399; // Everton royal blue
const BOT_FOOTER = "The Blue Frontier Committee • COYB! 🔵";

// ───────────────────────────────────────────────────────────────
//  SQLITE PERSISTENCE
//  DB file: <DATA_DIR>/predictions.db
//  Set DATA_DIR in env (e.g. /data on Railway) to use a persistent volume.
// ───────────────────────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "predictions.db");
// One-time restore: set RESTORE_DB_BASE64 to a base64-encoded backup of predictions.db (e.g. after adding a volume).
if (process.env.RESTORE_DB_BASE64) {
  const existing = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  if (existing === 0) {
    try {
      fs.writeFileSync(DB_PATH, Buffer.from(process.env.RESTORE_DB_BASE64, "base64"));
      console.log("[DB] Restored predictions from RESTORE_DB_BASE64. Remove the env var after confirming.");
    } catch (e) {
      console.error("[DB] Restore failed:", e.message);
    }
  }
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS predictions (
    key           TEXT PRIMARY KEY,
    userId        TEXT NOT NULL,
    displayName   TEXT NOT NULL,
    fixture       TEXT NOT NULL,
    evertonScore  TEXT NOT NULL,
    opponentScore TEXT NOT NULL,
    scorers       TEXT,
    submittedAt   TEXT NOT NULL
  );

  -- Tracks which fixtures have already had results posted
  -- so auto-checker and /final don't double-post after a restart.
  CREATE TABLE IF NOT EXISTS finalised (
    fixtureId   TEXT PRIMARY KEY,
    finalisedAt TEXT NOT NULL
  );

  -- Stored result per fixture so MODs can view /final again (and for auto-posted results).
  CREATE TABLE IF NOT EXISTS fixture_results (
    fixtureId    TEXT PRIMARY KEY,
    evertonGoals INTEGER NOT NULL,
    opponentGoals INTEGER NOT NULL,
    scorers      TEXT,
    finalisedAt  TEXT NOT NULL
  );

  -- Tracks which fixtures have had "Predictions locked" posted at kickoff (so we can catch up after restart).
  CREATE TABLE IF NOT EXISTS kickoff_lock_posted (
    fixtureId   TEXT PRIMARY KEY,
    postedAt    TEXT NOT NULL
  );

  -- Points (same system as footy_bot): 5pt exact score, 2pt correct result, 1pt per correct scorer.
  -- Everton-only: single scope, season + all-time.
  CREATE TABLE IF NOT EXISTS points (
    userId        TEXT NOT NULL,
    displayName   TEXT NOT NULL,
    season_points INTEGER NOT NULL DEFAULT 0,
    alltime_points INTEGER NOT NULL DEFAULT 0,
    season_year   TEXT NOT NULL,
    PRIMARY KEY (userId, season_year)
  );
  CREATE TABLE IF NOT EXISTS points_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fixtureId     TEXT NOT NULL,
    userId        TEXT NOT NULL,
    displayName   TEXT NOT NULL,
    points_awarded INTEGER NOT NULL,
    reason        TEXT NOT NULL,
    awardedAt     TEXT NOT NULL
  );
`);

// Migrate: add bonus card columns (silently no-ops if already present).
for (const sql of [
  "ALTER TABLE predictions ADD COLUMN bonusYellowCards TEXT",
  "ALTER TABLE predictions ADD COLUMN bonusRedCards TEXT",
  "ALTER TABLE fixture_results ADD COLUMN yellowCards INTEGER",
  "ALTER TABLE fixture_results ADD COLUMN redCards INTEGER",
]) { try { db.exec(sql); } catch {} }

// Seed from seed-predictions.json: when table is empty, or when SEED_PREDICTIONS=1 (merge/update from file).
const SEED_PATH = path.join(__dirname, "seed-predictions.json");
const forceSeed = /^1|true|yes$/i.test(process.env.SEED_PREDICTIONS || "");
(function seedPredictions() {
  const count = db.prepare("SELECT COUNT(*) as n FROM predictions").get().n;
  if (count > 0 && !forceSeed) {
    console.log(`[DB] Seed skipped: table has ${count} row(s) and SEED_PREDICTIONS is not set. Set SEED_PREDICTIONS=1 to re-run seed.`);
    return;
  }
  if (!fs.existsSync(SEED_PATH)) {
    console.warn("[DB] Seed skipped: seed-predictions.json not found at", SEED_PATH);
    return;
  }
  let list;
  try {
    list = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  } catch (e) {
    console.warn("[DB] seed-predictions.json invalid or empty:", e.message);
    return;
  }
  const insert = db.prepare(`
    INSERT OR REPLACE INTO predictions (key, userId, displayName, fixture, evertonScore, opponentScore, scorers, submittedAt)
    VALUES (@key, @userId, @displayName, @fixture, @evertonScore, @opponentScore, @scorers, @submittedAt)
  `);
  const now = new Date().toISOString();
  let n = 0;
  for (const row of list) {
    if (!row.userId || !row.displayName || !row.fixture || row.evertonScore === undefined || row.opponentScore === undefined) continue;
    const key = `${row.userId}_${row.fixture}`;
    insert.run({
      key,
      userId: String(row.userId),
      displayName: String(row.displayName),
      fixture: String(row.fixture),
      evertonScore: String(row.evertonScore),
      opponentScore: String(row.opponentScore),
      scorers: row.scorers != null ? String(row.scorers) : null,
      submittedAt: now,
    });
    n++;
  }
  if (n) console.log(`[DB] Seeded ${n} prediction(s) from seed-predictions.json` + (forceSeed ? " (SEED_PREDICTIONS=1). Remove the var after deploy." : ""));
  else console.warn("[DB] Seed ran but no valid rows in seed-predictions.json (check userId, displayName, fixture, scores).");
})();

// Normalize prediction row from DB (SQLite/better-sqlite3 may return different column name casing).
function normalizePredRow(row) {
  if (!row) return row;
  const r = {
    key: row.key ?? row.KEY,
    userId: row.userId ?? row.userid ?? row.USERID,
    displayName: row.displayName ?? row.displayname ?? row.DISPLAYNAME,
    fixture: row.fixture ?? row.FIXTURE,
    evertonScore: row.evertonScore ?? row.evertonscore ?? row.EVERTONSCORE,
    opponentScore: row.opponentScore ?? row.opponentscore ?? row.OPPONENTSCORE,
    scorers: row.scorers ?? row.SCORERS,
    bonusYellowCards: row.bonusYellowCards ?? row.bonusyellowcards ?? null,
    bonusRedCards: row.bonusRedCards ?? row.bonusredcards ?? null,
    submittedAt: row.submittedAt ?? row.submittedat ?? row.SUBMITTEDAT,
  };
  if (r.fixture != null) r.fixture = String(r.fixture).trim();
  return r;
}

function sameFixture(storedFixtureId, fixtureId) {
  return storedFixtureId != null && fixtureId != null && String(storedFixtureId).trim() === String(fixtureId).trim();
}

// ── Drop-in replacement for the original in-memory Map ──────────
// All existing commands work identically — they just read from SQLite now.
const predStore = {
  set(key, pred) {
    db.prepare(`
      INSERT OR REPLACE INTO predictions
        (key, userId, displayName, fixture, evertonScore, opponentScore, scorers, bonusYellowCards, bonusRedCards, submittedAt)
      VALUES
        (@key, @userId, @displayName, @fixture, @evertonScore, @opponentScore, @scorers, @bonusYellowCards, @bonusRedCards, @submittedAt)
    `).run({ ...pred, key, scorers: pred.scorers ?? null, bonusYellowCards: pred.bonusYellowCards ?? null, bonusRedCards: pred.bonusRedCards ?? null });
  },
  get(key) {
    const row = db.prepare("SELECT * FROM predictions WHERE key = ?").get(key);
    return row ? normalizePredRow(row) : undefined;
  },
  has(key) {
    return !!db.prepare("SELECT 1 FROM predictions WHERE key = ?").get(key);
  },
  delete(key) {
    db.prepare("DELETE FROM predictions WHERE key = ?").run(key);
  },
  values() {
    return db.prepare("SELECT * FROM predictions").all().map(normalizePredRow);
  },
};

// ───────────────────────────────────────────────────────────────
//  POINTS (same as footy_bot: 5pt exact, 2pt result, 1pt per scorer)
// ───────────────────────────────────────────────────────────────
const POINTS_EXACT_SCORE    = 5;
const POINTS_CORRECT_RESULT = 2;
const POINTS_CORRECT_SCORER = 1;
const POINTS_CORRECT_BONUS  = 1;

const DERBY_FIXTURE_ID = "fix07";

function _seasonYear() {
  const now = new Date();
  if (now.getUTCMonth() >= 7) {
    return `${now.getUTCFullYear()}-${String(now.getUTCFullYear() + 1).slice(-2)}`;
  }
  return `${now.getUTCFullYear() - 1}-${String(now.getUTCFullYear()).slice(-2)}`;
}

function awardPoints(userId, displayName, fixtureId, points, reason) {
  const season = _seasonYear();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO points (userId, displayName, season_points, alltime_points, season_year)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(userId, season_year) DO UPDATE SET
      displayName     = excluded.displayName,
      season_points   = season_points + excluded.season_points,
      alltime_points  = alltime_points + excluded.alltime_points
  `).run(String(userId), displayName, points, points, season);
  db.prepare(`
    INSERT INTO points_log (fixtureId, userId, displayName, points_awarded, reason, awardedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(fixtureId, String(userId), displayName, points, reason, now);
}

function getLeaderboard(seasonType = "season", limit = 15) {
  const season = _seasonYear();
  if (seasonType === "alltime") {
    return db.prepare(`
      SELECT userId, displayName, SUM(alltime_points) as total_points
      FROM points GROUP BY userId ORDER BY total_points DESC LIMIT ?
    `).all(limit);
  }
  return db.prepare(`
    SELECT userId, displayName, season_points as total_points
    FROM points WHERE season_year = ? ORDER BY season_points DESC LIMIT ?
  `).all(season, limit);
}

function adminResetSeasonPoints() {
  const season = _seasonYear();
  db.prepare("UPDATE points SET season_points = 0 WHERE season_year = ?").run(season);
}

function adminResetAllTimePoints() {
  db.prepare("UPDATE points SET alltime_points = 0").run();
}

// ───────────────────────────────────────────────────────────────
//  ALL REMAINING EVERTON FIXTURES (2025-26 Premier League)
//  This bot only shows Everton fixtures: /fixtures and /predict use this list only.
//  kickoffUTC drives ALL time logic — always keep in UTC ISO 8601.
//  srMatchId: SportRadar event ID — used by the auto result checker.
//             Fill these in as fixtures get closer (IDs appear in the
//             API ~2 weeks before kick-off). fix01 is already confirmed.
// ───────────────────────────────────────────────────────────────
const ALL_FIXTURES = [
  {
    id: "fix01", kickoffUTC: "2026-02-15T20:00:00Z", label: "Mon 15 Feb (played)",
    home: "Everton", away: "Manchester United", opponent: "Manchester United",
    evertonHome: true, srMatchId: "sr:sport_event:66905890",
  },
  {
    id: "fix02", kickoffUTC: "2026-02-18T15:00:00Z", label: "Sat 18 Feb (played)",
    home: "Newcastle United", away: "Everton", opponent: "Newcastle United",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix03", kickoffUTC: "2026-03-03T19:30:00Z", label: "Tue 03 Mar 2:30 PM ET",
    home: "Everton", away: "Burnley", opponent: "Burnley",
    evertonHome: true, srMatchId: null,
  }, // Next match: Everton vs Burnley, 2:30 PM ET today
  {
    id: "fix04", kickoffUTC: "2026-03-14T17:30:00Z", label: "Sat 14 Mar 1:30 PM EDT",
    home: "Arsenal", away: "Everton", opponent: "Arsenal",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix05", kickoffUTC: "2026-03-21T17:30:00Z", label: "Sat 21 Mar 1:30 PM EDT",
    home: "Everton", away: "Chelsea", opponent: "Chelsea",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix06", kickoffUTC: "2026-04-11T14:00:00Z", label: "Sat 11 Apr 10:00 AM EDT",
    home: "Brentford", away: "Everton", opponent: "Brentford",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix07", kickoffUTC: "2026-04-19T13:00:00Z", label: "Sun 19 Apr 9:00 AM EDT",
    home: "Everton", away: "Liverpool", opponent: "Liverpool",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix08", kickoffUTC: "2026-04-25T14:00:00Z", label: "Sat 25 Apr 10:00 AM EDT",
    home: "West Ham United", away: "Everton", opponent: "West Ham United",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix09", kickoffUTC: "2026-05-04T19:00:00Z", label: "Mon 04 May 3:00 PM EDT",
    home: "Everton", away: "Manchester City", opponent: "Manchester City",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix10", kickoffUTC: "2026-05-09T14:00:00Z", label: "Sat 09 May 10:00 AM EDT",
    home: "Crystal Palace", away: "Everton", opponent: "Crystal Palace",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix11", kickoffUTC: "2026-05-17T14:00:00Z", label: "Sun 17 May 10:00 AM EDT",
    home: "Everton", away: "Sunderland", opponent: "Sunderland",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix12", kickoffUTC: "2026-05-24T15:00:00Z", label: "Sun 24 May 11:00 AM EDT",
    home: "Tottenham Hotspur", away: "Everton", opponent: "Tottenham Hotspur",
    evertonHome: false, srMatchId: null,
  },
];

// ───────────────────────────────────────────────────────────────
//  EVERTON SQUAD 2025-26
// ───────────────────────────────────────────────────────────────
const EVERTON_SQUAD_2025_26 = [
  { number: 1,  name: "Jordan Pickford",       positions: "GK" },
  { number: 12, name: "Mark Travers",           positions: "GK" },
  { number: 31, name: "Tom King",               positions: "GK" },
  { number: 53, name: "Harry Tyrer",            positions: "GK" },
  { number: 2,  name: "Nathan Patterson",       positions: "RB" },
  { number: 5,  name: "Michael Keane",          positions: "CB" },
  { number: 6,  name: "James Tarkowski",        positions: "CB" },
  { number: 15, name: "Jake O'Brien",           positions: "CB" },
  { number: 16, name: "Vitalii Mykolenko",      positions: "LB" },
  { number: 23, name: "Séamus Coleman",         positions: "RB (Captain)" },
  { number: 32, name: "Jarrad Branthwaite",     positions: "CB" },
  { number: 39, name: "Adam Aznou",             positions: "LB" },
  { number: 64, name: "Reece Welch",            positions: "CB" },
  { number: 7,  name: "Dwight McNeil",          positions: "LW/AM" },
  { number: 18, name: "Jack Grealish",          positions: "LW/AM" },
  { number: 20, name: "Tyler Dibling",          positions: "RW/AM" },
  { number: 22, name: "Kiernan Dewsbury-Hall",  positions: "CM" },
  { number: 24, name: "Charly Alcaraz",         positions: "AM" },
  { number: 27, name: "Idrissa Gana Gueye",    positions: "DM" },
  { number: 34, name: "Merlin Röhl",            positions: "CM" },
  { number: 37, name: "James Garner",           positions: "CM/DM" },
  { number: 42, name: "Tim Iroegbunam",         positions: "CM/DM" },
  { number: 45, name: "Harrison Armstrong",     positions: "CM" },
  { number: 76, name: "Malik Olayiwola",        positions: "CM" },
  { number: 9,  name: "Beto",                   positions: "ST" },
  { number: 10, name: "Iliman Ndiaye",          positions: "SS/RW" },
  { number: 11, name: "Thierno Barry",          positions: "ST" },
  { number: 19, name: "Tyrique George",         positions: "Winger" },
  { number: 57, name: "Justin Clarke",          positions: "ST" },
  { number: 58, name: "Braiden Graham",         positions: "ST" },
];

// Diacritic normalization so "Merlin Rohl" and "Merlin Röhl" match (ASCII vs special chars).
function normalizeDiacritics(str) {
  return String(str)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss");
}

// ───────────────────────────────────────────────────────────────
//  OPPONENT SQUADS 2025-26 — remaining fixtures (verified Feb 2026)
//  Key = opponent name as in ALL_FIXTURES. Value = array of player names for placeholders.
// ───────────────────────────────────────────────────────────────
const OPPONENT_SQUADS_2025_26 = {
  "Manchester United": [
    "Noussair Mazraoui", "Matthijs de Ligt", "Harry Maguire", "Lisandro Martinez", "Tyrell Malacia", "Leny Yoro", "Luke Shaw", "Ayden Heaven", "Tyler Fredricson", "Diego Leon",
    "Diogo Dalot", "Mason Mount", "Bruno Fernandes", "Patrick Dorgu", "Amad", "Casemiro", "Manuel Ugarte", "Kobbie Mainoo",
    "Matheus Cunha", "Joshua Zirkzee", "Bryan Mbeumo", "Benjamin Sesko", "Chido Obi", "Shea Lacey",
  ],
  "Newcastle United": [
    "Kieran Trippier", "Lewis Hall", "Sven Botman", "Fabian Schär", "Malick Thiaw", "Emil Krafth", "Valentino Livramento", "Daniel Burn", "Alex Murphy",
    "Joelinton", "Sandro Tonali", "Joseph Willock", "Bruno Guimarães", "Jacob Ramsey", "Alfie Harrison", "Lewis Miley",
    "Yoane Wissa", "Anthony Gordon", "Harvey Barnes", "William Osula", "Anthony Elanga", "Jacob Murphy", "Nick Woltemade",
  ],
  "Burnley": [
    "Kyle Walker", "Quilindschy Hartman", "Joe Worrall", "Maxime Estève", "Axel Tuanzebe", "Bashir Humphreys", "Connor Roberts", "Hjalmar Ekdal", "Lucas Pires", "Jordan Beyer",
    "Lesley Ugochukwu", "Florentino", "James Ward-Prowse", "Josh Cullen", "Hannibal Mejbri", "Josh Laurent", "Mike Trésor",
    "Jacob Bruun Larsen", "Lyle Foster", "Marcus Edwards", "Jaidon Anthony", "Loum Tchaouna", "Zian Flemming", "Zeki Amdouni", "Armando Broja",
  ],
  "Arsenal": [
    "William Saliba", "Cristhian Mosquera", "Ben White", "Piero Hincapié", "Gabriel", "Jurriën Timber", "Riccardo Calafiori", "Myles Lewis-Skelly",
    "Martin Ødegaard", "Eberechi Eze", "Christian Nørgaard", "Mikel Merino", "Martín Zubimendi", "Declan Rice", "Max Dowman",
    "Bukayo Saka", "Gabriel Jesus", "Gabriel Martinelli", "Viktor Gyökeres", "Leandro Trossard", "Noni Madueke", "Kai Havertz",
  ],
  "Chelsea": [
    "Marc Cucurella", "Tosin Adarabioyo", "Benoit Badiashile", "Levi Colwill", "Mamadou Sarr", "Jorrel Hato", "Trevoh Chalobah", "Reece James", "Malo Gusto", "Wesley Fofana", "Josh Acheampong",
    "Enzo Fernández", "Dario Essugo", "Andrey Santos", "Moisés Caicedo", "Romeo Lavia",
    "Pedro Neto", "Liam Delap", "Cole Palmer", "Jamie Gittens", "João Pedro", "Mykhaylo Mudryk", "Marc Guiu", "Estevao", "Alejandro Garnacho",
  ],
  "Brentford": [
    "Rico Henry", "Kristoffer Ajer", "Nathan Collins", "Keane Lewis-Potter", "Michael Kayode",
    "Jordan Henderson", "Mathias Jensen", "Antoni Milambo", "Yehor Yarmoliuk", "Mikkel Damsgaard", "Vitaly Janelt",
    "Kevin", "Igor Thiago", "Joshua Dasilva", "Reiss Nelson", "Fabio Carvalho", "Dango Ouattara", "Romelle Donovan",
  ],
  "Liverpool": [
    "Joe Gomez", "Virgil van Dijk", "Ibrahima Konaté", "Milos Kerkez", "Conor Bradley", "Giovanni Leoni", "Andrew Robertson", "Jeremie Frimpong", "Rhys Williams", "Calvin Ramsay",
    "Wataru Endo", "Florian Wirtz", "Dominik Szoboszlai", "Alexis Mac Allister", "Curtis Jones", "Ryan Gravenberch", "Trey Nyoni", "Stefan Bajcetic",
    "Alexander Isak", "Mohamed Salah", "Federico Chiesa", "Cody Gakpo", "Hugo Ekitike", "Rio Ngumoha",
  ],
  "West Ham United": [
    "Kyle Walker-Peters", "Malick Diouf", "Konstantinos Mavropanos", "Jean-Clair Todibo", "Aaron Wan-Bissaka", "Maximilian Kilman", "Axel Disasi", "Igor Julio",
    "Mateus Fernandes", "Soungoutou Magassa", "Tomás Soucek", "Carlos Soler", "Edson Álvarez", "Lucas Paquetá", "Mohammed Kudus",
    "Crysencio Summerville", "Callum Wilson", "Valentin Castellanos", "Adama Traoré", "Jarrod Bowen", "Niclas Füllkrug",
  ],
  "Manchester City": [
    "Ruben Dias", "John Stones", "Nathan Aké", "Josko Gvardiol", "Rayan Ait Nouri", "Marc Guehi", "Abdukodir Khusanov", "Rico Lewis",
    "Rodri", "Kevin De Bruyne", "Bernardo Silva", "Phil Foden", "Tijjani Reijnders", "Nico González", "Rayan Cherki", "Matheus Nunes",
    "Erling Haaland", "Jeremy Doku", "Savinho", "Oscar Bobb", "Antoine Semenyo", "Omar Marmoush",
  ],
  "Crystal Palace": [
    "Daniel Munoz", "Tyrick Mitchell", "Maxence Lacroix", "Nathaniel Clyne", "Borna Sosa", "Chris Richards", "Chadi Riad",
    "Jefferson Lerma", "Daichi Kamada", "Will Hughes", "Adam Wharton", "Cheick Doucouré",
    "Ismaila Sarr", "Edward Nketiah", "Yéremi Pino", "Brennan Johnson", "Christantus Uche", "Jean-Philippe Mateta", "Jørgen Strand Larsen", "Evann Guessand",
  ],
  "Sunderland": [
    "Dennis Cirkin", "Daniel Ballard", "Lutsharel Geertruida", "Reinildo", "Luke O'Nien", "Omar Alderete", "Nordi Mukiele", "Trai Hume", "Arthur Masuaku",
    "Chris Rigg", "Habib Diarra", "Noah Sadiki", "Enzo Le Fee", "Granit Xhaka", "Jobe Bellingham",
    "Chemsdine Talbi", "Brian Brobbey", "Nilson Angulo", "Romaine Mundle", "Bertrand Traoré", "Simon Adingra", "Marc Guiu",
  ],
  "Tottenham Hotspur": [
    "Radu Dragusin", "Kevin Danso", "Destiny Udogie", "Cristian Romero", "Pedro Porro", "Ben Davies", "Micky van de Ven",
    "João Palhinha", "Xavi Simons", "Yves Bissouma", "James Maddison", "Archie Gray", "Lucas Bergvall", "Dejan Kulusevski", "Conor Gallagher", "Pape Matar Sarr", "Rodrigo Bentancur",
    "Richarlison", "Mathys Tel", "Dominic Solanke", "Mohammed Kudus", "Wilson Odobert", "Randal Kolo Muani",
  ],
  "Aston Villa": [
    "Emiliano Martínez", "Marco Bizot", "George Hemmings",
    "Matty Cash", "Ezri Konsa", "Pau Torres", "Ian Maatsen", "Victor Nilsson Lindelöf", "Tyrone Mings", "Lamare Bogarde", "Lucas Digne",
    "John McGinn", "Youri Tielemans", "Amadou Onana", "Douglas Luiz", "Boubacar Kamara", "Ross Barkley", "Harvey Elliott", "Morgan Rogers",
    "Ollie Watkins", "Tammy Abraham", "Jadon Sancho", "Leon Bailey", "Donyell Malen", "Evann Guessand",
  ],
  "Brighton & Hove Albion": [
    "Bart Verbruggen", "Jason Steele", "Tom McGill", "Nils Ramming",
    "Tariq Lamptey", "Igor Julio", "Adam Webster", "Lewis Dunk", "Jan Paul van Hecke", "Olivier Boscagli", "Ferdi Kadioglu", "Maxim De Cuyper", "Joël Veltman",
    "Solly March", "Jack Hinshelwood", "Carlos Baleba", "James Milner", "Kaoru Mitoma", "Diego Gómez", "Yasin Ayari", "Mats Wieffer", "Matt O'Riley",
    "Stefanos Tzimas", "Georginio Rutter", "Yankuba Minteh", "Danny Welbeck", "Charalampos Kostoulas", "Julio Enciso",
  ],
  "Fulham": [
    "Bernd Leno", "Benjamin Lecomte", "Alfie McNally",
    "Kenny Tete", "Calvin Bassey", "Joachim Andersen", "Jorge Cuenca", "Timothy Castagne", "Ryan Sessegnon", "Issa Diop", "Antonee Robinson",
    "Harrison Reed", "Tom Cairney", "Oscar Bobb", "Sander Berge", "Sasa Lukic", "Joshua King", "Emile Smith Rowe",
    "Raúl Jiménez", "Harry Wilson", "Rodrigo Muniz", "Alex Iwobi", "Jonah Kusi-Asare", "Samuel Chukwueze", "Kevin",
  ],
  "Nottingham Forest": [
    "John Victor", "Angus Gunn", "Matz Sels", "Stefan Ortega",
    "Neco Williams", "Morato", "Murillo", "Jair Cunha", "Luca Netz", "Willy Boly", "Nikola Milenkovic", "Ola Aina", "Nicolò Savona",
    "Ibrahim Sangaré", "Elliot Anderson", "Morgan Gibbs-White", "Nicolás Domínguez", "Ryan Yates", "James McAtee",
    "Callum Hudson-Odoi", "Taiwo Awoniyi", "Chris Wood", "Dan Ndoye", "Eric da Silva Moreira", "Igor Jesus", "Lorenzo Lucca", "Omari Hutchinson", "Dilane Bakwa",
  ],
  "Leeds United": [
    "Lucas Perri", "Illan Meslier", "Alex Cairns", "Karl Darlow",
    "Jayden Bogle", "Gabriel Gudmundsson", "Ethan Ampadu", "Pascal Struijk", "Joe Rodon", "Jaka Bijol", "Sebastiaan Bornauw", "James Justin", "Sam Byram",
    "Sean Longstaff", "Brenden Aaronson", "Anton Stach", "Ao Tanaka", "Facundo Buonanotte", "Ilia Gruev",
    "Daniel James", "Dominic Calvert-Lewin", "Joël Piroe", "Lukas Nmecha", "Noah Okafor", "Wilfried Gnonto",
  ],
  "Wolverhampton Wanderers": [
    "José Sá", "Dan Bentley", "Sam Johnstone",
    "Matt Doherty", "Hugo Bueno", "Santiago Bueno", "David Møller Wolfe", "Yerson Mosquera", "Pedro Lima", "Rodrigo Gomes", "Toti Gomes", "Ladislav Krejcí", "Jackson Tchatchoua",
    "André", "João Gomes", "Jean-Ricner Bellegarde", "Angel Gomes",
    "Adam Armstrong", "Hwang Hee-Chan", "Tolu Arokodare", "Enso González", "Jørgen Strand Larsen",
  ],
  "AFC Bournemouth": [
    "Djordje Petrovic", "Alex Paulsen", "Fraser Forster", "Christos Mandas", "Will Dennis",
    "Julián Araujo", "Adrien Truffert", "Marcos Senesi", "Julio Soler", "Adam Smith", "Bafodé Diakité", "Álex Jiménez", "James Hill",
    "Lewis Cook", "David Brooks", "Alex Scott", "Ryan Christie", "Tyler Adams", "Marcus Tavernier", "Romain Faivre",
    "Evanilson", "Ben Doak", "Justin Kluivert", "Amine Adli", "Junior Kroupi", "Enes Ünal", "Rayan",
  ],
};

// Short-name / nickname aliases for scorer matching — keys and values lowercase.
// Includes Everton + opponent players; ASCII spellings and shortenings map to canonical form.
// "og" / "own goal" (case insensitive) map to "own goal" for when a team scores on themselves.
function buildScorerAliases() {
  const aliases = {
    "kdh": "kiernan dewsbury-hall",
    "job": "jake o'brien",
    "jake o brien": "jake o'brien",
    "rohl": "merlin röhl",
    "ndiaye": "iliman ndiaye",
    "skiliman ndiaye": "iliman ndiaye",
    "skilliman ndiaye": "iliman ndiaye",
    "skilliman": "iliman ndiaye",
    "big mick": "michael keane",
    "keggers": "michael keane",
    "big mick keggers": "michael keane",
    "keano": "michael keane",
    "jimmy g": "james garner",
    "jg": "james garner",
    "jb": "jarrad branthwaite",
    "jb32": "jarrad branthwaite",
    "james branthwaite": "jarrad branthwaite",
    "evil saka": "tyrique george",
    "tark": "james tarkowski",
    "vvd": "virgil van dijk",
    "van dijk": "virgil van dijk",
    "vdv": "micky van de ven",
    "van de ven": "micky van de ven",
    "awb": "aaron wan-bissaka",
    "taty": "valentin castellanos",
    "tatty": "valentin castellanos",
    "kov": "mateo kovacic",
    "kovacic": "mateo kovacic",
    "reindeers": "tijjani reijnders",
    "reijnders": "tijjani reijnders",
    "og": "own goal",
    "own goal": "own goal",
  };
  const addFromName = (name) => {
    const lower = name.toLowerCase();
    const ascii = normalizeDiacritics(lower);
    if (ascii !== lower) aliases[ascii] = lower;
  };
  EVERTON_SQUAD_2025_26.forEach((p) => addFromName(p.name));
  Object.values(OPPONENT_SQUADS_2025_26).flat().forEach(addFromName);
  return aliases;
}
const SCORER_ALIASES = buildScorerAliases();

// ───────────────────────────────────────────────────────────────
//  TEAM ALIASES — for !score command
//  All keys lowercase. Values are substrings matched against API team names.
// ───────────────────────────────────────────────────────────────
const TEAM_ALIASES = {
  // Premier League
  "city":           "manchester city",   "man city":       "manchester city",
  "mancity":        "manchester city",   "mcfc":           "manchester city",
  "man utd":        "manchester united", "man united":     "manchester united",
  "manu":           "manchester united", "united":         "manchester united",
  "yanited":        "manchester united", "mufc":           "manchester united",
  "spurs":          "tottenham",         "thfc":           "tottenham",
  "blues":          "everton",           "the blues":      "everton",
  "toffees":        "everton",           "the toffees":    "everton",
  "efc":            "everton",
  "villa":          "aston villa",       "avfc":           "aston villa",
  "wolves":         "wolverhampton",     "forest":         "nottingham",
  "nffc":           "nottingham",
  "toon":           "newcastle",         "toons":          "newcastle",
  "the toon":       "newcastle",         "magpies":        "newcastle",
  "barcodes":       "newcastle",         "barcode":        "newcastle",
  "gunners":        "arsenal",           "the gunners":    "arsenal",
  "afc":            "arsenal",
  "reds":           "liverpool",         "the reds":       "liverpool",
  "lfc":            "liverpool",
  "hammers":        "west ham",          "the hammers":    "west ham",
  "cherries":       "bournemouth",       "seagulls":       "brighton",
  "palace":         "crystal palace",    "eagles":         "crystal palace",
  "cottagers":      "fulham",            "saints":         "southampton",
  "clarets":        "burnley",           "black cats":     "sunderland",
  "leeds":          "leeds",             "lufc":           "leeds",
  // La Liga
  "real":           "real madrid",       "madrid":         "real madrid",
  "barca":          "barcelona",         "barça":          "barcelona",
  "atletico":       "atletico madrid",   "atleti":         "atletico madrid",
  "betis":          "real betis",        "sociedad":       "real sociedad",
  "athletic":       "athletic bilbao",   "bilbao":         "athletic bilbao",
  "celta":          "celta de vigo",     "rayo":           "rayo vallecano",
  // Bundesliga
  "bayern":         "bayern munich",     "bvb":            "borussia dortmund",
  "dortmund":       "borussia dortmund", "leverkusen":     "bayer leverkusen",
  "bayer":          "bayer leverkusen",  "gladbach":       "monchengladbach",
  "leipzig":        "rb leipzig",        "werder":         "werder bremen",
  "bremen":         "werder bremen",     "frankfurt":      "eintracht frankfurt",
  "koln":           "cologne",           "köln":           "cologne",
  "cologne":        "cologne",           "hsv":            "hamburger",
  "union":          "union berlin",
  // Ligue 1
  "psg":            "paris saint-germain", "paris":        "paris saint-germain",
  "om":             "marseille",          "ol":            "olympique lyon",
  "lyon":           "olympique lyon",     "monaco":        "monaco",
  "lens":           "racing club de lens","rennes":        "rennais",
  // Serie A
  "juve":           "juventus",           "inter":         "inter milano",
  "inter milan":    "inter milano",       "milan":         "ac milan",
  "napoli":         "napoli",             "roma":          "as roma",
  "lazio":          "lazio",              "atalanta":      "atalanta",
};

const LEAGUES = [
  "epl","la_liga","bundesliga","ligue_1","serie_a",
  "champions_league","europa_league","conference_league",
];

const LEAGUE_LABELS = {
  epl:               "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League",
  la_liga:           "🇪🇸 La Liga",
  bundesliga:        "🇩🇪 Bundesliga",
  ligue_1:           "🇫🇷 Ligue 1",
  serie_a:           "🇮🇹 Serie A",
  champions_league:  "⭐ Champions League",
  europa_league:     "🟠 Europa League",
  conference_league: "🟢 Conference League",
};

// ───────────────────────────────────────────────────────────────
//  AUTO RESULT CHECKER (core) — polls 1hr50 after kick-off, 5min retries, max 36. /final = MOD override.
// ─────────────────────────────────────────────────────────────── (scheduleResultCheck, parseSportradar)
const { createResultChecker, parseSportradar } = require("../core/result_checker.js");

async function _fetchFinalScore(srMatchId, fixture) {
  // TO ACTIVATE: add SPORTRADAR_KEY to .env, uncomment below, remove return null
  // try {
  //   const res = await fetch(
  //     `https://api.sportradar.com/soccer/trial/v4/en/sport_events/${srMatchId}/summary.json` +
  //     `?api_key=${process.env.SPORTRADAR_KEY}`
  //   );
  //   const data = await res.json();
  //   return parseSportradar(data, fixture);
  // } catch (e) { console.error("[ResultChecker] Fetch error:", e.message); return null; }
  return null;
}

const { scheduleResultCheck } = createResultChecker({
  db,
  getPredictionsForFixture: (fixtureId) => predStore.values().filter((p) => sameFixture(p.fixture, fixtureId)),
  fetchFinalScore: _fetchFinalScore,
  EmbedBuilder,
  color: BOT_COLOUR,
  footer: BOT_FOOTER,
  onResultsPosted(fixture, result, entries) {
    const scorersStr = Array.isArray(result.scorers) ? result.scorers.join(", ") : (result.scorers || "");
    awardPointsForFixture(fixture.id, result.evertonGoals, result.opponentGoals, scorersStr);
    storeFixtureResult(fixture.id, result.evertonGoals, result.opponentGoals, scorersStr || null);
  },
});

// ───────────────────────────────────────────────────────────────
//  !score COMMAND
// ───────────────────────────────────────────────────────────────

async function handleScoreCommand(message) {
  const parts = message.content.trim().split(/\s+/);
  if (parts.length < 2) {
    await message.reply("Please provide a team name. Example: `!score Everton`");
    return;
  }

  const query      = parts.slice(1).join(" ").toLowerCase().trim();
  const searchTerm = TEAM_ALIASES[query] ?? query;

  // Search all 8 leagues concurrently
  const results = await Promise.all(LEAGUES.map((l) => _fetchLeagueScores(l)));

  const live = [], finals = [], upcoming = [];

  for (let i = 0; i < LEAGUES.length; i++) {
    const league = LEAGUES[i];
    for (const game of (results[i] ?? [])) {
      const names   = Object.values(game.teams ?? {}).map((t) => t.name?.toLowerCase() ?? "");
      const matched = names.some((n) => n.includes(searchTerm) || searchTerm.includes(n.split(" ")[0]));
      if (!matched) continue;
      game._league = league;
      if (game.status === "in_progress") live.push(game);
      else if (game.status === "final")   finals.push(game);
      else upcoming.push(game);
    }
  }

  finals.sort((a, b)   => new Date(b.start_time) - new Date(a.start_time));
  upcoming.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const hits = [...live, ...(finals.slice(0, 1)), ...(upcoming.slice(0, 1))];

  if (!hits.length) {
    await message.reply(
      `No match found for **${parts.slice(1).join(" ")}**.\nExamples: \`!score Everton\`, \`!score Juve\`, \`!score PSG\``
    );
    return;
  }

  await message.reply({ embeds: hits.slice(0, 3).map(_buildScoreEmbed) });
}

/**
 * Fetch scores for one league from your sports data source.
 *
 * ─── TO ACTIVATE ───────────────────────────────────────────────
 * Replace stub with real API call. Return array of game objects:
 * [{ id, status, start_time, teams: { ABB: { name } }, score: { ABB: n } }]
 * ───────────────────────────────────────────────────────────────
 */
async function _fetchLeagueScores(league) {
  // const res  = await fetch(`https://your-sports-api/${league}?key=${process.env.SPORTS_KEY}`);
  // const data = await res.json();
  // return data.games ?? [];
  return [];
}

function _buildScoreEmbed(game) {
  const teams     = Object.values(game.teams ?? {});
  const abbrevs   = Object.keys(game.teams ?? {});
  const homeName  = teams[0]?.name ?? "?";
  const awayName  = teams[1]?.name ?? "?";
  const homeScore = game.score?.[abbrevs[0]] ?? 0;
  const awayScore = game.score?.[abbrevs[1]] ?? 0;
  const label     = LEAGUE_LABELS[game._league] ?? game._league;
  let color, title, desc;

  if (game.status === "in_progress") {
    color = 0x00CC44;
    title = `🔴 LIVE — ${homeName} vs ${awayName}`;
    desc  = `**${homeScore} – ${awayScore}**\n\n${label}`;
  } else if (game.status === "final") {
    color = BOT_COLOUR;
    title = `✅ Final — ${homeName} vs ${awayName}`;
    const d = new Date(game.start_time);
    desc  = `**${homeScore} – ${awayScore}**\n\n${label} | 📅 ${isNaN(d) ? game.start_time : d.toUTCString().slice(0, 16)}`;
  } else {
    color = 0x888888;
    title = `🗓 Upcoming — ${homeName} vs ${awayName}`;
    const d = new Date(game.start_time);
    desc  = `⏱ Kick-off: **${isNaN(d) ? game.start_time : d.toUTCString().replace("GMT","UTC")}**\n\n${label}`;
  }

  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setFooter({ text: BOT_FOOTER });
}

// ───────────────────────────────────────────────────────────────
//  SCORERS HELPERS
// ───────────────────────────────────────────────────────────────
function normalizeScorers(str) {
  if (!str?.trim()) return [];
  const tokens = [];
  for (const seg of parseScorerSegmentsRaw(str)) {
    for (const { norm } of expandScorerSegment(seg)) {
      if (norm) tokens.push(norm);
    }
  }
  return tokens.sort();
}

/** Remove common middle interjections so "seamus fucking coleman" matches Séamus Coleman. */
function stripScorerInterjections(s) {
  return String(s)
    .replace(/\b(fucking|fuckin|bloody|damn|dammit|frickin|fricking)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One segment after split (preserves order & duplicates for /final + points). */
function normalizeSingleScorerToken(segment) {
  let s0 = String(segment).trim().toLowerCase();
  if (!s0) return "";
  s0 = stripScorerInterjections(s0);
  if (!s0) return "";
  const aliased = SCORER_ALIASES[s0] || s0;
  return normalizeDiacritics(aliased);
}

/**
 * "Igor Thiago Brace" / "beto brace" → two identical { display, norm } slots.
 * "Name hat trick" / "hattrick" / "hat-trick" / "hatty" → three slots. Suffix is stripped before aliases/diacritics.
 */
function expandScorerSegment(segment) {
  const raw = String(segment).trim();
  if (!raw) return [];
  const hatRe = /^(.+?)\s+(hat[\s-]*trick|hattrick|hatty)$/i;
  const braceRe = /^(.+?)\s+brace$/i;
  let base = raw;
  let count = 1;
  const hatM = raw.match(hatRe);
  if (hatM) {
    base = hatM[1].trim();
    count = 3;
  } else {
    const braceM = raw.match(braceRe);
    if (braceM) {
      base = braceM[1].trim();
      count = 2;
    }
  }
  const norm = normalizeSingleScorerToken(base);
  if (!norm) return [];
  const displayCore = base.trim();
  if (count === 1) return [{ display: raw, norm }];
  return Array.from({ length: count }, () => ({ display: displayCore, norm }));
}

function parseScorerSegmentsRaw(str) {
  if (!str?.trim()) return [];
  return String(str)
    .split(/[,./\n]+/)                                        // period is a valid separator (e.g. "KDH. Igor Thiago Brace")
    .map((s) => s.replace(/^\s*[^:,]+:\s*/, "").trim())      // strip "Everton: " / "Burnley: " prefixes
    .filter(Boolean);
}

/** Ordered goal slots from MOD /final string (e.g. two "Beto" entries = two goals, or one "Beto brace"). */
function parseScorerSlotsOrdered(str) {
  const out = [];
  for (const seg of parseScorerSegmentsRaw(str)) {
    out.push(...expandScorerSegment(seg));
  }
  return out.filter((s) => s.norm);
}

/** Ordered predicted tokens (no sort) for multiset matching. */
function parsePredictedTokensOrdered(str) {
  const out = [];
  for (const seg of parseScorerSegmentsRaw(str)) {
    for (const { norm } of expandScorerSegment(seg)) {
      if (norm) out.push(norm);
    }
  }
  return out;
}

/** Match one predicted normalized token to one actual slot (same rules as set-based match). */
function predictedTokenMatchesSingleActual(predToken, actualNorm) {
  if (!predToken || !actualNorm) return false;
  if (predToken === actualNorm) return true;
  if (predToken.startsWith(actualNorm + " ")) return true; // "branthwaite at the death" vs "branthwaite"
  if (actualNorm.startsWith(predToken)) return true;       // "branthwaite" vs "jarrad branthwaite"
  return false;
}

/** True if this predicted token matches an actual scorer: exact match, or predicted starts with "Actual " (extra words allowed), or actual starts with predicted (surname match). */
function predictedTokenMatchesActual(predToken, actualSet) {
  for (const actual of actualSet) {
    if (predictedTokenMatchesSingleActual(predToken, actual)) return true;
  }
  return false;
}

function scorersMatch(actualStr, predictedStr) {
  const actualSet = new Set(normalizeScorers(actualStr));
  const predicted = normalizeScorers(predictedStr);
  const resolved = predicted.map((pt) => [...actualSet].find((a) => pt === a || pt.startsWith(a + " ") || a.startsWith(pt))).filter(Boolean);
  const uniqueResolved = [...new Set(resolved)];
  return uniqueResolved.length === actualSet.size && [...actualSet].every((a) => uniqueResolved.includes(a));
}

/** True if predicted string has at least one scorer in common with actual (after normalization). Extra words after a name (e.g. "Branthwaite at the death") still match. */
function scorersMatchAtLeastOne(actualStr, predictedStr) {
  if (!actualStr?.trim() || !predictedStr?.trim()) return false;
  const slots = parseScorerSlotsOrdered(actualStr);
  if (!slots.length) return false;
  const predicted = parsePredictedTokensOrdered(predictedStr);
  return predicted.some((pt) => slots.some((slot) => predictedTokenMatchesSingleActual(pt, slot.norm)));
}

function getStoredResult(fixtureId) {
  const row = db.prepare("SELECT evertonGoals, opponentGoals, scorers, yellowCards, redCards, finalisedAt FROM fixture_results WHERE fixtureId = ?").get(fixtureId);
  if (!row) return null;
  return {
    evertonGoals: row.evertonGoals ?? row.evertongoals,
    opponentGoals: row.opponentGoals ?? row.opponentgoals,
    scorers: row.scorers ?? row.SCORERS ?? null,
    yellowCards: row.yellowCards ?? row.yellowcards ?? null,
    redCards: row.redCards ?? row.redcards ?? null,
    finalisedAt: row.finalisedAt ?? row.finalisedat,
  };
}
function storeFixtureResult(fixtureId, evertonGoals, opponentGoals, scorers, yellowCards = null, redCards = null) {
  db.prepare(
    "INSERT OR REPLACE INTO fixture_results (fixtureId, evertonGoals, opponentGoals, scorers, yellowCards, redCards, finalisedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(fixtureId, evertonGoals, opponentGoals, scorers ?? null, yellowCards ?? null, redCards ?? null, new Date().toISOString());
}

function getRandomScorersPlaceholder(opponentName) {
  const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
  const pick    = (arr, n) => shuffle([...arr]).slice(0, n);
  const mins    = () => Math.floor(Math.random() * 90) + 1;
  const evPicks = pick(EVERTON_SQUAD_2025_26, Math.random() > 0.5 ? 1 : 2);
  const evPart  = evPicks.map((p) => `${p.name} ${mins()}'`).join(", ");
  const oppSq   = OPPONENT_SQUADS_2025_26[opponentName];
  const oppPart = oppSq?.length ? `${pick(oppSq, 1)[0]} ${mins()}'` : `${opponentName} ${mins()}'`;
  const out     = `${evPart} / ${oppPart}`;
  return out.length > 100 ? out.slice(0, 97) + "…" : out;
}

// ───────────────────────────────────────────────────────────────
//  FIXTURE HELPERS
// ───────────────────────────────────────────────────────────────
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function isFixtureCompleted(fixture) {
  if (!fixture) return false;
  const kickoffMs = new Date(fixture.kickoffUTC).getTime();
  if (Number.isNaN(kickoffMs)) return false;

  // If /final (or auto result checker) has recorded a result, treat as completed immediately.
  const isFinalised = !!db.prepare("SELECT 1 FROM finalised WHERE fixtureId = ?").get(fixture.id);
  if (isFinalised) return true;

  // Otherwise, treat as completed 48 hours after the listed kickoff time.
  const now = Date.now();
  return now - kickoffMs >= FORTY_EIGHT_HOURS_MS;
}

function getFixtureById(id) { return ALL_FIXTURES.find((f) => f.id === id); }

function getLatestCompletedFixture() {
  const completed = ALL_FIXTURES.filter((f) => isFixtureCompleted(f));
  if (!completed.length) return null;
  return completed.slice().sort((a, b) => new Date(b.kickoffUTC) - new Date(a.kickoffUTC))[0];
}

function getFixtureLabelForFinal(fixture) {
  if (!fixture) return "";
  const base = fixture.label || "";
  if (!isFixtureCompleted(fixture)) return base;
  if (/\bplayed\b/i.test(base)) return base;
  return `${base} (played)`;
}

function getUpcomingFixtures() {
  const now = Date.now();
  return ALL_FIXTURES
    .filter((f) => new Date(f.kickoffUTC).getTime() > now)
    .sort((a, b) => new Date(a.kickoffUTC) - new Date(b.kickoffUTC))
    .slice(0, 5);
}

function getListableFixture() {
  const now = Date.now();
  const upcoming = ALL_FIXTURES
    .filter((f) => new Date(f.kickoffUTC).getTime() > now)
    .sort((a, b) => new Date(a.kickoffUTC) - new Date(b.kickoffUTC));
  const next = upcoming[0] ?? null;
  if (next) {
    const countForNext = predStore.values().filter((p) => sameFixture(p.fixture, next.id)).length;
    if (countForNext > 0) return next;
    // Next fixture has no predictions; show the fixture that has the most predictions (e.g. seeded Burnley).
    const byFixture = {};
    for (const p of predStore.values()) {
      const fid = (p.fixture || "").trim();
      if (fid) byFixture[fid] = (byFixture[fid] || 0) + 1;
    }
    const [fixtureId] = Object.entries(byFixture).sort((a, b) => b[1] - a[1])[0] || [];
    if (fixtureId) return getFixtureById(fixtureId) || next;
  }
  return next;
}

/** Last N fixtures that count as completed (most recent first). */
function getLastCompletedFixtures(n) {
  return ALL_FIXTURES
    .filter((f) => isFixtureCompleted(f))
    .sort((a, b) => new Date(b.kickoffUTC) - new Date(a.kickoffUTC))
    .slice(0, n);
}

// ───────────────────────────────────────────────────────────────
//  POINTS EVALUATION (same as footy_bot: exact 5, result 2, each scorer 1)
// ───────────────────────────────────────────────────────────────
/**
 * How many goal-scorer points (1 pt each): walk actual goals in order; each slot consumes one matching
 * predicted token. Same player twice requires two predictions to earn two points.
 */
function countScorerSlotMatches(predScorersStr, actualScorersStr) {
  const slots = parseScorerSlotsOrdered(actualScorersStr || "");
  if (!slots.length) return 0;
  const remaining = [...parsePredictedTokensOrdered(predScorersStr || "")];
  let n = 0;
  for (const slot of slots) {
    const idx = remaining.findIndex((t) => predictedTokenMatchesSingleActual(t, slot.norm));
    if (idx >= 0) {
      n++;
      remaining.splice(idx, 1);
    }
  }
  return n;
}

function awardPointsForFixture(fixtureId, evertonGoals, opponentGoals, actualScorersStr, actualYellowCards = null, actualRedCards = null) {
  const entries = predStore.values().filter((p) => sameFixture(p.fixture, fixtureId));
  const eStr = String(evertonGoals), oStr = String(opponentGoals);
  for (const pred of entries) {
    const exact = pred.evertonScore === eStr && pred.opponentScore === oStr;
    const correctResult = !exact && sameOutcome(+pred.evertonScore, +pred.opponentScore, evertonGoals, opponentGoals);
    if (exact) {
      awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_EXACT_SCORE, "exact_score");
    } else if (correctResult) {
      awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_CORRECT_RESULT, "correct_result");
    }
    const scorerPts = countScorerSlotMatches(pred.scorers, actualScorersStr);
    for (let s = 0; s < scorerPts; s++) {
      awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_CORRECT_SCORER, `scorer:slot_${s + 1}`);
    }
    if (fixtureId === DERBY_FIXTURE_ID) {
      if (actualYellowCards != null && pred.bonusYellowCards != null && String(pred.bonusYellowCards).trim() === String(actualYellowCards)) {
        awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_CORRECT_BONUS, "bonus:yellow_cards");
      }
      if (actualRedCards != null && pred.bonusRedCards != null && String(pred.bonusRedCards).trim() === String(actualRedCards)) {
        awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_CORRECT_BONUS, "bonus:red_cards");
      }
    }
  }
}

// Need sameOutcome for awardPointsForFixture (from result_checker logic)
function sameOutcome(pEve, pOpp, rEve, rOpp) {
  const dir = (a, b) => (a > b ? "w" : a < b ? "l" : "d");
  return dir(pEve, pOpp) === dir(rEve, rOpp);
}

// ───────────────────────────────────────────────────────────────
//  SLASH COMMAND DEFINITIONS
// ───────────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("predict").setDescription("Submit a score prediction — press Enter, then pick a match from the menu"),
  new SlashCommandBuilder().setName("myprediction").setDescription("View your own predictions (only visible to you)"),
  new SlashCommandBuilder().setName("listpredictions").setDescription("List everyone's predictions for an Everton fixture")
    .addStringOption((o) => o.setName("view").setDescription("Show one fixture or last 2 completed matches").setRequired(false)
      .addChoices(
        { name: "One fixture (default or pick below)", value: "one" },
        { name: "Last 2 completed matches", value: "last2" }
      ))
    .addStringOption((o) => o.setName("fixture").setDescription("Which fixture (when view = one)").setRequired(false)
      .addChoices(...ALL_FIXTURES.map((f) => ({ name: `${f.home} vs ${f.away} (${f.label})`, value: f.id })))),
  new SlashCommandBuilder().setName("fixtures").setDescription("Show the next 5 upcoming Everton fixtures"),
  new SlashCommandBuilder().setName("help")
    .setDescription("Show Blue Frontier Committee commands (only visible to you)"),
  new SlashCommandBuilder().setName("clearprediction").setDescription("Delete one of your predictions")
    .addStringOption((o) => o.setName("fixture").setDescription("Which fixture to clear").setRequired(true)
      .addChoices(...ALL_FIXTURES.map((f) => ({ name: `${f.home} vs ${f.away} (${f.label})`, value: f.id })))),
  new SlashCommandBuilder().setName("final")
    .setDescription("MOD only: Enter final score or view result for a played fixture")
    .addStringOption((o) => {
      const latestCompleted = getLatestCompletedFixture();
      const choices = ALL_FIXTURES
        .filter((f) => !isFixtureCompleted(f) || (latestCompleted && f.id === latestCompleted.id))
        .map((f) => ({
          name: `${f.home} vs ${f.away} (${getFixtureLabelForFinal(f)})`,
          value: f.id,
        }));
      return o
        .setName("fixture")
        .setDescription("Which fixture (must have kicked off)")
        .setRequired(true)
        .addChoices(...choices);
    })
    .addIntegerOption((o) => o.setName("everton").setDescription("Everton's goals (omit to just view stored result)").setRequired(false).setMinValue(0).setMaxValue(20))
    .addIntegerOption((o) => o.setName("opponent").setDescription("Opponent's goals (omit to just view stored result)").setRequired(false).setMinValue(0).setMaxValue(20))
    .addStringOption((o) => o.setName("scorers").setDescription("Actual goal scorers (optional)").setRequired(false))
    .addIntegerOption((o) => o.setName("yellow_cards").setDescription("🟨 Total yellow cards — Merseyside Derby only, awards bonus pts").setRequired(false).setMinValue(0).setMaxValue(20))
    .addIntegerOption((o) => o.setName("red_cards").setDescription("🟥 Total red cards — Merseyside Derby only, awards bonus pts").setRequired(false).setMinValue(0).setMaxValue(10)),
  new SlashCommandBuilder().setName("leaderboard")
    .setDescription("View prediction leaderboard (season or all-time)")
    .addStringOption((o) => o.setName("scope").setDescription("Season or all-time").setRequired(false)
      .addChoices({ name: "Current season", value: "season" }, { name: "All time", value: "alltime" })),
  new SlashCommandBuilder().setName("resetleaderboard")
    .setDescription("[ADMIN] Reset season or all-time points")
    .addStringOption((o) => o.setName("scope").setDescription("What to reset").setRequired(true)
      .addChoices({ name: "Current season only", value: "season" }, { name: "All time (requires confirm)", value: "alltime" })),
].map((c) => c.toJSON());

// ───────────────────────────────────────────────────────────────
//  REGISTER COMMANDS
// ───────────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const clientId        = process.env.CLIENT_ID;
  const testGuildId     = process.env.GUILD_ID;
  const blueFrontierId  = process.env.BLUE_FRONTIER_GUILD_ID;

  // Register only per-guild so users see one set of commands (no global + guild duplicate).
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  if (testGuildId) {
    console.log(
      `[${BOT_NAME}] Registering slash commands for test guild ${testGuildId} (instant update)...`
    );
    await rest.put(Routes.applicationGuildCommands(clientId, testGuildId), { body: commands });
    console.log(
      `[${BOT_NAME}] ✅ Slash commands registered for test guild ${testGuildId}.`
    );
  }

  if (blueFrontierId) {
    console.log(
      `[${BOT_NAME}] Registering slash commands for Blue Frontier guild ${blueFrontierId} (instant update)...`
    );
    await rest.put(Routes.applicationGuildCommands(clientId, blueFrontierId), { body: commands });
    console.log(
      `[${BOT_NAME}] ✅ Slash commands registered for Blue Frontier guild ${blueFrontierId}.`
    );
  }
}

// ───────────────────────────────────────────────────────────────
//  DISPLAY NAME HELPER
// ───────────────────────────────────────────────────────────────
async function getDisplayName(guild, userId, fallback) {
  try { return (await guild.members.fetch(userId)).displayName; }
  catch { return fallback || `User ${userId}`; }
}

// ───────────────────────────────────────────────────────────────
//  EMBED BUILDERS
// ───────────────────────────────────────────────────────────────
function buildPredictionEmbed(pred, displayName) {
  const f        = getFixtureById(pred.fixture);
  const scoreStr = f.evertonHome
    ? `Everton **${pred.evertonScore}** – **${pred.opponentScore}** ${f.opponent}`
    : `${f.opponent} **${pred.opponentScore}** – **${pred.evertonScore}** Everton`;
  const embed = new EmbedBuilder().setColor(BOT_COLOUR).setTitle("🔵 Match Prediction")
    .setDescription(`**${f.home} vs ${f.away}**\n📅 ${f.label}`)
    .addFields(
      { name: "👤 Member",          value: displayName || pred.displayName, inline: true },
      { name: "📊 Predicted Score", value: scoreStr,                         inline: true },
      { name: "⚽ Goal Scorers",    value: pred.scorers || "_None entered_", inline: false }
    );
  if (pred.fixture === DERBY_FIXTURE_ID) {
    const yellowVal = pred.bonusYellowCards != null ? pred.bonusYellowCards : "_Not entered_";
    const redVal    = pred.bonusRedCards    != null ? pred.bonusRedCards    : "_Not entered_";
    embed.addFields({ name: "🟨 Yellow cards  🟥 Red cards", value: `Yellow: **${yellowVal}**　Red: **${redVal}**`, inline: false });
  }
  return embed.setFooter({ text: BOT_FOOTER }).setTimestamp(new Date(pred.submittedAt));
}

function buildFixturesEmbed(fixtures) {
  const rows = fixtures.map((f, i) => {
    const matchup = f.evertonHome ? `Everton vs ${f.opponent}` : `${f.opponent} vs Everton`;
    return `**${i + 1}.** ${matchup}\n　📅 ${f.label}`;
  });
  return new EmbedBuilder().setColor(BOT_COLOUR).setTitle("📅 Next 5 Everton Fixtures")
    .setDescription(rows.join("\n\n") || "_No upcoming fixtures found._")
    .setFooter({ text: BOT_FOOTER }).setTimestamp();
}

async function buildListEmbed(fixture, guild) {
  const entries = predStore.values().filter((p) => sameFixture(p.fixture, fixture.id));
  const embed   = new EmbedBuilder().setColor(BOT_COLOUR)
    .setTitle(`📋 Predictions — ${fixture.home} vs ${fixture.away}`)
    .setDescription(`📅 ${fixture.label}`)
    .setFooter({ text: BOT_FOOTER }).setTimestamp();

  if (!entries.length) {
    embed.addFields({ name: "No predictions yet", value: "_Be the first — use `/predict`!_" });
    return embed;
  }

  const isDerby = fixture.id === DERBY_FIXTURE_ID;
  const rows = await Promise.all(entries.map(async (pred) => {
    const name  = await getDisplayName(guild, pred.userId, pred.displayName);
    const score = fixture.evertonHome
      ? `Everton ${pred.evertonScore}–${pred.opponentScore} ${fixture.opponent}`
      : `${fixture.opponent} ${pred.opponentScore}–${pred.evertonScore} Everton`;
    let line = `**${name}** — ${score}${pred.scorers ? `\n　⚽ _${pred.scorers}_` : ""}`;
    if (isDerby) {
      const y = pred.bonusYellowCards != null ? pred.bonusYellowCards : "—";
      const r = pred.bonusRedCards    != null ? pred.bonusRedCards    : "—";
      line += `\n　🟨 ${y} yellows  🟥 ${r} reds`;
    }
    return line;
  }));

  let buffer = "", isFirst = true;
  for (const row of rows) {
    const candidate = buffer ? `${buffer}\n${row}` : row;
    if (candidate.length > 1000) {
      embed.addFields({ name: isFirst ? `${entries.length} prediction(s)` : "​", value: buffer.trim() });
      buffer = row; isFirst = false;
    } else { buffer = candidate; }
  }
  if (buffer) embed.addFields({ name: isFirst ? `${entries.length} prediction(s)` : "​", value: buffer.trim() });
  return embed;
}

/**
 * One line per actual goal (order preserved; duplicate names = separate goals).
 * Users listed under each scorer they matched; same user on multiple lines if they predicted multiple correctly.
 * Greedy consumption matches scorer points (countScorerSlotMatches).
 */
async function buildAtLeastOneScorerBreakdownLines(actualScorersStr, entries, guild) {
  const slots = parseScorerSlotsOrdered(actualScorersStr);
  if (!slots.length) return null;
  const eligible = entries.filter((p) => p.scorers?.trim() && scorersMatchAtLeastOne(actualScorersStr, p.scorers));
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) =>
    (a.displayName || "").localeCompare(b.displayName || "", undefined, { sensitivity: "base" })
  );
  const bags = new Map(sorted.map((p) => [p.userId, [...parsePredictedTokensOrdered(p.scorers)]]));
  const lines = [];
  for (const slot of slots) {
    const names = [];
    for (const p of sorted) {
      const rem = bags.get(p.userId);
      if (!rem?.length) continue;
      const idx = rem.findIndex((t) => predictedTokenMatchesSingleActual(t, slot.norm));
      if (idx >= 0) {
        rem.splice(idx, 1);
        names.push(await getDisplayName(guild, p.userId, p.displayName));
      }
    }
    lines.push(`**${slot.display}** - ${names.length ? names.join(", ") : "*none*"}`);
  }
  return lines;
}

const FINAL_SCORER_FIELD_MAX = 1000;

function appendScorerBreakdownEmbedFields(embed, lines) {
  if (!lines?.length) return;
  let chunk = "";
  let part = 0;
  const title = (i) => (i === 0 ? "✅ At least one correct goal scorer" : "✅ At least one correct goal scorer (cont.)");
  const flush = () => {
    if (!chunk) return;
    const v = chunk.length > FINAL_SCORER_FIELD_MAX ? `${chunk.slice(0, FINAL_SCORER_FIELD_MAX - 1)}…` : chunk;
    embed.addFields({ name: title(part), value: v, inline: false });
    part++;
    chunk = "";
  };
  for (const line of lines) {
    const next = chunk ? `${chunk}\n${line}` : line;
    if (next.length > FINAL_SCORER_FIELD_MAX) {
      flush();
      chunk = line.length > FINAL_SCORER_FIELD_MAX ? `${line.slice(0, FINAL_SCORER_FIELD_MAX - 1)}…` : line;
    } else {
      chunk = next;
    }
  }
  flush();
}

/** Build the final-score embed for a fixture (used when entering result or viewing stored result). */
async function buildFinalResultEmbed(fixture, everton, opponent, actualScorers, guild, yellowCards = null, redCards = null) {
  const fixtureId   = fixture.id;
  const entries    = predStore.values().filter((p) => sameFixture(p.fixture, fixtureId));
  const eStr       = String(everton), oStr = String(opponent);
  const correctAll = entries.filter((p) => p.evertonScore === eStr && p.opponentScore === oStr);
  const withScorers= actualScorers ? correctAll.filter((p) => p.scorers?.trim() && scorersMatch(actualScorers, p.scorers)) : [];
  const scoreOnly  = correctAll.filter((p) => !withScorers.includes(p));
  const scoreLine = fixture.evertonHome
    ? `Everton **${everton}** – **${opponent}** ${fixture.opponent}`
    : `${fixture.opponent} **${opponent}** – **${everton}** Everton`;

  let descExtra = "";
  if (fixtureId === DERBY_FIXTURE_ID) {
    const yDisplay = yellowCards != null ? `**${yellowCards}**` : "_not entered_";
    const rDisplay = redCards    != null ? `**${redCards}**`    : "_not entered_";
    descExtra = `\n\n🟨 Yellow cards: ${yDisplay}　🟥 Red cards: ${rDisplay}`;
  }

  const embed = new EmbedBuilder().setColor(BOT_COLOUR)
    .setTitle(`🏁 Final Score — ${fixture.home} vs ${fixture.away}`)
    .setDescription(`📅 ${fixture.label}\n\n**${scoreLine}**${actualScorers ? `\n\n⚽ _Actual scorers:_ ${actualScorers}` : ""}${descExtra}`)
    .setFooter({ text: `${BOT_FOOTER} • Entered by MOD` }).setTimestamp();
  const nWith = await Promise.all(withScorers.map((p) => getDisplayName(guild, p.userId, p.displayName)));
  const nOnly = await Promise.all(scoreOnly.map((p) => getDisplayName(guild, p.userId, p.displayName)));
  embed.addFields(
    { name: "✅ Correct score + goal scorers", value: nWith.length ? nWith.join(", ") : "_None_", inline: false },
    { name: "✅ Correct score only", value: nOnly.length ? nOnly.join(", ") : "_None_", inline: false }
  );
  if (actualScorers) {
    const breakdown = await buildAtLeastOneScorerBreakdownLines(actualScorers, entries, guild);
    if (breakdown?.length) appendScorerBreakdownEmbedFields(embed, breakdown);
    else embed.addFields({ name: "✅ At least one correct goal scorer", value: "_None_", inline: false });
  }
  if (fixtureId === DERBY_FIXTURE_ID) {
    if (yellowCards != null) {
      const yCorrect = entries.filter((p) => p.bonusYellowCards != null && String(p.bonusYellowCards).trim() === String(yellowCards));
      const yNames   = await Promise.all(yCorrect.map((p) => getDisplayName(guild, p.userId, p.displayName)));
      embed.addFields({ name: "🟨 Correct yellow card count (bonus 1pt)", value: yNames.length ? yNames.join(", ") : "_None_", inline: false });
    }
    if (redCards != null) {
      const rCorrect = entries.filter((p) => p.bonusRedCards != null && String(p.bonusRedCards).trim() === String(redCards));
      const rNames   = await Promise.all(rCorrect.map((p) => getDisplayName(guild, p.userId, p.displayName)));
      embed.addFields({ name: "🟥 Correct red card count (bonus 1pt)", value: rNames.length ? rNames.join(", ") : "_None_", inline: false });
    }
  }
  return embed;
}

// ───────────────────────────────────────────────────────────────
//  CLIENT
// ───────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,  // needed for !score
    GatewayIntentBits.MessageContent, // needed to read message content
  ],
});

function getResultsChannelId() {
  return process.env.RESULTS_CHANNEL_ID?.trim()
      || process.env.PREDICTIONS_CHANNEL_ID?.trim()
      || null;
}

/** Score-predictions channel: where /predict and kickoff lock posts go. */
function getPredictionsChannelId() {
  return process.env.PREDICTIONS_CHANNEL_ID?.trim()
      || process.env.RESULTS_CHANNEL_ID?.trim()
      || null;
}

// ── At kickoff: post "Predictions locked for Everton v [Opponent]!" + list of predictions (in score-predictions channel)
function kickoffLockAlreadyPosted(fixtureId) {
  return !!db.prepare("SELECT 1 FROM kickoff_lock_posted WHERE fixtureId = ?").get(fixtureId);
}
function markKickoffLockPosted(fixtureId) {
  db.prepare("INSERT OR REPLACE INTO kickoff_lock_posted (fixtureId, postedAt) VALUES (?, ?)").run(fixtureId, new Date().toISOString());
}

async function postKickoffLockMessage(fixture, botClient, channelId) {
  if (kickoffLockAlreadyPosted(fixture.id)) {
    console.log(`[${BOT_NAME}] Kickoff lock already posted for ${fixture.id}, skipping.`);
    return;
  }
  const channel = botClient.channels?.cache?.get(channelId);
  if (!channel) {
    console.warn(`[${BOT_NAME}] Kickoff lock: channel ${channelId} not found.`);
    return;
  }
  const guild = channel.guild;
  const lockLine = `🔒 **Predictions locked for Everton v ${fixture.opponent}!**`;
  const embed = await buildListEmbed(fixture, guild);
  try {
    await channel.send({ content: lockLine, embeds: [embed] });
    markKickoffLockPosted(fixture.id);
    console.log(`[${BOT_NAME}] Posted kickoff lock for ${fixture.id} (${fixture.home} vs ${fixture.away}).`);
  } catch (err) {
    console.error(`[${BOT_NAME}] Kickoff lock post failed for ${fixture.id}:`, err?.message || err);
  }
}

function scheduleKickoffLockPost(fixture, botClient, channelId) {
  const kickoffMs = new Date(fixture.kickoffUTC).getTime();
  const now = Date.now();
  const delayMs = kickoffMs - now;
  if (delayMs <= 0) return;
  setTimeout(() => {
    postKickoffLockMessage(fixture, botClient, channelId).catch((e) =>
      console.error(`[${BOT_NAME}] Kickoff lock error for ${fixture.id}:`, e)
    );
  }, delayMs);
  console.log(`[${BOT_NAME}] Scheduled kickoff lock for ${fixture.id} in ${Math.round(delayMs / 60000)} min.`);
}

// Optional: restrict score-prediction commands to specific channels in The Blue Frontier server only.
// BLUE_FRONTIER_GUILD_ID = that server's ID; ALLOWED_PREDICTION_CHANNEL_IDS = comma-separated channel IDs there.
// MODs can also run all commands in mod-chat and mod-bot-logs.
const BLUE_FRONTIER_GUILD_ID = process.env.BLUE_FRONTIER_GUILD_ID?.trim() || null;
const ALLOWED_PREDICTION_CHANNEL_IDS = new Set(
  (process.env.ALLOWED_PREDICTION_CHANNEL_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)
);
const MOD_ALLOWED_CHANNEL_IDS = new Set([
  "1306020728847466598",  // mod-chat
  "1334604409643991212",  // mod-bot-logs
]);
async function isAllowedPredictionChannelAsync(interaction) {
  const { channelId, guildId } = interaction;
  if (!channelId) return true;
  if (!BLUE_FRONTIER_GUILD_ID || guildId !== BLUE_FRONTIER_GUILD_ID) return true;
  if (ALLOWED_PREDICTION_CHANNEL_IDS.size === 0) return true;
  if (ALLOWED_PREDICTION_CHANNEL_IDS.has(channelId)) return true;
  if (MOD_ALLOWED_CHANNEL_IDS.has(channelId)) {
    const modRoleId = getModRoleIdForGuild(guildId);
    if (!modRoleId) return false;
    try {
      return (await interaction.guild.members.fetch(interaction.user.id)).roles.cache.has(modRoleId);
    } catch {
      return interaction.member?.roles?.cache?.has(modRoleId) ?? false;
    }
  }
  return false;
}
const PREDICTION_CHANNEL_MSG = "Score prediction commands are only allowed in the score-predictions channel (or mod-chat / mod-bot-logs for MODs).";

// Predict flow logging — grep logs for [predict] to troubleshoot "command not working" reports
function logPredict(step, interaction, extra = {}) {
  const ctx = {
    step,
    username: interaction?.user?.username ?? "?",
    userId: interaction?.user?.id ?? "?",
    guildId: interaction?.guildId ?? "?",
    channelId: interaction?.channelId ?? "?",
    ...extra,
  };
  console.log(`[predict] ${JSON.stringify(ctx)}`);
}
function logPredictError(step, interaction, err, extra = {}) {
  const ctx = {
    step,
    reason: "system_error",
    error: err?.message ?? String(err),
    username: interaction?.user?.username ?? "?",
    userId: interaction?.user?.id ?? "?",
    guildId: interaction?.guildId ?? "?",
    channelId: interaction?.channelId ?? "?",
    ...extra,
  };
  console.error(`[predict] ERROR ${JSON.stringify(ctx)}`);
  if (err?.stack) console.error(`[predict] stack: ${err.stack}`);
}

// MOD role: use BLUE_FRONTIER_MOD_ROLE_ID when in Blue Frontier server, else MOD_ROLE_ID (e.g. test server).
function getModRoleIdForGuild(guildId) {
  if (BLUE_FRONTIER_GUILD_ID && guildId === BLUE_FRONTIER_GUILD_ID) {
    const id = process.env.BLUE_FRONTIER_MOD_ROLE_ID?.trim();
    if (id) return id;
  }
  return process.env.MOD_ROLE_ID?.trim() || null;
}

let wasDisconnected = false;

client.on("disconnect", () => {
  wasDisconnected = true;
  console.log(`[${BOT_NAME}] ⚠️ Lost connection — reconnecting...`);
});

client.on("clientReady", () => {
  if (wasDisconnected) { wasDisconnected = false; console.log(`[${BOT_NAME}] ✅ Reconnected!`); }
  else console.log(`[${BOT_NAME}] ✅ Online as ${client.user.tag}`);

  // On startup: re-schedule auto-checkers for any kicked-off, not-yet-finalised fixtures
  const resultsChannelId = getResultsChannelId();
  const predictionsChannelId = getPredictionsChannelId();
  const now = Date.now();
  const kickoffCatchUpFixtures = [];
  for (const fixture of ALL_FIXTURES) {
    if (new Date(fixture.kickoffUTC).getTime() <= now) {
      if (resultsChannelId) scheduleResultCheck(fixture, client, resultsChannelId);
      if (predictionsChannelId && !kickoffLockAlreadyPosted(fixture.id)) kickoffCatchUpFixtures.push(fixture);
    } else {
      if (predictionsChannelId) scheduleKickoffLockPost(fixture, client, predictionsChannelId);
    }
  }
  if (kickoffCatchUpFixtures.length && predictionsChannelId) {
    setTimeout(() => {
      for (const fixture of kickoffCatchUpFixtures) {
        postKickoffLockMessage(fixture, client, predictionsChannelId).catch((e) =>
          console.error(`[${BOT_NAME}] Kickoff lock catch-up error for ${fixture.id}:`, e)
        );
      }
    }, 5000);
    console.log(`[${BOT_NAME}] Kickoff lock catch-up: ${kickoffCatchUpFixtures.length} fixture(s) (post in 5s).`);
  }
  if (!resultsChannelId && !process.env.DOTENV_CONFIG_PATH) {
    console.warn(`[${BOT_NAME}] ⚠️ No RESULTS_CHANNEL_ID / PREDICTIONS_CHANNEL_ID in .env — auto result checker disabled.`);
  }
});

// ── !score ────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content.toLowerCase().startsWith("!score")) {
    await handleScoreCommand(message);
  }
});

// ── Slash commands ────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {

  if (interaction.isChatInputCommand() && interaction.commandName === "fixtures") {
    const upcoming = getUpcomingFixtures();
    if (!upcoming.length) {
      return interaction.reply({ content: "😔 No upcoming Everton fixtures found!", flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [buildFixturesEmbed(upcoming)] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "help") {
    if (interaction.replied || interaction.deferred) {
      return;
    }
    const isBlueFrontierGuild = BLUE_FRONTIER_GUILD_ID && interaction.guildId === BLUE_FRONTIER_GUILD_ID;
    const descLines = [
      "**/fixtures** — show the next 5 Everton matches.",
      "**/predict** — submit a score prediction (Everton vs opponent).",
      "**/myprediction** — view your own predictions (only you can see).",
      "**/listpredictions** — list predictions (one fixture, or last 2 completed matches).",
      "**/clearprediction** — delete one of your predictions.",
      "**/final** — MOD only; enter final score + scorers to award points.",
      "**/leaderboard [scope]** — view current-season or all-time points.",
      "**/resetleaderboard [scope]** — MOD only; reset season or all-time (all-time asks for confirm).",
      "",
      isBlueFrontierGuild
        ? "In this server, prediction commands work in the score-predictions channel (or mod-chat / mod-bot-logs for MODs)."
        : "In this server, prediction commands work in any channel."
    ];
    const embed = new EmbedBuilder()
      .setColor(BOT_COLOUR)
      .setTitle("🔵 The Blue Frontier Committee — Help")
      .setDescription(descLines.join("\n"))
      .setFooter({ text: BOT_FOOTER })
      .setTimestamp();
    try {
      return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      // If Discord reports that the interaction was already acknowledged, just log and ignore.
      if (err?.code === 40060) {
        console.warn(`[${BOT_NAME}] Help command: interaction already acknowledged (code 40060), ignoring.`);
        return;
      }
      throw err;
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "predict") {
    try {
      logPredict("predict_cmd", interaction, { upcomingCount: getUpcomingFixtures().length });
      if (!(await isAllowedPredictionChannelAsync(interaction))) {
        logPredict("predict_cmd_blocked_channel", interaction, { reason: "user_error", detail: "channel_not_allowed" });
        return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
      }
      const upcoming = getUpcomingFixtures();
      if (!upcoming.length) {
        logPredict("predict_cmd_no_fixtures", interaction, { reason: "user_error", detail: "no_upcoming_fixtures" });
        return interaction.reply({ content: "😔 No upcoming fixtures to predict right now!", flags: MessageFlags.Ephemeral });
      }
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("tbfc_select_fixture")
          .setPlaceholder("Click here to choose a match…")
          .addOptions(upcoming.map((f) => ({ label: `${f.home} vs ${f.away}`, description: f.label, value: f.id })))
      );
      await interaction.reply({
        content: `## 🔵 ${BOT_NAME} — Score Predictor\nWhich fixture do you want to predict?\n\n_↓ **Click the menu below** to pick a match → a form will open for score + optional scorers._`,
        components: [row], flags: MessageFlags.Ephemeral,
      });
      logPredict("predict_cmd_ok", interaction, { optionCount: upcoming.length });
    } catch (err) {
      logPredictError("predict_cmd", interaction, err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Something went wrong showing the predictor. Please try `/predict` again.", flags: MessageFlags.Ephemeral });
        }
      } catch (_) { /* already replied or expired */ }
    }
    return;
  }

  // Helper: build the score-prediction modal for a fixture (used by select and by confirm-replace button).
  function buildScoreModal(fixtureId) {
    const f = getFixtureById(fixtureId);
    if (!f) return null;
    const modal = new ModalBuilder().setCustomId(`tbfc_score_modal_${fixtureId}`).setTitle(`${f.home} vs ${f.away}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("everton_score").setLabel("Everton — how many goals?")
          .setStyle(TextInputStyle.Short).setPlaceholder("e.g. 2").setMinLength(1).setMaxLength(2).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("opponent_score").setLabel(`${f.opponent} — how many goals?`)
          .setStyle(TextInputStyle.Short).setPlaceholder("e.g. 1").setMinLength(1).setMaxLength(2).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("scorers").setLabel("Goal scorers (optional)")
          .setStyle(TextInputStyle.Paragraph).setPlaceholder(`e.g. ${getRandomScorersPlaceholder(f.opponent)}`).setRequired(false)
      )
    );
    if (fixtureId === DERBY_FIXTURE_ID) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("bonus_yellow_cards")
            .setLabel("🟨 Bonus: How many yellow cards? (1pt)")
            .setStyle(TextInputStyle.Short).setPlaceholder("e.g. 4")
            .setRequired(false).setMinLength(1).setMaxLength(2)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("bonus_red_cards")
            .setLabel("🟥 Bonus: How many red cards? (1pt)")
            .setStyle(TextInputStyle.Short).setPlaceholder("e.g. 0")
            .setRequired(false).setMinLength(1).setMaxLength(2)
        )
      );
    }
    return modal;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "tbfc_select_fixture") {
    try {
      const fixtureId = interaction.values?.[0];
      logPredict("predict_select", interaction, { fixtureId });
      if (!(await isAllowedPredictionChannelAsync(interaction))) {
        logPredict("predict_select_blocked_channel", interaction, { fixtureId, reason: "user_error", detail: "channel_not_allowed" });
        return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
      }
      const f = getFixtureById(fixtureId);
      if (!f || new Date(f.kickoffUTC).getTime() <= Date.now()) {
        logPredict("predict_select_fixture_expired", interaction, { fixtureId, reason: "user_error", detail: "fixture_expired" });
        return interaction.update({ content: "⚠️ That fixture has already kicked off. Run `/predict` again.", components: [] });
      }
      const key = `${interaction.user.id}_${fixtureId}`;
      const existing = predStore.get(key);
      if (existing) {
        let displayName = interaction.user.globalName || interaction.user.username;
        try { displayName = (await interaction.guild.members.fetch(interaction.user.id)).displayName; } catch {}
        const embed = buildPredictionEmbed(existing, displayName).setTitle("⚠️ You already have a prediction for this match");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`tbfc_confirm_replace_${fixtureId}`).setLabel("Replace with new prediction").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("tbfc_keep_prediction").setLabel("Keep current").setStyle(ButtonStyle.Secondary)
        );
        await interaction.update({
          content: "You already have a prediction for this match. Your current prediction is below. Choose **Replace with new prediction** to enter a different one, or **Keep current** to leave it as is.",
          embeds: [embed],
          components: [row],
        });
        logPredict("predict_select_existing", interaction, { fixtureId });
        return;
      }
      const modal = buildScoreModal(fixtureId);
      if (!modal) {
        return interaction.update({ content: "Something went wrong finding that fixture. Try `/predict` again.", components: [] });
      }
      await interaction.showModal(modal);
      logPredict("predict_select_ok", interaction, { fixtureId });
    } catch (err) {
      logPredictError("predict_select", interaction, err, { fixtureId: interaction.values?.[0] });
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Something went wrong opening the form. Please try `/predict` again.", flags: MessageFlags.Ephemeral });
        } else {
          await interaction.update({ content: "Something went wrong. Please try `/predict` again.", components: [] }).catch(() => {});
        }
      } catch (_) { /* already replied or expired */ }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "tbfc_keep_prediction") {
    await interaction.update({ content: "No changes made. Your existing prediction is unchanged.", embeds: [], components: [] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("tbfc_confirm_replace_")) {
    const fixtureId = interaction.customId.replace("tbfc_confirm_replace_", "");
    try {
      if (!(await isAllowedPredictionChannelAsync(interaction))) {
        return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
      }
      const f = getFixtureById(fixtureId);
      if (!f || new Date(f.kickoffUTC).getTime() <= Date.now()) {
        return interaction.update({ content: "⚠️ That fixture has already kicked off. Run `/predict` again.", embeds: [], components: [] });
      }
      const modal = buildScoreModal(fixtureId);
      if (!modal) {
        return interaction.update({ content: "Something went wrong. Try `/predict` again.", embeds: [], components: [] });
      }
      await interaction.showModal(modal);
      logPredict("predict_confirm_replace_modal", interaction, { fixtureId });
    } catch (err) {
      logPredictError("predict_confirm_replace", interaction, err, { fixtureId });
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Something went wrong. Please try `/predict` again.", flags: MessageFlags.Ephemeral });
        } else {
          await interaction.update({ content: "Something went wrong. Please try `/predict` again.", embeds: [], components: [] }).catch(() => {});
        }
      } catch (_) {}
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("tbfc_score_modal_")) {
    const fixtureId = interaction.customId.replace("tbfc_score_modal_", "");
    try {
      logPredict("predict_modal", interaction, { fixtureId });
      if (!(await isAllowedPredictionChannelAsync(interaction))) {
        logPredict("predict_modal_blocked_channel", interaction, { fixtureId, reason: "user_error", detail: "channel_not_allowed" });
        return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
      }
      const evertonScore  = interaction.fields.getTextInputValue("everton_score").trim();
      const opponentScore = interaction.fields.getTextInputValue("opponent_score").trim();
      const scorers       = interaction.fields.getTextInputValue("scorers").trim();

      let bonusYellowCards = null;
      let bonusRedCards    = null;
      if (fixtureId === DERBY_FIXTURE_ID) {
        const rawYellow = interaction.fields.getTextInputValue("bonus_yellow_cards").trim();
        const rawRed    = interaction.fields.getTextInputValue("bonus_red_cards").trim();
        if (rawYellow && !/^\d+$/.test(rawYellow)) {
          return interaction.reply({ content: "❌ Yellow card count must be a whole number. Run `/predict` again.", flags: MessageFlags.Ephemeral });
        }
        if (rawRed && !/^\d+$/.test(rawRed)) {
          return interaction.reply({ content: "❌ Red card count must be a whole number. Run `/predict` again.", flags: MessageFlags.Ephemeral });
        }
        bonusYellowCards = rawYellow || null;
        bonusRedCards    = rawRed    || null;
      }

      if (!/^\d+$/.test(evertonScore) || !/^\d+$/.test(opponentScore)) {
        logPredict("predict_modal_invalid_scores", interaction, { fixtureId, evertonScore, opponentScore, reason: "user_error", detail: "invalid_scores" });
        return interaction.reply({ content: "❌ Scores must be whole numbers. Run `/predict` again.", flags: MessageFlags.Ephemeral });
      }

      let displayName = interaction.user.globalName || interaction.user.username;
      try { displayName = (await interaction.guild.members.fetch(interaction.user.id)).displayName; } catch {}

      const key  = `${interaction.user.id}_${fixtureId}`;
      const pred = { userId: interaction.user.id, displayName, fixture: fixtureId, evertonScore, opponentScore, scorers: scorers || null, bonusYellowCards, bonusRedCards, submittedAt: new Date().toISOString() };
      predStore.set(key, pred);

      // Schedule result check on first prediction for this fixture
      const f = getFixtureById(fixtureId);
      if (f?.srMatchId) {
        const chId = getResultsChannelId();
        if (chId) scheduleResultCheck(f, client, chId);
      }

      await interaction.reply({ content: "✅ **Prediction locked in!**", embeds: [buildPredictionEmbed(pred, displayName)] });
      logPredict("predict_modal_ok", interaction, { fixtureId, key });
    } catch (err) {
      logPredictError("predict_modal", interaction, err, { fixtureId });
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Something went wrong saving your prediction. Please try `/predict` again.", flags: MessageFlags.Ephemeral });
        }
      } catch (_) { /* already replied or expired */ }
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "myprediction") {
    if (!(await isAllowedPredictionChannelAsync(interaction))) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const mine = predStore.values().filter((p) => String(p.userId || "").trim() === String(interaction.user.id).trim());
    if (!mine.length) {
      return interaction.reply({ content: "You haven't made any predictions yet! Use `/predict`.", flags: MessageFlags.Ephemeral });
    }
    let displayName = interaction.user.globalName || interaction.user.username;
    try { displayName = (await interaction.guild.members.fetch(interaction.user.id)).displayName; } catch {}
    return interaction.reply({ content: "## 🔵 Your Predictions", embeds: mine.map((p) => buildPredictionEmbed(p, displayName)), flags: MessageFlags.Ephemeral });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "listpredictions") {
    if (!(await isAllowedPredictionChannelAsync(interaction))) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    const viewOption = interaction.options.getString("view") || "one";

    if (viewOption === "last2") {
      const completed = getLastCompletedFixtures(2);
      if (!completed.length) {
        return interaction.editReply({ content: "No completed matches yet — predictions for past matches will appear here after fixtures have been played." });
      }
      const embeds = await Promise.all(completed.map((f) => buildListEmbed(f, interaction.guild)));
      const content = completed.length === 1
        ? "Only one match has been played so far."
        : "Predictions for the last 2 completed matches.";
      return interaction.editReply({ content, embeds });
    }

    const fixtureIdOption = interaction.options.getString("fixture");
    const fixtureFromOption = fixtureIdOption ? getFixtureById(fixtureIdOption) : null;
    const listableFixture = getListableFixture();
    const modRoleId       = getModRoleIdForGuild(interaction.guildId);
    let hasModRole = false;
    if (modRoleId) {
      try { hasModRole = (await interaction.guild.members.fetch(interaction.user.id)).roles.cache.has(modRoleId); }
      catch { hasModRole = interaction.member?.roles?.cache?.has(modRoleId) ?? false; }
    }
    let fixture = fixtureFromOption ?? listableFixture ?? (hasModRole ? getUpcomingFixtures()[0] ?? null : null);
    if (!fixture) {
      return interaction.editReply({
        content: hasModRole
          ? "No fixtures have kicked off yet and there are no upcoming fixtures."
          : "No fixtures have kicked off yet — predictions will appear here once the first match starts!",
      });
    }
    const embed = await buildListEmbed(fixture, interaction.guild);
    const isUpcoming = fixture && new Date(fixture.kickoffUTC).getTime() > Date.now();
    if (hasModRole && isUpcoming) embed.setDescription(`${embed.data.description || ""}\n\n_👀 MOD view — match has not kicked off yet._`);
    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "final") {
    if (!(await isAllowedPredictionChannelAsync(interaction))) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const modRoleId = getModRoleIdForGuild(interaction.guildId);
    let hasModRole = false;
    if (modRoleId) {
      try { hasModRole = (await interaction.guild.members.fetch(interaction.user.id)).roles.cache.has(modRoleId); }
      catch { hasModRole = interaction.member?.roles?.cache?.has(modRoleId) ?? false; }
    }
    if (!hasModRole) return interaction.reply({ content: "❌ This command is only for MODs.", flags: MessageFlags.Ephemeral });

    const fixtureId     = interaction.options.getString("fixture");
    const everton       = interaction.options.getInteger("everton");
    const opponent      = interaction.options.getInteger("opponent");
    const actualScorers = interaction.options.getString("scorers")?.trim() || null;
    const yellowCards   = interaction.options.getInteger("yellow_cards") ?? null;
    const redCards      = interaction.options.getInteger("red_cards") ?? null;
    const fixture       = getFixtureById(fixtureId);

    if (!fixture) return interaction.reply({ content: "❌ Unknown fixture.", flags: MessageFlags.Ephemeral });
    if (new Date(fixture.kickoffUTC).getTime() > Date.now()) {
      return interaction.reply({ content: "❌ That fixture hasn't kicked off yet.", flags: MessageFlags.Ephemeral });
    }

    const alreadyFinalised = !!db.prepare("SELECT 1 FROM finalised WHERE fixtureId = ?").get(fixtureId);

    if (alreadyFinalised) {
      const stored = getStoredResult(fixtureId);
      if (stored) {
        await interaction.deferReply();
        const embed = await buildFinalResultEmbed(
          fixture, stored.evertonGoals, stored.opponentGoals, stored.scorers, interaction.guild, stored.yellowCards, stored.redCards
        );
        return interaction.editReply({ content: "Result for this fixture (already finalised):", embeds: [embed] });
      }
      return interaction.reply({
        content: "This fixture was finalised but the result wasn't stored (e.g. before this feature was added).",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (everton === null || opponent === null) {
      return interaction.reply({
        content: "That fixture hasn't been finalised yet. Enter Everton and opponent goals to post the result.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();
    db.prepare("INSERT OR IGNORE INTO finalised (fixtureId, finalisedAt) VALUES (?,?)")
      .run(fixtureId, new Date().toISOString());
    const actualScorersStr = actualScorers || "";
    awardPointsForFixture(fixtureId, everton, opponent, actualScorersStr, yellowCards, redCards);
    storeFixtureResult(fixtureId, everton, opponent, actualScorersStr || null, yellowCards, redCards);
    const embed = await buildFinalResultEmbed(fixture, everton, opponent, actualScorers, interaction.guild, yellowCards, redCards);
    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "clearprediction") {
    if (!(await isAllowedPredictionChannelAsync(interaction))) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const fixtureId = interaction.options.getString("fixture");
    const key       = `${interaction.user.id}_${fixtureId}`;
    if (!predStore.has(key)) return interaction.reply({ content: "❌ You don't have a prediction for that fixture.", flags: MessageFlags.Ephemeral });
    predStore.delete(key);
    const f = getFixtureById(fixtureId);
    return interaction.reply({ content: `🗑️ Your prediction for **${f.home} vs ${f.away}** has been removed.`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "leaderboard") {
    const scope = interaction.options.getString("scope") || "season";
    const rows = getLeaderboard(scope === "alltime" ? "alltime" : "season", 15);
    const title = scope === "alltime"
      ? "🏆 Everton predictions — All-time leaderboard"
      : `🏆 Everton predictions — ${_seasonYear()} season`;
    const body = rows.length
      ? rows.map((r, i) => `${i + 1}. **${r.displayName}** — ${r.total_points} pts`).join("\n")
      : "_No points yet. Make predictions and get results with `/final`!_";
    const embed = new EmbedBuilder().setColor(BOT_COLOUR).setTitle(title)
      .setDescription(body)
      .setFooter({ text: `${BOT_FOOTER} • 5pt exact score, 2pt result, 1pt per correct scorer` }).setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "resetleaderboard") {
    const modRoleId = getModRoleIdForGuild(interaction.guildId);
    let hasModRole = false;
    if (modRoleId) {
      try { hasModRole = (await interaction.guild.members.fetch(interaction.user.id)).roles.cache.has(modRoleId); }
      catch { hasModRole = interaction.member?.roles?.cache?.has(modRoleId) ?? false; }
    }
    if (!hasModRole) return interaction.reply({ content: "❌ This command is only for MODs.", flags: MessageFlags.Ephemeral });

    const scope = interaction.options.getString("scope") || "season";
    if (scope === "season") {
      adminResetSeasonPoints();
      return interaction.reply({ content: `✅ **${_seasonYear()}** season points have been reset.`, flags: MessageFlags.Ephemeral });
    }

    // All-time: show confirmation buttons (only the user who ran the command can confirm)
    const userId = interaction.user.id;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tbfc_reset_alltime_confirm:${userId}`).setLabel("Confirm reset all-time").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tbfc_reset_alltime_cancel:${userId}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({
      content: "⚠️ **Reset all-time leaderboard?** This will set everyone’s all-time points to 0 and cannot be undone. Only you can confirm.",
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.isButton() && interaction.customId.startsWith("tbfc_reset_alltime_")) {
    const parts = interaction.customId.split(":");
    const allowedUserId = parts[1];
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({ content: "Only the person who ran `/resetleaderboard` can confirm.", flags: MessageFlags.Ephemeral });
    }
    if (interaction.customId.startsWith("tbfc_reset_alltime_confirm:")) {
      adminResetAllTimePoints();
      return interaction.update({ content: "✅ **All-time points** have been reset to 0.", components: [] });
    }
    return interaction.update({ content: "❌ All-time reset cancelled.", components: [] });
  }
});

// ───────────────────────────────────────────────────────────────
//  GRACEFUL SHUTDOWN
// ───────────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`[${BOT_NAME}] 🛑 ${signal} — shutting down...`);
  db.close();
  client.destroy();
  process.exit(0);
}
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ───────────────────────────────────────────────────────────────
//  START
// ───────────────────────────────────────────────────────────────
function onStartupError(err) {
  console.error(err);
  if (err.code === 0 && err.status === 401) {
    console.error("[Config] 401 Unauthorized: DISCORD_TOKEN is invalid or doesn't match this app's CLIENT_ID. Get a fresh token from Discord Developer Portal → your app → Bot → Reset Token, then update .env (or lab/.env.lab for lab).");
  }
  process.exit(1);
}
registerCommands()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch(onStartupError);
