/**
 * core/result_checker.js — shared auto result checker (Everton bot primary).
 * Polls 1hr 50min after kick-off, retries every 5 min. /final remains as MOD override.
 *
 * Usage from blue_frontier:
 *   const { scheduleResultCheck, parseSportradar } = require('../core/result_checker').createResultChecker(deps);
 */

const POLL_START_MS = (1 * 60 + 50) * 60 * 1000; // 1 hr 50 min
const POLL_INTERVAL = 5 * 60 * 1000;             // 5 min
const POLL_MAX = 36;

function sameOutcome(pEve, pOpp, rEve, rOpp) {
  const dir = (a, b) => (a > b ? "w" : a < b ? "l" : "d");
  return dir(pEve, pOpp) === dir(rEve, rOpp);
}

/**
 * Parse SportRadar summary response into { evertonGoals, opponentGoals, scorers[] } or null.
 * Export so the bot can use it in its fetchFinalScore (when API is wired).
 */
function parseSportradar(data, fixture) {
  try {
    if (data?.sport_event_status?.match_status !== "ended") return null;
    const homeScore = data.sport_event_status.home_score ?? 0;
    const awayScore = data.sport_event_status.away_score ?? 0;
    const evertonGoals = fixture.evertonHome ? homeScore : awayScore;
    const opponentGoals = fixture.evertonHome ? awayScore : homeScore;
    const scorers = (data.timeline ?? [])
      .filter((e) => e.type === "score_change" && e.player?.name)
      .map((e) => e.player.name);
    return { evertonGoals, opponentGoals, scorers };
  } catch (e) {
    console.error("[ResultChecker] Parse error:", e);
    return null;
  }
}

async function postAutoResults(fixture, result, botClient, channelId, deps) {
  const { getPredictionsForFixture, EmbedBuilder, color, footer } = deps;
  const channel = botClient.channels.cache.get(channelId);
  if (!channel) {
    console.error(`[ResultChecker] Channel ${channelId} not found.`);
    return;
  }

  const { evertonGoals, opponentGoals, scorers } = result;
  const entries = getPredictionsForFixture(fixture.id);

  const scoreLine = fixture.evertonHome
    ? `Everton **${evertonGoals}** – **${opponentGoals}** ${fixture.opponent}`
    : `${fixture.opponent} **${opponentGoals}** – **${evertonGoals}** Everton`;

  const exact = entries.filter(
    (p) => p.evertonScore === String(evertonGoals) && p.opponentScore === String(opponentGoals)
  );
  const correct = entries.filter(
    (p) => !exact.includes(p) && sameOutcome(+p.evertonScore, +p.opponentScore, evertonGoals, opponentGoals)
  );

  const rows = entries.map((p) => {
    const predLine = fixture.evertonHome
      ? `Everton ${p.evertonScore}–${p.opponentScore} ${fixture.opponent}`
      : `${fixture.opponent} ${p.opponentScore}–${p.evertonScore} Everton`;
    const badge = exact.includes(p) ? "🎯 Exact score!" : correct.includes(p) ? "✅ Correct result" : "❌ Incorrect";
    return `**${p.displayName}** — ${predLine}\n> ${badge}${p.scorers ? `\n> ⚽ ${p.scorers}` : ""}`;
  });

  let summary;
  if (exact.length) summary = `🎯 Exact score by **${exact.map((p) => p.displayName).join(", ")}**! COYB! 🔵`;
  else if (correct.length) summary = `✅ Correct result for **${correct.map((p) => p.displayName).join(", ")}**!`;
  else summary = "😬 No one got the result. Better luck next match!";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🏁 Auto Result — ${fixture.home} vs ${fixture.away}`)
    .setDescription(`📅 ${fixture.label}\n\n**${scoreLine}**`)
    .setFooter({ text: `${footer} • Auto-detected` })
    .setTimestamp();

  if (scorers?.length) embed.addFields({ name: "⚽ Goalscorers", value: scorers.join(", "), inline: false });
  embed.addFields(
    {
      name: `📋 Predictions (${rows.length})`,
      value: rows.length ? rows.join("\n\n").slice(0, 1024) : "_No predictions submitted._",
      inline: false,
    },
    { name: "🏆 Summary", value: summary, inline: false }
  );

  await channel.send({ embeds: [embed] });
  console.log(`[ResultChecker] Posted results for ${fixture.id}.`);
  if (deps.onResultsPosted) {
    try {
      deps.onResultsPosted(fixture, result, entries);
    } catch (e) {
      console.error("[ResultChecker] onResultsPosted error:", e);
    }
  }
}

/**
 * Create the result checker bound to the given deps.
 * @param {Object} deps
 * @param {Object} deps.db - better-sqlite3 instance (must have table `finalised` with fixtureId, finalisedAt)
 * @param {Function} deps.getPredictionsForFixture - (fixtureId: string) => Array<{ displayName, evertonScore, opponentScore, scorers, fixture }>
 * @param {Function} deps.fetchFinalScore - async (srMatchId: string, fixture: object) => { evertonGoals, opponentGoals, scorers[] } | null
 * @param {typeof import('discord.js').EmbedBuilder} deps.EmbedBuilder
 * @param {number} deps.color - hex colour
 * @param {string} deps.footer - footer text
 * @param {Function} [deps.onResultsPosted] - optional (fixture, result, entries) => {} called after auto-post so caller can award points
 */
function createResultChecker(deps) {
  const { db, getPredictionsForFixture, fetchFinalScore, EmbedBuilder, color, footer } = deps;

  function scheduleResultCheck(fixture, botClient, channelId) {
    if (!fixture.srMatchId) {
      console.log(`[ResultChecker] ${fixture.id}: no srMatchId — skipping.`);
      return;
    }
    const already = db.prepare("SELECT 1 FROM finalised WHERE fixtureId = ?").get(fixture.id);
    if (already) {
      console.log(`[ResultChecker] ${fixture.id}: already finalised — skipping.`);
      return;
    }

    const kickoff = new Date(fixture.kickoffUTC).getTime();
    const firstPoll = kickoff + POLL_START_MS;
    const waitMs = Math.max(0, firstPoll - Date.now());

    console.log(`[ResultChecker] ${fixture.id}: first poll in ${Math.round(waitMs / 60000)} min.`);
    setTimeout(() => pollLoop(fixture, botClient, channelId, 0), waitMs);
  }

  async function pollLoop(fixture, botClient, channelId, attempt) {
    if (attempt >= POLL_MAX) {
      console.log(`[ResultChecker] ${fixture.id}: gave up after ${POLL_MAX} attempts.`);
      return;
    }
    const already = db.prepare("SELECT 1 FROM finalised WHERE fixtureId = ?").get(fixture.id);
    if (already) {
      console.log(`[ResultChecker] ${fixture.id}: finalised by /final — stopping.`);
      return;
    }

    console.log(`[ResultChecker] ${fixture.id}: poll ${attempt + 1}/${POLL_MAX}`);
    const result = await fetchFinalScore(fixture.srMatchId, fixture);

    if (!result) {
      setTimeout(() => pollLoop(fixture, botClient, channelId, attempt + 1), POLL_INTERVAL);
      return;
    }

    await postAutoResults(fixture, result, botClient, channelId, {
      getPredictionsForFixture,
      EmbedBuilder,
      color,
      footer,
    });
    db.prepare("INSERT OR IGNORE INTO finalised (fixtureId, finalisedAt) VALUES (?,?)").run(
      fixture.id,
      new Date().toISOString()
    );
  }

  return { scheduleResultCheck, parseSportradar };
}

module.exports = { createResultChecker, parseSportradar, sameOutcome };
