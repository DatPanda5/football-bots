/**
 * footy_bot/database.js — SQLite layer for predictions, results, points.
 * All reads/writes go through this module.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "predictions.db");

const db = new Database(DB_PATH);

function _now() {
  return new Date().toISOString();
}

function _seasonYear() {
  const now = new Date();
  if (now.getUTCMonth() >= 7) {
    return `${now.getUTCFullYear()}-${String(now.getUTCFullYear() + 1).slice(-2)}`;
  }
  return `${now.getUTCFullYear() - 1}-${String(now.getUTCFullYear()).slice(-2)}`;
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id         TEXT NOT NULL,
      league           TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      username         TEXT NOT NULL,
      home_team        TEXT NOT NULL,
      away_team        TEXT NOT NULL,
      kickoff_utc      TEXT NOT NULL,
      home_goals       INTEGER NOT NULL,
      away_goals       INTEGER NOT NULL,
      goalscorers      TEXT NOT NULL DEFAULT '',
      submitted_at     TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      locked           INTEGER NOT NULL DEFAULT 0,
      UNIQUE(match_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS results (
      match_id         TEXT PRIMARY KEY,
      league           TEXT NOT NULL,
      home_team        TEXT NOT NULL,
      away_team        TEXT NOT NULL,
      home_goals       INTEGER NOT NULL,
      away_goals       INTEGER NOT NULL,
      goalscorers      TEXT NOT NULL DEFAULT '',
      finalised_at     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS points (
      user_id          TEXT NOT NULL,
      username         TEXT NOT NULL,
      league           TEXT NOT NULL,
      season_points    INTEGER NOT NULL DEFAULT 0,
      alltime_points   INTEGER NOT NULL DEFAULT 0,
      season_year      TEXT NOT NULL,
      PRIMARY KEY (user_id, league, season_year)
    );
    CREATE TABLE IF NOT EXISTS points_log (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      username         TEXT NOT NULL,
      league           TEXT NOT NULL,
      points_awarded   INTEGER NOT NULL,
      reason           TEXT NOT NULL,
      awarded_at       TEXT NOT NULL
    );
  `);
}

function upsertPrediction(
  matchId,
  league,
  userId,
  username,
  homeTeam,
  awayTeam,
  kickoffUtc,
  homeGoals,
  awayGoals,
  goalscorers
) {
  const now = _now();
  const ko = new Date(kickoffUtc.replace("Z", "+00:00"));
  if (new Date() >= ko) return false;

  const scorersStr = Array.isArray(goalscorers) ? goalscorers.join(", ") : String(goalscorers || "");

  db.prepare(`
    INSERT INTO predictions
      (match_id, league, user_id, username, home_team, away_team,
       kickoff_utc, home_goals, away_goals, goalscorers,
       submitted_at, updated_at, locked)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)
    ON CONFLICT(match_id, user_id) DO UPDATE SET
      home_goals   = excluded.home_goals,
      away_goals   = excluded.away_goals,
      goalscorers  = excluded.goalscorers,
      username     = excluded.username,
      updated_at   = excluded.updated_at
  `).run(
    matchId,
    league,
    String(userId),
    username,
    homeTeam,
    awayTeam,
    kickoffUtc,
    homeGoals,
    awayGoals,
    scorersStr,
    now,
    now
  );
  return true;
}

function getPredictionsForMatch(matchId) {
  return db.prepare("SELECT * FROM predictions WHERE match_id = ?").all(matchId);
}

function getUserPrediction(matchId, userId) {
  return db.prepare("SELECT * FROM predictions WHERE match_id = ? AND user_id = ?").get(matchId, String(userId)) || null;
}

function saveResult(matchId, league, homeTeam, awayTeam, homeGoals, awayGoals, goalscorers) {
  const scorersStr = Array.isArray(goalscorers) ? goalscorers.join(", ") : String(goalscorers || "");
  db.prepare(`
    INSERT OR REPLACE INTO results
      (match_id, league, home_team, away_team, home_goals, away_goals, goalscorers, finalised_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(matchId, league, homeTeam, awayTeam, homeGoals, awayGoals, scorersStr, _now());
}

function getResult(matchId) {
  return db.prepare("SELECT * FROM results WHERE match_id = ?").get(matchId) || null;
}

function awardPoints(userId, username, league, matchId, points, reason) {
  const season = _seasonYear();
  const now = _now();
  for (const scope of [league, "overall"]) {
    db.prepare(`
      INSERT INTO points (user_id, username, league, season_points, alltime_points, season_year)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, league, season_year) DO UPDATE SET
        username       = excluded.username,
        season_points  = season_points + excluded.season_points,
        alltime_points = alltime_points + excluded.alltime_points
    `).run(String(userId), username, scope, points, points, season);
  }
  db.prepare(`
    INSERT INTO points_log (match_id, user_id, username, league, points_awarded, reason, awarded_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(matchId, String(userId), username, league, points, reason, now);
}

function getLeaderboard(league, season = null, limit = 15) {
  const seasonYear = season === "alltime" ? null : (season || _seasonYear());
  if (season === "alltime") {
    return db.prepare(`
      SELECT user_id, username, SUM(alltime_points) as total_points
      FROM points WHERE league = ?
      GROUP BY user_id ORDER BY total_points DESC LIMIT ?
    `).all(league, limit);
  }
  return db.prepare(`
    SELECT user_id, username, season_points as total_points
    FROM points WHERE league = ? AND season_year = ?
    ORDER BY season_points DESC LIMIT ?
  `).all(league, seasonYear, limit);
}

function adminResetSeasonPoints(league = null) {
  const season = _seasonYear();
  if (league) {
    db.prepare("UPDATE points SET season_points = 0 WHERE league = ? AND season_year = ?").run(league, season);
  } else {
    db.prepare("UPDATE points SET season_points = 0 WHERE season_year = ?").run(season);
  }
}

function close() {
  db.close();
}

module.exports = {
  initDb,
  upsertPrediction,
  getPredictionsForMatch,
  getUserPrediction,
  saveResult,
  getResult,
  awardPoints,
  getLeaderboard,
  adminResetSeasonPoints,
  close,
  _seasonYear,
};
