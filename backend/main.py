"""
FuncMons leaderboard API.

Mirrors the scoring rules in ../leaderboard.js exactly — keep both in sync
if either changes:

  Round 1 (matching)   score = moves*10 + seconds
  Round 2 (sorting)    score = seconds*10 + mistakes
  Overall              score = round1Score + round2Score (computed
                       client-side and submitted as overallScore, same as
                       the localStorage placeholder does today)

The Overall leaderboard is aggregated per student: best score, with a
capped bonus for repeat play within the past week (-5/session, capped at
-25). All-time shows best score ever, no bonus.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import sqlite3
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = Path(__file__).parent / "funcmons.db"

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


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            school_year TEXT,
            campus TEXT,
            class_name TEXT,
            pairs INTEGER NOT NULL,
            round INTEGER NOT NULL,
            moves INTEGER,
            mistakes INTEGER,
            seconds INTEGER NOT NULL,
            score INTEGER NOT NULL,
            played_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


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
    overallScore: Optional[int] = None


def compute_round1_score(moves: int, seconds: int) -> int:
    return moves * 10 + seconds


@app.post("/results")
def submit_result(result: ResultIn):
    if result.round not in (1, 2):
        raise HTTPException(400, "round must be 1 or 2")

    if result.round == 1:
        if result.moves is None:
            raise HTTPException(400, "moves is required for round 1")
        score = compute_round1_score(result.moves, result.seconds)
    else:
        if result.overallScore is None:
            raise HTTPException(400, "overallScore is required for round 2")
        score = result.overallScore

    conn = get_db()
    conn.execute(
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
def get_leaderboard(pairs: int, round: int, range: str = "week"):
    """Round 1's own leaderboard — one row per session, not aggregated."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM results WHERE pairs = ? AND round = ?", (pairs, round)
    ).fetchall()
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
def get_overall_leaderboard(pairs: int, range: str = "week"):
    """Round 2's 'Overall' leaderboard — aggregated per student, best score
    plus a capped repetition bonus for This Week (none for All-Time)."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM results WHERE pairs = ? AND round = 2", (pairs,)
    ).fetchall()
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
