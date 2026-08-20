"""
FuncMons leaderboard API.

Mirrors the scoring rules in ../leaderboard.js exactly — keep both in sync
if either changes:

  Round 1 (matching)   score = moves*10 + seconds
  Round 2 (sorting)    score = seconds*10 + mistakes
  Overall              score = round1Score + round2Score

Unlike the localStorage placeholder (which trusts the client's own
computation), this server ALWAYS recomputes every score itself from the raw
moves/seconds/mistakes a client submits — a Round 2 submission's overall
score is round2's own score plus the student's most recent Round 1 result
already on file, never a client-supplied number. Some cheap sanity bounds
(moves >= pairs, a minimum plausible time per pair) reject the laziest fake
submissions too. None of this is airtight — nothing server-side can fully
verify gameplay the server never observed — but it closes the trivial
"POST any number you like" hole.

The Overall leaderboard is aggregated per student: best score, with a
capped bonus for repeat play within the past week (-5/session, capped at
-25). All-time shows best score ever, no bonus.

Runs as an Azure Function (see function_app.py) via the ASGI adapter, so
this file itself is just a plain FastAPI app — nothing Azure-specific here
except how the database connection is obtained (db.py).
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import get_db, init_db, rows_to_dicts

REPETITION_BONUS_PER_SESSION = 5
REPETITION_BONUS_MAX = 25

# Update this list if the game ever moves to a different origin.
ALLOWED_ORIGINS = [
    "https://games.klayonstudio.com",
    "https://klayonstudio.github.io",
]

app = FastAPI(title="FuncMons Leaderboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


class ResultIn(BaseModel):
    studentId: str
    schoolYear: Optional[str] = None
    campus: Optional[str] = None
    className: Optional[str] = None
    pairs: int
    round: int
    moves: Optional[int] = None
    mistakes: Optional[int] = None
    seconds: int


def compute_round1_score(moves: int, seconds: int) -> int:
    return moves * 10 + seconds


def compute_round2_score(seconds: int, mistakes: int) -> int:
    return seconds * 10 + mistakes


# Cheap, deliberately loose sanity bounds — not meant to catch a determined
# cheater (nothing client-submitted can be fully trusted), just the trivial
# "POST a fake score without playing" case. A perfect Round 1 needs exactly
# `pairs` moves; the game's own built-in per-match delay means even a
# flawless run takes at least ~0.4s/pair, so 1 full second/pair is a very
# generous floor that no real play could undercut.
MIN_SECONDS_PER_PAIR = 1


class ClaimIn(BaseModel):
    className: str
    studentId: str
    deviceToken: str


@app.post("/claim-id")
def claim_id(claim: ClaimIn):
    """Call before starting a game. Succeeds if this (class, studentId) is
    unclaimed, or already claimed by this same deviceToken (a returning
    student on the same browser). Fails with 409 if a different device
    already claimed that ID in that class — the frontend should show that
    as 'pick a different Student ID', not a hard error."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT device_token FROM id_claims WHERE class_name = ? AND student_id = ?",
        (claim.className, claim.studentId),
    )
    existing = rows_to_dicts(cursor)

    if not existing:
        cursor.execute(
            "INSERT INTO id_claims (class_name, student_id, device_token, created_at) VALUES (?, ?, ?, ?)",
            (claim.className, claim.studentId, claim.deviceToken, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        conn.close()
        return {"ok": True}

    conn.close()
    if existing[0]["device_token"] == claim.deviceToken:
        return {"ok": True}

    raise HTTPException(409, f"Student ID '{claim.studentId}' is already in use for {claim.className}.")


@app.post("/results")
def submit_result(result: ResultIn):
    if result.round not in (1, 2):
        raise HTTPException(400, "round must be 1 or 2")
    if result.pairs <= 0:
        raise HTTPException(400, "pairs must be positive")

    min_seconds = result.pairs * MIN_SECONDS_PER_PAIR
    if result.seconds < min_seconds:
        raise HTTPException(400, f"seconds too low for {result.pairs} pairs")

    conn = get_db()
    cursor = conn.cursor()

    if result.round == 1:
        if result.moves is None or result.moves < result.pairs:
            conn.close()
            raise HTTPException(400, "moves must be at least pairs for round 1")
        score = compute_round1_score(result.moves, result.seconds)
    else:
        if result.mistakes is None or result.mistakes < 0:
            conn.close()
            raise HTTPException(400, "mistakes must be a non-negative number for round 2")

        # overallScore is never trusted from the client — it's recomputed
        # here from this submission's own round2 score plus the student's
        # most recent Round 1 result for this same class/pairs. If there's
        # no Round 1 on record, there's nothing legitimate to attach a
        # Round 2 submission to.
        cursor.execute(
            """
            SELECT TOP 1 score FROM results
            WHERE student_id = ? AND class_name = ? AND pairs = ? AND round = 1
            ORDER BY played_at DESC
            """,
            (result.studentId, result.className, result.pairs),
        )
        round1_rows = rows_to_dicts(cursor)
        if not round1_rows:
            conn.close()
            raise HTTPException(400, "no Round 1 result on record for this student/class/pairs")

        round2_score = compute_round2_score(result.seconds, result.mistakes)
        score = round1_rows[0]["score"] + round2_score

    cursor.execute(
        """
        INSERT INTO results
            (student_id, school_year, campus, class_name, pairs, round, moves, mistakes, seconds, score, played_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            result.studentId,
            result.schoolYear,
            result.campus,
            result.className,
            result.pairs,
            result.round,
            result.moves,
            result.mistakes,
            result.seconds,
            score,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


def is_within_past_week(played_at: str) -> bool:
    played = datetime.fromisoformat(played_at)
    if played.tzinfo is None:
        played = played.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - played <= timedelta(days=7)


@app.get("/leaderboard")
def get_leaderboard(pairs: int, round: int, schoolYear: str, campus: str, className: str, range: str = "week"):
    """Round 1's own leaderboard — one row per session, not aggregated.
    Scoped to one school year + campus + class at a time, so e.g. Math
    204-1 and Math 207, or two campuses, or a repeated future term never
    mix on the same board."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM results WHERE pairs = ? AND round = ? AND school_year = ? AND campus = ? AND class_name = ?",
        (pairs, round, schoolYear, campus, className),
    )
    rows = rows_to_dicts(cursor)
    conn.close()

    if range == "week":
        rows = [r for r in rows if is_within_past_week(r["played_at"])]

    rows = sorted(rows, key=lambda r: r["score"])[:10]
    return [
        {
            "studentId": r["student_id"],
            "moves": r["moves"],
            "seconds": r["seconds"],
            "score": r["score"],
            "playedAt": r["played_at"],
        }
        for r in rows
    ]


@app.get("/leaderboard/overall")
def get_overall_leaderboard(pairs: int, schoolYear: str, campus: str, className: str, range: str = "week"):
    """Round 2's 'Overall' leaderboard — aggregated per student, best score
    plus a capped repetition bonus for This Week (none for All-Time). Scoped
    to one school year + campus + class, same as get_leaderboard above."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM results WHERE pairs = ? AND round = 2 AND school_year = ? AND campus = ? AND class_name = ?",
        (pairs, schoolYear, campus, className),
    )
    rows = rows_to_dicts(cursor)
    conn.close()

    if range == "week":
        rows = [r for r in rows if is_within_past_week(r["played_at"])]

    by_student = {}
    for r in rows:
        entry = by_student.setdefault(r["student_id"], {"bestScore": None, "sessions": 0})
        entry["sessions"] += 1
        if entry["bestScore"] is None or r["score"] < entry["bestScore"]:
            entry["bestScore"] = r["score"]

    result_rows = []
    for student_id, entry in by_student.items():
        bonus = (
            min(entry["sessions"] * REPETITION_BONUS_PER_SESSION, REPETITION_BONUS_MAX)
            if range == "week"
            else 0
        )
        result_rows.append(
            {
                "studentId": student_id,
                "sessions": entry["sessions"],
                "score": max(0, entry["bestScore"] - bonus),
            }
        )

    result_rows.sort(key=lambda r: r["score"])
    return result_rows[:10]


@app.get("/health")
def health():
    return {"ok": True}
