#!/usr/bin/env node
/**
 * One-off: run inside Railway container to print predictions.db as base64.
 * Usage: railway ssh -- node backup-db.js   (then redirect to backup_b64.txt)
 */
const fs = require("fs");
const path = require("path");
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "predictions.db");
if (fs.existsSync(dbPath)) {
  process.stdout.write(fs.readFileSync(dbPath).toString("base64"));
} else {
  console.error("No DB at", dbPath);
  process.exit(1);
}
