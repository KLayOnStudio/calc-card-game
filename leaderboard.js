// Placeholder leaderboard "backend".
//
// This whole file is a stand-in for the future Azure API. Every function
// here is async and returns/accepts the same shape a real fetch() call
// would, so swapping the bodies for real HTTP requests later shouldn't
// require touching any caller in app.js.
//
// Scoring (lower is always better, golf-style):
//   Round 1 (matching)   score = moves*10 + seconds   — attempts weighted over time
//   Round 2 (sorting)    score = seconds*10 + mistakes — time weighted over attempts
//   Overall (after Rd 2) score = round1Score + round2Score
//
// Round 1 results are submitted (and ranked) on their own right after the
// Round 1 win. Round 2 results are only ever shown as the combined
// "Overall" ranking once Round 2 finishes — there's no separate
// Round-2-only leaderboard.
//
// The Overall leaderboard is aggregated per student (not one row per
// session): it shows each student's BEST overall score, discounted by a
// capped bonus for repeated play — this week: 5 points off per session
// played that week, capped at 25 (5 sessions). All-time: best score ever,
// no bonus (repetition credit is inherently a weekly thing). This rewards
// practicing more without letting raw session count overwhelm performance,
// and without the perverse "stop playing to protect your total" incentive
// a literal sum of scores would create.
//
//   submitResult({ studentId, schoolYear, campus, className, pairs, round, moves, mistakes, seconds, overallScore })
//     -> Promise<void>
//   getLeaderboard({ pairs, round, range })
//     -> Promise<Array<Result>>                    // round 1 only, one row per session
//   getOverallLeaderboard({ pairs, range })
//     -> Promise<Array<{studentId, score, sessions}>>  // round 2 "Overall", aggregated per student
//
// where Result = { studentId, schoolYear, campus, className, pairs, round,
//                   moves, mistakes, seconds, score, playedAt (ISO string) }

const LEADERBOARD_STORAGE_KEY = "calcCardGame.results.v2";
const REPETITION_BONUS_PER_SESSION = 5;
const REPETITION_BONUS_MAX = 25;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function computeRound1Score(moves, seconds) {
  return moves * 10 + seconds;
}

function computeRound2Score(seconds, mistakes) {
  return seconds * 10 + mistakes;
}

function isWithinPastWeek(result) {
  return Date.now() - new Date(result.playedAt).getTime() <= ONE_WEEK_MS;
}

function readAllResults() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("Could not read local leaderboard storage", err);
    return [];
  }
}

function writeAllResults(results) {
  try {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(results));
  } catch (err) {
    console.warn("Could not write local leaderboard storage", err);
  }
}

async function submitResult({ studentId, schoolYear, campus, className, pairs, round, moves, mistakes, seconds, overallScore }) {
  const results = readAllResults();
  const score = round === 1 ? computeRound1Score(moves, seconds) : overallScore;

  results.push({
    studentId,
    schoolYear,
    campus,
    className,
    pairs,
    round,
    moves: moves ?? null,
    mistakes: mistakes ?? null,
    seconds,
    score,
    playedAt: new Date().toISOString(),
  });
  writeAllResults(results);
}

async function getLeaderboard({ pairs, round, range }) {
  const all = readAllResults().filter((r) => r.pairs === pairs && r.round === round);
  const filtered = range === "week" ? all.filter(isWithinPastWeek) : all;
  return filtered.sort((a, b) => a.score - b.score).slice(0, 10);
}

async function getOverallLeaderboard({ pairs, range }) {
  const all = readAllResults().filter((r) => r.pairs === pairs && r.round === 2);
  const relevant = range === "week" ? all.filter(isWithinPastWeek) : all;

  const byStudent = new Map();
  for (const r of relevant) {
    const entry = byStudent.get(r.studentId) || { studentId: r.studentId, bestScore: Infinity, sessions: 0 };
    entry.bestScore = Math.min(entry.bestScore, r.score);
    entry.sessions += 1;
    byStudent.set(r.studentId, entry);
  }

  const rows = [...byStudent.values()].map((entry) => {
    const bonus = range === "week" ? Math.min(entry.sessions * REPETITION_BONUS_PER_SESSION, REPETITION_BONUS_MAX) : 0;
    return {
      studentId: entry.studentId,
      sessions: entry.sessions,
      score: Math.max(0, entry.bestScore - bonus),
    };
  });

  return rows.sort((a, b) => a.score - b.score).slice(0, 10);
}
