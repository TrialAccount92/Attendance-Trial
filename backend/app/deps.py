"""Request authentication and role / ownership checks."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request

from .config import settings
from .db import connect, row
from .security import hash_token


@dataclass
class Actor:
    user: dict[str, Any]
    student: dict[str, Any] | None = None
    faculty: dict[str, Any] | None = None

    @property
    def role(self) -> str:
        return self.user["role"]

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"


def _raw_token(request: Request) -> str | None:
    token = request.cookies.get(settings.session_cookie)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def load_actor(conn: sqlite3.Connection, user_id: str) -> Actor | None:
    user = row(conn.execute(
        "SELECT id, name, email, role, avatar, created_at, must_change_password FROM users WHERE id = ?", (user_id,)
    ).fetchone())
    if not user:
        return None
    user["must_change_password"] = bool(user["must_change_password"])
    actor = Actor(user=user)
    if user["role"] == "STUDENT":
        actor.student = row(conn.execute("SELECT * FROM students WHERE user_id = ?", (user_id,)).fetchone())
    elif user["role"] == "FACULTY":
        actor.faculty = row(conn.execute("SELECT * FROM faculty WHERE user_id = ?", (user_id,)).fetchone())
    return actor


def current_actor(request: Request) -> Actor:
    token = _raw_token(request)
    if not token:
        raise HTTPException(401, "Not signed in.")
    conn = connect()
    try:
        tok = conn.execute(
            "SELECT user_id, expires_at FROM auth_tokens WHERE token_hash = ?", (hash_token(token),)
        ).fetchone()
        if not tok or datetime.fromisoformat(tok["expires_at"]) < datetime.now(timezone.utc):
            raise HTTPException(401, "Your session has expired. Please sign in again.")
        actor = load_actor(conn, tok["user_id"])
    finally:
        conn.close()
    if not actor:
        raise HTTPException(401, "Account no longer exists.")
    if actor.role == "STUDENT" and not actor.student:
        raise HTTPException(403, "Student profile missing for this account.")
    if actor.role == "FACULTY" and not actor.faculty:
        raise HTTPException(403, "Faculty profile missing for this account.")
    return actor


def require_roles(actor: Actor, *roles: str) -> None:
    if actor.role not in roles:
        raise HTTPException(403, "You do not have permission to do that.")


def require_class_access(conn: sqlite3.Connection, actor: Actor, class_id: str) -> dict[str, Any]:
    """Admins may act on any class, faculty only on classes they teach."""
    cls = row(conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone())
    if not cls:
        raise HTTPException(404, "Class not found.")
    if actor.is_admin:
        return cls
    if actor.role == "FACULTY" and actor.faculty and cls["faculty_id"] == actor.faculty["id"]:
        return cls
    raise HTTPException(403, "You can only manage classes you teach.")


def require_student_access(conn: sqlite3.Connection, actor: Actor, student_id: str) -> dict[str, Any]:
    """Admins: any student. Faculty: students enrolled in one of their classes. Students: themselves."""
    stu = row(conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone())
    if not stu:
        raise HTTPException(404, "Student not found.")
    if actor.is_admin:
        return stu
    if actor.role == "STUDENT" and actor.student and actor.student["id"] == student_id:
        return stu
    if actor.role == "FACULTY" and actor.faculty:
        hit = conn.execute(
            """SELECT 1 FROM enrollments e JOIN classes c ON c.id = e.class_id
               WHERE e.student_id = ? AND c.faculty_id = ? LIMIT 1""",
            (student_id, actor.faculty["id"]),
        ).fetchone()
        if hit:
            return stu
    raise HTTPException(403, "You do not have access to this student.")
