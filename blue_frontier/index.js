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
require("dotenv").config();
const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

// ───────────────────────────────────────────────────────────────
//  ENV VALIDATION — fail fast with clear message if credentials missing
// ───────────────────────────────────────────────────────────────
const REQUIRED_ENV  = ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"];
const PLACEHOLDERS  = /your_application_client_id_here|your_discord_server_id_here|your_bot_token_here/i;

function validateEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(`[Config] Missing required env: ${missing.join(", ")}`);
    console.error("Add them to .env (see .env.example). Then run: npm start");
    process.exit(1);
  }
  const token    = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId  = process.env.GUILD_ID;
  if (PLACEHOLDERS.test(token + clientId + guildId)) {
    console.error("[Config] .env still contains placeholder values.");
    console.error("Replace with your real Discord bot token, application (client) ID, and server (guild) ID.");
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
//  Predictions survive bot restarts and Railway redeploys.
//  DB file: ./data/predictions.db
// ───────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "predictions.db"));

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

// ── Drop-in replacement for the original in-memory Map ──────────
// All existing commands work identically — they just read from SQLite now.
const predStore = {
  set(key, pred) {
    db.prepare(`
      INSERT OR REPLACE INTO predictions
        (key, userId, displayName, fixture, evertonScore, opponentScore, scorers, submittedAt)
      VALUES
        (@key, @userId, @displayName, @fixture, @evertonScore, @opponentScore, @scorers, @submittedAt)
    `).run({ ...pred, key, scorers: pred.scorers ?? null });
  },
  get(key) {
    return db.prepare("SELECT * FROM predictions WHERE key = ?").get(key) ?? undefined;
  },
  has(key) {
    return !!db.prepare("SELECT 1 FROM predictions WHERE key = ?").get(key);
  },
  delete(key) {
    db.prepare("DELETE FROM predictions WHERE key = ?").run(key);
  },
  values() {
    return db.prepare("SELECT * FROM predictions").all();
  },
};

// ───────────────────────────────────────────────────────────────
//  POINTS (same as footy_bot: 5pt exact, 2pt result, 1pt per scorer)
// ───────────────────────────────────────────────────────────────
const POINTS_EXACT_SCORE   = 5;
const POINTS_CORRECT_RESULT = 2;
const POINTS_CORRECT_SCORER = 1;

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
    id: "fix03", kickoffUTC: "2026-03-03T19:30:00Z", label: "Tue 03 Mar 2:30 PM EST",
    home: "Everton", away: "Burnley", opponent: "Burnley",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix04", kickoffUTC: "2026-03-15T14:00:00Z", label: "Sun 15 Mar 10:00 AM EDT",
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
    id: "fix07", kickoffUTC: "2026-04-18T14:00:00Z", label: "Sat 18 Apr 10:00 AM EDT",
    home: "Everton", away: "Liverpool", opponent: "Liverpool",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix08", kickoffUTC: "2026-04-25T14:00:00Z", label: "Sat 25 Apr 10:00 AM EDT",
    home: "West Ham United", away: "Everton", opponent: "West Ham United",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix09", kickoffUTC: "2026-05-02T14:00:00Z", label: "Sat 02 May 10:00 AM EDT",
    home: "Everton", away: "Manchester City", opponent: "Manchester City",
    evertonHome: true, srMatchId: null,
  },
  {
    id: "fix10", kickoffUTC: "2026-05-09T14:00:00Z", label: "Sat 09 May 10:00 AM EDT",
    home: "Crystal Palace", away: "Everton", opponent: "Crystal Palace",
    evertonHome: false, srMatchId: null,
  },
  {
    id: "fix11", kickoffUTC: "2026-05-16T14:00:00Z", label: "Sat 16 May 10:00 AM EDT",
    home: "Sunderland", away: "Everton", opponent: "Sunderland",
    evertonHome: false, srMatchId: null,
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

// Short-name / nickname aliases for scorer matching — keys and values lowercase.
// Example: "kdh" should count as Kiernan Dewsbury-Hall.
const EVERTON_SCORER_ALIASES = {
  "kdh": "kiernan dewsbury-hall",
};

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
  getPredictionsForFixture: (fixtureId) => predStore.values().filter((p) => p.fixture === fixtureId),
  fetchFinalScore: _fetchFinalScore,
  EmbedBuilder,
  color: BOT_COLOUR,
  footer: BOT_FOOTER,
  onResultsPosted(fixture, result, entries) {
    const scorersStr = Array.isArray(result.scorers) ? result.scorers.join(", ") : (result.scorers || "");
    awardPointsForFixture(fixture.id, result.evertonGoals, result.opponentGoals, scorersStr);
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
  return String(str)
    .split(/[,/\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => EVERTON_SCORER_ALIASES[name] || name)
    .sort();
}

function scorersMatch(actualStr, predictedStr) {
  const a = normalizeScorers(actualStr), b = normalizeScorers(predictedStr);
  return a.length === b.length && a.every((t, i) => t === b[i]);
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
function getFixtureById(id) { return ALL_FIXTURES.find((f) => f.id === id); }

function getUpcomingFixtures() {
  const now = Date.now();
  return ALL_FIXTURES
    .filter((f) => new Date(f.kickoffUTC).getTime() > now)
    .sort((a, b) => new Date(a.kickoffUTC) - new Date(b.kickoffUTC))
    .slice(0, 5);
}

function getListableFixture() {
  const now     = Date.now();
  const started = ALL_FIXTURES
    .filter((f) => new Date(f.kickoffUTC).getTime() <= now)
    .sort((a, b) => new Date(b.kickoffUTC) - new Date(a.kickoffUTC));
  return started[0] ?? null;
}

// ───────────────────────────────────────────────────────────────
//  POINTS EVALUATION (same as footy_bot: exact 5, result 2, each scorer 1)
// ───────────────────────────────────────────────────────────────
function _matchedScorers(predScorersStr, actualScorersStr) {
  const pred = normalizeScorers(predScorersStr || "");
  const real = normalizeScorers(actualScorersStr || "");
  return pred.filter((name) =>
    real.some((r) => name.includes(r) || r.includes(name))
  );
}

function awardPointsForFixture(fixtureId, evertonGoals, opponentGoals, actualScorersStr) {
  const entries = predStore.values().filter((p) => p.fixture === fixtureId);
  const eStr = String(evertonGoals), oStr = String(opponentGoals);
  for (const pred of entries) {
    const exact = pred.evertonScore === eStr && pred.opponentScore === oStr;
    const correctResult = !exact && sameOutcome(+pred.evertonScore, +pred.opponentScore, evertonGoals, opponentGoals);
    if (exact) {
      awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_EXACT_SCORE, "exact_score");
    } else if (correctResult) {
      awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_CORRECT_RESULT, "correct_result");
    }
    const matched = _matchedScorers(pred.scorers, actualScorersStr);
    for (const scorer of matched) {
      awardPoints(pred.userId, pred.displayName, fixtureId, POINTS_CORRECT_SCORER, `scorer:${scorer}`);
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
  new SlashCommandBuilder().setName("predict").setDescription("Submit your score prediction for an upcoming Everton match"),
  new SlashCommandBuilder().setName("myprediction").setDescription("View your own predictions (only visible to you)"),
  new SlashCommandBuilder().setName("listpredictions").setDescription("List everyone's predictions for the current Everton fixture"),
  new SlashCommandBuilder().setName("fixtures").setDescription("Show the next 5 upcoming Everton fixtures"),
  new SlashCommandBuilder().setName("help")
    .setDescription("Show Blue Frontier Committee commands (only visible to you)"),
  new SlashCommandBuilder().setName("clearprediction").setDescription("Delete one of your predictions")
    .addStringOption((o) => o.setName("fixture").setDescription("Which fixture to clear").setRequired(true)
      .addChoices(...ALL_FIXTURES.map((f) => ({ name: `${f.home} vs ${f.away} (${f.label})`, value: f.id })))),
  new SlashCommandBuilder().setName("final")
    .setDescription("MOD only: Enter final score and see correct predictions + goal scorers")
    .addStringOption((o) => o.setName("fixture").setDescription("Which fixture (must have kicked off)").setRequired(true)
      .addChoices(...ALL_FIXTURES.map((f) => ({ name: `${f.home} vs ${f.away} (${f.label})`, value: f.id }))))
    .addIntegerOption((o) => o.setName("everton").setDescription("Everton's final goal count").setRequired(true).setMinValue(0).setMaxValue(20))
    .addIntegerOption((o) => o.setName("opponent").setDescription("Opponent's final goal count").setRequired(true).setMinValue(0).setMaxValue(20))
    .addStringOption((o) => o.setName("scorers").setDescription("Actual goal scorers (optional)").setRequired(false)),
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

  console.log(`[${BOT_NAME}] Registering slash commands (global)...`);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`[${BOT_NAME}] ✅ Global slash commands registered.`);

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
  return new EmbedBuilder().setColor(BOT_COLOUR).setTitle("🔵 Match Prediction")
    .setDescription(`**${f.home} vs ${f.away}**\n📅 ${f.label}`)
    .addFields(
      { name: "👤 Member",          value: displayName || pred.displayName, inline: true },
      { name: "📊 Predicted Score", value: scoreStr,                         inline: true },
      { name: "⚽ Goal Scorers",    value: pred.scorers || "_None entered_", inline: false }
    )
    .setFooter({ text: BOT_FOOTER }).setTimestamp(new Date(pred.submittedAt));
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
  const entries = predStore.values().filter((p) => p.fixture === fixture.id);
  const embed   = new EmbedBuilder().setColor(BOT_COLOUR)
    .setTitle(`📋 Predictions — ${fixture.home} vs ${fixture.away}`)
    .setDescription(`📅 ${fixture.label}`)
    .setFooter({ text: BOT_FOOTER }).setTimestamp();

  if (!entries.length) {
    embed.addFields({ name: "No predictions yet", value: "_Be the first — use `/predict`!_" });
    return embed;
  }

  const rows = await Promise.all(entries.map(async (pred) => {
    const name  = await getDisplayName(guild, pred.userId, pred.displayName);
    const score = fixture.evertonHome
      ? `Everton ${pred.evertonScore}–${pred.opponentScore} ${fixture.opponent}`
      : `${fixture.opponent} ${pred.opponentScore}–${pred.evertonScore} Everton`;
    return `**${name}** — ${score}${pred.scorers ? `\n　⚽ _${pred.scorers}_` : ""}`;
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

// Optional: restrict score-prediction commands to specific channels in The Blue Frontier server only.
// BLUE_FRONTIER_GUILD_ID = that server's ID; ALLOWED_PREDICTION_CHANNEL_IDS = comma-separated channel IDs there.
// In other servers (e.g. test server), prediction commands work in any channel.
const BLUE_FRONTIER_GUILD_ID = process.env.BLUE_FRONTIER_GUILD_ID?.trim() || null;
const ALLOWED_PREDICTION_CHANNEL_IDS = new Set(
  (process.env.ALLOWED_PREDICTION_CHANNEL_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)
);
function isAllowedPredictionChannel(channelId, guildId) {
  if (!channelId) return true;
  if (!BLUE_FRONTIER_GUILD_ID || guildId !== BLUE_FRONTIER_GUILD_ID) return true;
  if (ALLOWED_PREDICTION_CHANNEL_IDS.size === 0) return true;
  return ALLOWED_PREDICTION_CHANNEL_IDS.has(channelId);
}
const PREDICTION_CHANNEL_MSG = "Score prediction commands are only allowed in the score-predictions channel.";

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
  const channelId = getResultsChannelId();
  if (channelId) {
    const now = Date.now();
    for (const fixture of ALL_FIXTURES) {
      if (new Date(fixture.kickoffUTC).getTime() <= now) {
        scheduleResultCheck(fixture, client, channelId);
      }
    }
  } else {
    console.warn(`[${BOT_NAME}] ⚠️ No RESULTS_CHANNEL_ID in .env — auto result checker disabled.`);
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
      "**/listpredictions** — list predictions for the current or last-kicked-off fixture.",
      "**/clearprediction** — delete one of your predictions.",
      "**/final** — MOD only; enter final score + scorers to award points.",
      "**/leaderboard [scope]** — view current-season or all-time points.",
      "**/resetleaderboard [scope]** — MOD only; reset season or all-time (all-time asks for confirm).",
      "",
      isBlueFrontierGuild
        ? "In this server, prediction commands only work in the score-predictions channel."
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
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const upcoming = getUpcomingFixtures();
    if (!upcoming.length) {
      return interaction.reply({ content: "😔 No upcoming fixtures to predict right now!", flags: MessageFlags.Ephemeral });
    }
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("tbfc_select_fixture")
        .setPlaceholder("Click here to choose a match…")
        .addOptions(upcoming.map((f) => ({ label: `${f.home} vs ${f.away}`, description: f.label, value: f.id })))
    );
    return interaction.reply({
      content: `## 🔵 ${BOT_NAME} — Score Predictor\nWhich fixture do you want to predict?\n\n_↓ **Click the menu below** to pick a match → a form will open for score + optional scorers._`,
      components: [row], flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "tbfc_select_fixture") {
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const fixtureId = interaction.values[0];
    const f         = getFixtureById(fixtureId);
    if (!f || new Date(f.kickoffUTC).getTime() <= Date.now()) {
      return interaction.update({ content: "⚠️ That fixture has already kicked off. Run `/predict` again.", components: [] });
    }
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
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("tbfc_score_modal_")) {
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const fixtureId     = interaction.customId.replace("tbfc_score_modal_", "");
    const evertonScore  = interaction.fields.getTextInputValue("everton_score").trim();
    const opponentScore = interaction.fields.getTextInputValue("opponent_score").trim();
    const scorers       = interaction.fields.getTextInputValue("scorers").trim();

    if (!/^\d+$/.test(evertonScore) || !/^\d+$/.test(opponentScore)) {
      return interaction.reply({ content: "❌ Scores must be whole numbers. Run `/predict` again.", flags: MessageFlags.Ephemeral });
    }

    let displayName = interaction.user.globalName || interaction.user.username;
    try { displayName = (await interaction.guild.members.fetch(interaction.user.id)).displayName; } catch {}

    const key  = `${interaction.user.id}_${fixtureId}`;
    const pred = { userId: interaction.user.id, displayName, fixture: fixtureId, evertonScore, opponentScore, scorers: scorers || null, submittedAt: new Date().toISOString() };
    predStore.set(key, pred);

    // Schedule result check on first prediction for this fixture
    const f = getFixtureById(fixtureId);
    if (f?.srMatchId) {
      const chId = getResultsChannelId();
      if (chId) scheduleResultCheck(f, client, chId);
    }

    return interaction.reply({ content: "✅ **Prediction locked in!**", embeds: [buildPredictionEmbed(pred, displayName)] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "myprediction") {
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    const mine = predStore.values().filter((p) => p.userId === interaction.user.id);
    if (!mine.length) {
      return interaction.reply({ content: "You haven't made any predictions yet! Use `/predict`.", flags: MessageFlags.Ephemeral });
    }
    let displayName = interaction.user.globalName || interaction.user.username;
    try { displayName = (await interaction.guild.members.fetch(interaction.user.id)).displayName; } catch {}
    return interaction.reply({ content: "## 🔵 Your Predictions", embeds: mine.map((p) => buildPredictionEmbed(p, displayName)), flags: MessageFlags.Ephemeral });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "listpredictions") {
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
      return interaction.reply({ content: PREDICTION_CHANNEL_MSG, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    const listableFixture = getListableFixture();
    const modRoleId       = getModRoleIdForGuild(interaction.guildId);
    let hasModRole = false;
    if (modRoleId) {
      try { hasModRole = (await interaction.guild.members.fetch(interaction.user.id)).roles.cache.has(modRoleId); }
      catch { hasModRole = interaction.member?.roles?.cache?.has(modRoleId) ?? false; }
    }
    let fixture = listableFixture ?? (hasModRole ? getUpcomingFixtures()[0] ?? null : null);
    if (!fixture) {
      return interaction.editReply({
        content: hasModRole
          ? "No fixtures have kicked off yet and there are no upcoming fixtures."
          : "No fixtures have kicked off yet — predictions will appear here once the first match starts!",
      });
    }
    const embed = await buildListEmbed(fixture, interaction.guild);
    if (!listableFixture && hasModRole) embed.setDescription(`${embed.data.description || ""}\n\n_👀 MOD view — match has not kicked off yet._`);
    return interaction.editReply({ embeds: [embed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "final") {
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
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
    const fixture       = getFixtureById(fixtureId);

    if (!fixture) return interaction.reply({ content: "❌ Unknown fixture.", flags: MessageFlags.Ephemeral });
    if (new Date(fixture.kickoffUTC).getTime() > Date.now()) {
      return interaction.reply({ content: "❌ That fixture hasn't kicked off yet.", flags: MessageFlags.Ephemeral });
    }

    // Mark finalised so auto-checker stops (skip awarding if already finalised, e.g. by auto result)
    const alreadyFinalised = db.prepare("SELECT 1 FROM finalised WHERE fixtureId = ?").get(fixtureId);
    db.prepare("INSERT OR IGNORE INTO finalised (fixtureId, finalisedAt) VALUES (?,?)")
      .run(fixtureId, new Date().toISOString());
    if (!alreadyFinalised) {
      const actualScorersStr = actualScorers || "";
      awardPointsForFixture(fixtureId, everton, opponent, actualScorersStr);
    }

    const entries    = predStore.values().filter((p) => p.fixture === fixtureId);
    const eStr       = String(everton), oStr = String(opponent);
    const correctAll = entries.filter((p) => p.evertonScore === eStr && p.opponentScore === oStr);
    const withScorers= actualScorers ? correctAll.filter((p) => p.scorers?.trim() && scorersMatch(actualScorers, p.scorers)) : [];
    const scoreOnly  = correctAll.filter((p) => !withScorers.includes(p));

    const scoreLine = fixture.evertonHome
      ? `Everton **${everton}** – **${opponent}** ${fixture.opponent}`
      : `${fixture.opponent} **${opponent}** – **${everton}** Everton`;

    const embed = new EmbedBuilder().setColor(BOT_COLOUR)
      .setTitle(`🏁 Final Score — ${fixture.home} vs ${fixture.away}`)
      .setDescription(`📅 ${fixture.label}\n\n**${scoreLine}**${actualScorers ? `\n\n⚽ _Actual scorers:_ ${actualScorers}` : ""}`)
      .setFooter({ text: `${BOT_FOOTER} • Entered by MOD` }).setTimestamp();

    const nWith = await Promise.all(withScorers.map((p) => getDisplayName(interaction.guild, p.userId, p.displayName)));
    const nOnly = await Promise.all(scoreOnly.map((p) => getDisplayName(interaction.guild, p.userId, p.displayName)));

    embed.addFields(
      { name: "✅ Correct score + goal scorers", value: nWith.length ? nWith.join(", ") : "_None_", inline: false },
      { name: "✅ Correct score only",           value: nOnly.length ? nOnly.join(", ") : "_None_", inline: false }
    );

    const scorersRows = await Promise.all(
      entries.filter((p) => p.scorers?.trim())
        .map(async (p) => `**${await getDisplayName(interaction.guild, p.userId, p.displayName)}**: ${p.scorers.trim()}`)
    );
    const scorersVal = scorersRows.length ? scorersRows.join("\n") : "_No one entered goal scorers._";
    if (scorersVal.length > 1020) {
      let rest = scorersVal, first = true;
      while (rest.length) {
        const chunk = rest.slice(0, 1020), cut = chunk.lastIndexOf("\n") > 500 ? chunk.lastIndexOf("\n") + 1 : 1020;
        embed.addFields({ name: first ? "⚽ Goal scorers (predicted)" : "​", value: chunk.slice(0, cut).trim(), inline: false });
        rest = rest.slice(cut).trim(); first = false;
      }
    } else {
      embed.addFields({ name: "⚽ Goal scorers (predicted)", value: scorersVal, inline: false });
    }

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "clearprediction") {
    if (!isAllowedPredictionChannel(interaction.channelId, interaction.guildId)) {
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
registerCommands()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch(console.error);
