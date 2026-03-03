#!/usr/bin/env node
/**
 * Run inside Railway container to print predictions.db as base64.
 * Copy this file into the container or run after deploy, then:
 *   node backup-db.js   (copy output into backup_b64.txt)
 */
const fs = require("fs");
const path = require("path");
const cwd = process.cwd();
const candidates = [
  path.join(process.env.DATA_DIR || cwd, "data", "predictions.db"),
  path.join(cwd, "data", "predictions.db"),
  path.join(cwd, "blue_frontier", "data", "predictions.db"),
];
for (const dbPath of candidates) {
  if (fs.existsSync(dbPath)) {
    process.stdout.write(fs.readFileSync(dbPath).toString("base64"));
    process.exit(0);
  }
}
console.error("No DB found. Tried:", candidates);
process.exit(1);
