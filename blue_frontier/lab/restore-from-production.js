#!/usr/bin/env node
/**
 * Port production predictions DB into the lab (local).
 * Run from blue_frontier/lab/ or from repo root. Stop the lab first (tbflaboff).
 *
 * Usage:
 *   node blue_frontier/lab/restore-from-production.js <path-to-base64-backup>
 *   node blue_frontier/lab/restore-from-production.js production-backup.b64
 *
 * To get the backup from production (Railway):
 *   railway run node blue_frontier/backup-db.js > blue_frontier/lab/production-backup.b64
 * (Then run this script with blue_frontier/lab/production-backup.b64)
 */
const fs = require("fs");
const path = require("path");

const labDir = path.resolve(__dirname);
const blueFrontier = path.join(labDir, "..");
const labDbPath = path.join(blueFrontier, "data", "predictions.db");

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: node restore-from-production.js <path-to-base64-backup>");
  console.error("Example: node restore-from-production.js production-backup.b64");
  process.exit(1);
}

const absBackup = path.isAbsolute(backupPath) ? backupPath : path.resolve(process.cwd(), backupPath);
if (!fs.existsSync(absBackup)) {
  console.error("File not found:", absBackup);
  process.exit(1);
}

const b64 = fs.readFileSync(absBackup, "utf8").trim();
const buf = Buffer.from(b64, "base64");
const dataDir = path.dirname(labDbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(labDbPath, buf);
console.log("Lab DB updated from production backup:", labDbPath);
console.log("Restart the lab (tbflabon or ./lab-frontier.sh start) to use the ported data.");
