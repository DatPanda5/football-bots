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
  Pre1: "Dens Park",
  Pre2: "Toughsheet Community Stadium",
  Pre3: "Bet365 Stadium",
  Pre4: "MHP Arena",
  Pre5: "Scottish Gas Murrayfield Stadium (neutral)",
  MW1: "Hill Dickinson Stadium",
  MW2: "Vitality Stadium",
  MW3: "Hill Dickinson Stadium",
  MW4: "Tottenham Hotspur Stadium",
  MW5: "Hill Dickinson Stadium",
  MW6: "The MKM Stadium",
  MW7: "Hill Dickinson Stadium",
  MW8: "Emirates Stadium",
  MW9: "St. James' Park",
  MW10: "Hill Dickinson Stadium",
  MW11: "Gtech Community Stadium",
  MW12: "Hill Dickinson Stadium",
  MW13: "Villa Park",
  MW14: "Hill Dickinson Stadium",
  MW15: "American Express Stadium",
  MW16: "The City Ground",
  MW17: "Hill Dickinson Stadium",
  MW18: "Hill Dickinson Stadium",
  MW19: "Elland Road",
  MW20: "Hill Dickinson Stadium",
  MW21: "The Coventry Building Society Arena",
  MW22: "Hill Dickinson Stadium",
  MW23: "Anfield",
  MW24: "Hill Dickinson Stadium",
  MW25: "Hill Dickinson Stadium",
  MW26: "Stadium of Light",
  MW27: "Hill Dickinson Stadium",
  MW28: "Etihad Stadium",
  MW29: "Old Trafford",
  MW30: "Hill Dickinson Stadium",
  MW31: "Selhurst Park",
  MW32: "Hill Dickinson Stadium",
  MW33: "Hill Dickinson Stadium",
  MW34: "Craven Cottage",
  MW35: "Hill Dickinson Stadium",
  MW36: "Stamford Bridge",
  MW37: "Hill Dickinson Stadium",
  MW38: "Portman Road",
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
  md += fixtureTable(fixtures.filter((f) => f.competition === "preseason"), "Pre-season friendlies");
  md += "\n---\n\n";
  md += fixtureTable(fixtures.filter((f) => f.competition === "premier_league"), "Premier League (38)");
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
