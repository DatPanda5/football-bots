#!/usr/bin/env node
/**
 * Regenerate 26-27fixtures.md and squad.md from index.js.
 * Run after changing ALL_FIXTURES, squads, or aliases in index.js:
 *   node scripts/regenerate-reference-md.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.js");
const src = fs.readFileSync(INDEX, "utf8");

const VENUES = {
  pre01: "Dens Park",
  pre02: "Toughsheet Community Stadium",
  pre03: "Bet365 Stadium",
  pre04: "MHP Arena",
  pre05: "Scottish Gas Murrayfield Stadium (neutral)",
  fix01: "Hill Dickinson Stadium",
  fix02: "Vitality Stadium",
  fix03: "Hill Dickinson Stadium",
  fix04: "Tottenham Hotspur Stadium",
  fix05: "Hill Dickinson Stadium",
  fix06: "The MKM Stadium",
  fix07: "Hill Dickinson Stadium",
  fix08: "Emirates Stadium",
  fix09: "St. James' Park",
  fix10: "Hill Dickinson Stadium",
  fix11: "Gtech Community Stadium",
  fix12: "Hill Dickinson Stadium",
  fix13: "Villa Park",
  fix14: "Hill Dickinson Stadium",
  fix15: "American Express Stadium",
  fix16: "The City Ground",
  fix17: "Hill Dickinson Stadium",
  fix18: "Hill Dickinson Stadium",
  fix19: "Elland Road",
  fix20: "Hill Dickinson Stadium",
  fix21: "The Coventry Building Society Arena",
  fix22: "Hill Dickinson Stadium",
  fix23: "Anfield",
  fix24: "Hill Dickinson Stadium",
  fix25: "Hill Dickinson Stadium",
  fix26: "Stadium of Light",
  fix27: "Hill Dickinson Stadium",
  fix28: "Etihad Stadium",
  fix29: "Old Trafford",
  fix30: "Hill Dickinson Stadium",
  fix31: "Selhurst Park",
  fix32: "Hill Dickinson Stadium",
  fix33: "Hill Dickinson Stadium",
  fix34: "Craven Cottage",
  fix35: "Hill Dickinson Stadium",
  fix36: "Stamford Bridge",
  fix37: "Hill Dickinson Stadium",
  fix38: "Portman Road",
};

const today = new Date().toISOString().slice(0, 10);

function extractFixtures() {
  const m = src.match(/const ALL_FIXTURES = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error("ALL_FIXTURES not found");
  return eval("[" + m[1] + "]");
}

function fixtureTable(fixtures, title) {
  let md = `## ${title}\n\n| ID | Date (ET) | Match | Venue | H/A |\n|----|-----------|-------|-------|-----|\n`;
  for (const f of fixtures) {
    const ha = f.evertonHome ? "H" : "A";
    const matchup = f.evertonHome ? `Everton vs ${f.opponent}` : `${f.opponent} vs Everton`;
    md += `| ${f.id} | ${f.label} | ${matchup} | ${VENUES[f.id] || "—"} | ${ha} |\n`;
  }
  return md;
}

function writeFixturesMd(fixtures) {
  let md = `# Everton 2026–27 Fixtures

**Last updated:** ${today}  
**Source of truth:** \`index.js\` → \`ALL_FIXTURES\` — run \`node scripts/regenerate-reference-md.js\` after fixture changes.

[evertonfc.com fixtures](https://www.evertonfc.com/matches/men/fixtures)

---

`;
  md += fixtureTable(fixtures.filter((f) => f.id.startsWith("pre")), "Pre-season friendlies");
  md += "\n---\n\n";
  md += fixtureTable(fixtures.filter((f) => f.id.startsWith("fix")), "Premier League (38)");
  md += "\n---\n\n## Kickoff UTC reference\n\n";
  for (const f of fixtures) md += `- **${f.id}** — \`${f.kickoffUTC}\`\n`;
  fs.writeFileSync(path.join(ROOT, "26-27fixtures.md"), md);
}

function writeSquadMd() {
  const everton = eval(src.match(/const EVERTON_SQUAD_2025_26 = (\[[\s\S]*?\n\]);/)[1]);
  const opponents = eval("(" + src.match(/const OPPONENT_SQUADS_2025_26 = (\{[\s\S]*?\n\});/)[1] + ")");
  const explicitAliases = eval("(" + src.match(/const aliases = (\{[\s\S]*?\n  \});/)[1] + ")");
  const teamAliases = eval("(" + src.match(/const TEAM_ALIASES = (\{[\s\S]*?\n\});/)[1] + ")");

  let md = `# Everton Bot — Squads & Aliases (2026–27)

**Last updated:** ${today}  
**Source of truth:** \`index.js\` — run \`node scripts/regenerate-reference-md.js\` after squad or alias changes.

---

## Everton squad

| # | Player | Positions |
|---|--------|-----------|
`;
  for (const p of everton) md += `| ${p.number} | ${p.name} | ${p.positions} |\n`;

  md += "\n---\n\n## Opponent squads\n\n";
  for (const [team, players] of Object.entries(opponents).sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `### ${team}\n\n${players.join(", ")}\n\n`;
  }

  md += `---\n\n## Scorer aliases (explicit)\n\n| Alias | Maps to |\n|-------|----------|\n`;
  for (const [k, v] of Object.entries(explicitAliases).sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| \`${k}\` | ${v} |\n`;
  }

  md += `
### Auto-generated aliases

For every squad player, the **ASCII form** (diacritics stripped) also matches — e.g. \`merlin rohl\` → merlin röhl.  
\`og\` / \`own goal\` → **own goal**.

---

## Team aliases (\`!score\` command)

| Alias | Search term |
|-------|-------------|
`;
  for (const [k, v] of Object.entries(teamAliases).sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| \`${k}\` | ${v} |\n`;
  }

  fs.writeFileSync(path.join(ROOT, "squad.md"), md);
}

const fixtures = extractFixtures();
writeFixturesMd(fixtures);
writeSquadMd();
console.log(`[sync] Wrote 26-27fixtures.md (${fixtures.length} fixtures) and squad.md`);
