/**
 * core/score_lookup.js — shared by both bots
 * Handles !score [team name]: searches 8 leagues, returns LIVE / Final / Upcoming embed.
 */

const { EmbedBuilder } = require("discord.js");
const { LEAGUES, LEAGUE_LABELS, LEAGUE_EMOJIS, TEAM_ALIASES } = require("./team_aliases.js");

const SCORE_FOOTER = "The Blue Frontier Committee • COYB! 🔵";

function resolveTeam(query) {
  const q = String(query).toLowerCase().trim();
  return TEAM_ALIASES[q] ?? q;
}

function teamMatches(teamName, searchTerm) {
  return String(teamName).toLowerCase().includes(String(searchTerm).toLowerCase());
}

async function searchAllLeagues(searchTerm, fetchScoresFn) {
  const results = await Promise.all(
    LEAGUES.map((league) => fetchScoresFn(league).catch(() => []))
  );

  const live = [];
  const final = [];
  const upcoming = [];

  for (let i = 0; i < LEAGUES.length; i++) {
    const league = LEAGUES[i];
    const games = Array.isArray(results[i]) ? results[i] : [];
    for (const game of games) {
      const teams = Object.values(game.teams || {});
      const abbrevs = Object.keys(game.teams || {});
      if (teams.length < 2) continue;
      const homeName = teams[0]?.name ?? "";
      const awayName = teams[1]?.name ?? "";
      if (!teamMatches(homeName, searchTerm) && !teamMatches(awayName, searchTerm)) continue;

      const g = { ...game, _league: league };
      const status = game.status || "";
      if (status === "in_progress") live.push(g);
      else if (status === "final") final.push(g);
      else if (status === "scheduled") upcoming.push(g);
    }
  }

  final.sort((a, b) => (b.start_time || "").localeCompare(a.start_time || ""));
  upcoming.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const combined = [...live];
  if (final.length) combined.push(final[0]);
  if (upcoming.length) combined.push(upcoming[0]);

  const seen = new Set();
  return combined.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

function parseDt(startTime) {
  if (!startTime) return null;
  try {
    return new Date(startTime.replace("Z", "+00:00"));
  } catch {
    return null;
  }
}

function buildEmbed(game) {
  const league = game._league || "";
  const status = game.status || "";
  const startTime = game.start_time || "";
  const teams = Object.values(game.teams || {});
  const abbrevs = Object.keys(game.teams || {});
  const homeName = teams[0]?.name ?? "?";
  const awayName = teams[1]?.name ?? "?";
  const homeAbbr = abbrevs[0] || "";
  const awayAbbr = abbrevs[1] || "";
  const homeScore = (game.score || {})[homeAbbr] ?? 0;
  const awayScore = (game.score || {})[awayAbbr] ?? 0;
  const leagueLabel = LEAGUE_LABELS[league] || league;
  const leagueEmoji = LEAGUE_EMOJIS[league] || "🏆";

  let color, title, description;

  if (status === "in_progress") {
    color = 0x00cc44;
    title = `🔴 LIVE — ${homeName} vs ${awayName}`;
    description = `**${homeScore} – ${awayScore}**\n\n${leagueEmoji} ${leagueLabel}`;
  } else if (status === "final") {
    color = 0x003399;
    const dt = parseDt(startTime);
    const dateStr = dt ? dt.toUTCString().slice(0, 16) : startTime;
    title = `✅ Final — ${homeName} vs ${awayName}`;
    description = `**${homeScore} – ${awayScore}**\n\n${leagueEmoji} ${leagueLabel} | 📅 ${dateStr}`;
  } else {
    color = 0x888888;
    const dt = parseDt(startTime);
    const koStr = dt ? dt.toUTCString().replace("GMT", "UTC") : startTime;
    title = `🗓 Upcoming — ${homeName} vs ${awayName}`;
    description = `⏱ Kick-off: **${koStr}**\n\n${leagueEmoji} ${leagueLabel}`;
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: SCORE_FOOTER });
}

function errorEmbed(message) {
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle("❌ Team not found")
    .setDescription(message)
    .setFooter({ text: SCORE_FOOTER });
}

/**
 * Call from on_message when content starts with !score.
 * @param {import("discord.js").Message} message
 * @param {Function} fetchScoresFn - async (league: string) => Promise<Array<{ id, status, start_time, teams, score }>>
 */
async function handleScoreCommand(message, fetchScoresFn) {
  const parts = message.content.trim().split(/\s+/);
  if (parts.length < 2 || !parts.slice(1).join(" ").trim()) {
    await message.reply({
      embeds: [
        errorEmbed("Please provide a team name.\nExample: `!score Everton`"),
      ],
    });
    return;
  }

  const query = parts.slice(1).join(" ").trim();
  const resolved = resolveTeam(query);
  const results = await searchAllLeagues(resolved, fetchScoresFn);

  if (!results.length) {
    await message.reply({
      embeds: [
        errorEmbed(
          `No match found for **${query}**.\n` +
            `Try the full team name or a common nickname.\n` +
            `Example: \`!score Man City\`, \`!score Juve\`, \`!score PSG\``
        ),
      ],
    });
    return;
  }

  const embeds = results.slice(0, 3).map(buildEmbed);
  for (const embed of embeds) {
    await message.channel.send({ embeds: [embed] });
  }
}

module.exports = {
  handleScoreCommand,
  resolveTeam,
  teamMatches,
  searchAllLeagues,
  LEAGUES,
  LEAGUE_LABELS,
  LEAGUE_EMOJIS,
  TEAM_ALIASES,
};
