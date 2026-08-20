// Live leaderboard API — talks to the Azure Functions backend (see
// ../../backend/). Every function here keeps the exact same shape the
// localStorage placeholder had, so nothing in app.js needed to change
// except adding the new claimStudentId() call before starting a game.
//
// Scoring (lower is always better, golf-style):
//   Round 1 (matching)   score = moves*10 + seconds   — attempts weighted over time
//   Round 2 (sorting)    score = seconds*10 + mistakes — time weighted over attempts
//   Overall (after Rd 2) score = round1Score + round2Score
//
// The server ALWAYS recomputes every score itself from raw moves/seconds/
// mistakes — it never trusts a client-supplied score. computeRound1Score/
// computeRound2Score are kept here purely for instant local display (e.g.
// showing "Overall score: X" on the win screen without an extra round
// trip) — the leaderboard's actual ranking always reflects what the server
// computed and stored, not this local echo.
//
// The Overall leaderboard is aggregated per student server-side (not one
// row per session): each student's BEST overall score, discounted by a
// capped bonus for repeated play — this week: 5 points off per session
// played that week, capped at 25 (5 sessions). All-time: best score ever,
// no bonus.
//
//   claimStudentId({ className, studentId })
//     -> Promise<{ ok: boolean, message?: string }>
//   submitResult({ studentId, schoolYear, campus, className, pairs, round, moves, mistakes, seconds })
//     -> Promise<void>
//   getLeaderboard({ pairs, round, range })
//     -> Promise<Array<Result>>                    // round 1 only, one row per session
//   getOverallLeaderboard({ pairs, range })
//     -> Promise<Array<{studentId, score, sessions}>>  // round 2 "Overall", aggregated per student

const API_BASE_URL = "https://funcmons-app-exduaqezbqeydcet.centralus-01.azurewebsites.net";
const DEVICE_TOKEN_KEY = "funcmons.deviceToken";

function computeRound1Score(moves, seconds) {
  return moves * 10 + seconds;
}

function computeRound2Score(seconds, mistakes) {
  return seconds * 10 + mistakes;
}

// An invisible per-browser token, not a password — lets the server tell a
// returning student on the same device apart from a different device
// trying to reuse their Student ID. See backend/main.py's /claim-id.
function getDeviceToken() {
  try {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }
    return token;
  } catch (err) {
    console.warn("Could not access localStorage for device token", err);
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// Call before starting a game whenever studentId is non-empty. Resolves
// {ok:false, message} on a real conflict (a different device already
// claimed this ID in this class) — the caller should block starting and
// show that message. On any other failure (network down, API erroring),
// resolves {ok:true} so a backend hiccup never blocks students from
// playing; that game's result just won't have a claim behind it.
async function claimStudentId({ className, studentId }) {
  try {
    const response = await fetch(`${API_BASE_URL}/claim-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className, studentId, deviceToken: getDeviceToken() }),
    });

    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      return { ok: false, message: body.detail || `Student ID '${studentId}' is already in use for ${className}.` };
    }
    return { ok: true };
  } catch (err) {
    console.warn("Could not reach leaderboard API for ID claim", err);
    return { ok: true };
  }
}

async function submitResult({ studentId, schoolYear, campus, className, pairs, round, moves, mistakes, seconds }) {
  try {
    const response = await fetch(`${API_BASE_URL}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, schoolYear, campus, className, pairs, round, moves, mistakes, seconds }),
    });
    if (!response.ok) {
      console.warn("Leaderboard API rejected result submission", await response.text());
    }
  } catch (err) {
    console.warn("Could not submit result to leaderboard API", err);
  }
}

async function getLeaderboard({ pairs, round, range, schoolYear, campus, className }) {
  try {
    const params = new URLSearchParams({
      pairs,
      round,
      range,
      schoolYear,
      campus,
      className,
    });
    const response = await fetch(`${API_BASE_URL}/leaderboard?${params}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.warn("Could not load leaderboard", err);
    return [];
  }
}

async function getOverallLeaderboard({ pairs, range, schoolYear, campus, className }) {
  try {
    const params = new URLSearchParams({
      pairs,
      range,
      schoolYear,
      campus,
      className,
    });
    const response = await fetch(`${API_BASE_URL}/leaderboard/overall?${params}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.warn("Could not load overall leaderboard", err);
    return [];
  }
}
