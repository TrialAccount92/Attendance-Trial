"""Attendance business rules shared by several routes, plus row serializers."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .config import settings
from .db import new_id, now_iso, row, rows

# ── Serializers (shape matches src/types/index.ts) ───────────────────────────


def student_out(r: dict[str, Any], face: dict[str, Any] | None, include_face_detail: bool = False) -> dict[str, Any]:
    out = dict(r)
    out["face_registered"] = face is not None
    if face:
        out["face_photo"] = face.get("photo_url")
        if include_face_detail:
            out["face_profile"] = {
                "student_id": r["id"],
                "enrolled_at": face["enrolled_at"],
                "photo_url": face.get("photo_url") or "",
                "sample_count": len(json.loads(face["descriptors"])) if face.get("descriptors") else 0,
            }
    return out


def session_out(r: dict[str, Any]) -> dict[str, Any]:
    out = {k: r[k] for k in ("id", "class_id", "faculty_id", "start_time", "end_time", "status", "topic", "mode")}
    out["require_location"] = bool(r.get("require_location"))
    # QR codes are fetched from /api/sessions/{id}/qr by the session owner only.
    out["qr_token"] = ""
    out["token_generated_at"] = 0
    out["expires_at"] = 0
    out["token_refresh_interval_sec"] = settings.qr_interval_sec
    return out


def bools(items: list[dict[str, Any]], *keys: str) -> list[dict[str, Any]]:
    for it in items:
        for k in keys:
            it[k] = bool(it[k])
    return items


# ── Enrollment ───────────────────────────────────────────────────────────────


def enroll_student_in_cohort(conn: sqlite3.Connection, student: dict[str, Any]) -> int:
    """Enroll a student in every class of their semester + division."""
    cur = conn.execute(
        """INSERT OR IGNORE INTO enrollments(id, student_id, class_id)
           SELECT 'enr-' || ? || '-' || id, ?, id FROM classes WHERE semester = ? AND division = ?""",
        (student["id"], student["id"], student["semester"], student["division"]),
    )
    return cur.rowcount


def enroll_cohort_in_class(conn: sqlite3.Connection, cls: dict[str, Any]) -> int:
    cur = conn.execute(
        """INSERT OR IGNORE INTO enrollments(id, student_id, class_id)
           SELECT 'enr-' || id || '-' || ?, id, ? FROM students WHERE semester = ? AND division = ?""",
        (cls["id"], cls["id"], cls["semester"], cls["division"]),
    )
    return cur.rowcount


def is_enrolled(conn: sqlite3.Connection, student_id: str, class_id: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM enrollments WHERE student_id = ? AND class_id = ?", (student_id, class_id)
    ).fetchone() is not None


def enrolled_student_ids(conn: sqlite3.Connection, class_id: str) -> list[str]:
    return [r[0] for r in conn.execute("SELECT student_id FROM enrollments WHERE class_id = ?", (class_id,))]


# ── Leave ────────────────────────────────────────────────────────────────────


def has_approved_leave(conn: sqlite3.Connection, student_id: str, day: str) -> bool:
    return conn.execute(
        """SELECT 1 FROM leave_applications WHERE student_id = ? AND status = 'APPROVED'
           AND start_date <= ? AND end_date >= ? LIMIT 1""",
        (student_id, day, day),
    ).fetchone() is not None


def apply_leave_to_records(conn: sqlite3.Connection, leave: dict[str, Any]) -> int:
    """Turn absences that fall inside an approved leave into EXCUSED."""
    cur = conn.execute(
        """UPDATE records SET status = 'EXCUSED' WHERE student_id = ? AND status = 'ABSENT'
           AND session_id IN (SELECT id FROM sessions WHERE substr(start_time, 1, 10) BETWEEN ? AND ?)""",
        (leave["student_id"], leave["start_date"], leave["end_date"]),
    )
    return cur.rowcount


# ── Sessions & records ───────────────────────────────────────────────────────


def upsert_record(
    conn: sqlite3.Connection,
    session: dict[str, Any],
    student_id: str,
    status: str,
    method: str,
    marked_by: str | None,
    confidence: float | None = None,
) -> dict[str, Any]:
    existing = row(conn.execute(
        "SELECT * FROM records WHERE session_id = ? AND student_id = ?", (session["id"], student_id)
    ).fetchone())
    ts = now_iso()
    if existing:
        conn.execute(
            # A new mark replaces any earlier face evidence (face_mark re-adds its own).
            "UPDATE records SET status = ?, method = ?, marked_at = ?, marked_by = ?, confidence = ?,"
            " face_distance = NULL, liveness = NULL WHERE id = ?",
            (status, method, ts, marked_by, confidence, existing["id"]),
        )
        existing.update(status=status, method=method, marked_at=ts, marked_by=marked_by, confidence=confidence)
        return existing
    rec = {
        "id": new_id("rec"), "session_id": session["id"], "student_id": student_id,
        "class_id": session["class_id"], "status": status, "marked_at": ts, "method": method,
        "confidence": confidence, "marked_by": marked_by,
    }
    conn.execute(
        """INSERT INTO records(id, session_id, student_id, class_id, status, marked_at, method, confidence, marked_by)
           VALUES (:id, :session_id, :student_id, :class_id, :status, :marked_at, :method, :confidence, :marked_by)""",
        rec,
    )
    return rec


def finalize_absences(conn: sqlite3.Connection, session: dict[str, Any]) -> int:
    """Every enrolled student without a record gets ABSENT (or EXCUSED if on approved leave)."""
    day = session["start_time"][:10]
    have = {r[0] for r in conn.execute("SELECT student_id FROM records WHERE session_id = ?", (session["id"],))}
    count = 0
    for sid in enrolled_student_ids(conn, session["class_id"]):
        if sid in have:
            continue
        status = "EXCUSED" if has_approved_leave(conn, sid, day) else "ABSENT"
        conn.execute(
            "INSERT INTO records(id, session_id, student_id, class_id, status, marked_at, method) VALUES (?,?,?,?,?,?, 'MANUAL')",
            (new_id("rec"), session["id"], sid, session["class_id"], status, now_iso()),
        )
        count += 1
    return count


def close_session(conn: sqlite3.Connection, session: dict[str, Any]) -> int:
    conn.execute("UPDATE sessions SET status = 'CLOSED', end_time = ? WHERE id = ?", (now_iso(), session["id"]))
    return finalize_absences(conn, session)


def get_session(conn: sqlite3.Connection, session_id: str) -> dict[str, Any] | None:
    return row(conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone())


def subject_name_for_class(conn: sqlite3.Connection, class_id: str) -> str:
    r = conn.execute(
        "SELECT s.name FROM classes c JOIN subjects s ON s.id = c.subject_id WHERE c.id = ?", (class_id,)
    ).fetchone()
    return r[0] if r else "Class"


def add_announcement(conn: sqlite3.Connection, title: str, content: str, category: str, author: str) -> dict:
    ann = {"id": new_id("ann"), "title": title, "content": content, "date": now_iso()[:10],
           "category": category, "author": author}
    conn.execute("INSERT INTO announcements VALUES (:id, :title, :content, :date, :category, :author)", ann)
    return ann


def all_rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    return rows(conn.execute(sql, params).fetchall())
