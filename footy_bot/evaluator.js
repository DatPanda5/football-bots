/**
 * footy_bot/evaluator.js — Evaluates predictions vs results, awards points.
 */

const db = require("./database.js");

const POINTS_EXACT_SCORE = 5;
const POINTS_CORRECT_RESULT = 2;
const POINTS_CORRECT_SCORER = 1;

function _sameOutcome(ph, pa, rh, ra) {
  const outcome = (h, a) => (h > a ? "h" : h < a ? "a" : "d");
  return outcome(ph, pa) === outcome(rh, ra);
}

function evaluatePrediction(prediction, result) {
  const predHome = parseInt(prediction.home_goals, 10);
  const predAway = parseInt(prediction.away_goals, 10);
  const realHome = parseInt(result.home_goals, 10);
  const realAway = parseInt(result.away_goals, 10);

  const exactScore = predHome === realHome && predAway === realAway;
  const correctResult = _sameOutcome(predHome, predAway, realHome, realAway);

  const predScorers = (prediction.goalscorers || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const realScorers = (result.goalscorers || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const matchedScorers = predScorers.filter((name) =>
    realScorers.some((r) => name.toLowerCase().includes(r) || r.includes(name.toLowerCase()))
  );

  let points = 0;
  const breakdown = [];
  if (exactScore) {
    points += POINTS_EXACT_SCORE;
    breakdown.push(`🎯 Exact score +${POINTS_EXACT_SCORE}pts`);
  } else if (correctResult) {
    points += POINTS_CORRECT_RESULT;
    breakdown.push(`✅ Correct result +${POINTS_CORRECT_RESULT}pts`);
  } else {
    breakdown.push("❌ Incorrect result");
  }
  for (const scorer of matchedScorers) {
    points += POINTS_CORRECT_SCORER;
    breakdown.push(`⚽ ${scorer} +${POINTS_CORRECT_SCORER}pt`);
  }

  return {
    exact_score: exactScore,
    correct_result: correctResult,
    matched_scorers: matchedScorers,
    points,
    breakdown,
  };
}

function processMatchResults(matchId, league, result) {
  db.saveResult(
    matchId,
    league,
    result.home_team,
    result.away_team,
    result.home_goals,
    result.away_goals,
    result.goalscorers || []
  );

  const predictions = db.getPredictionsForMatch(matchId);
  const resultForEval = {
    home_goals: result.home_goals,
    away_goals: result.away_goals,
    goalscorers: Array.isArray(result.goalscorers) ? result.goalscorers.join(", ") : (result.goalscorers || ""),
  };
  const evaluated = [];

  for (const pred of predictions) {
    const ev = evaluatePrediction(pred, resultForEval);
    if (ev.exact_score) {
      db.awardPoints(pred.user_id, pred.username, league, matchId, POINTS_EXACT_SCORE, "exact_score");
    } else if (ev.correct_result) {
      db.awardPoints(pred.user_id, pred.username, league, matchId, POINTS_CORRECT_RESULT, "correct_result");
    }
    for (const scorer of ev.matched_scorers) {
      db.awardPoints(pred.user_id, pred.username, league, matchId, POINTS_CORRECT_SCORER, `scorer:${scorer}`);
    }
    evaluated.push({ ...pred, ...ev, result });
  }

  return evaluated;
}

module.exports = { evaluatePrediction, processMatchResults, POINTS_EXACT_SCORE, POINTS_CORRECT_RESULT, POINTS_CORRECT_SCORER };
