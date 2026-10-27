"""SQLite storage: schema, connections and small row helpers."""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL CHECK (role IN ('STUDENT','FACULTY','ADMIN')),
    avatar TEXT,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 3,
    department_id TEXT,
    semester INTEGER
);

CREATE TABLE IF NOT EXISTS faculty (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    department_id TEXT,
    employee_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
    designation TEXT NOT NULL DEFAULT 'Assistant Professor',
    avatar TEXT
);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    roll_number TEXT NOT NULL,
    enrollment_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    department_id TEXT,
    semester INTEGER NOT NULL,
    division TEXT NOT NULL,
    avatar TEXT
);

-- Face embeddings: one row per student, several 128-D samples each.
CREATE TABLE IF NOT EXISTS face_profiles (
    student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TEXT NOT NULL,
    enrolled_by TEXT,
    photo_url TEXT,
    descriptors TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    faculty_id TEXT NOT NULL DEFAULT '',
    semester INTEGER NOT NULL,
    division TEXT NOT NULL,
    room TEXT NOT NULL DEFAULT '',
    schedule_time TEXT NOT NULL DEFAULT '',
    day_of_week TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    UNIQUE (student_id, class_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    faculty_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED')),
    topic TEXT,
    mode TEXT NOT NULL DEFAULT 'QR',
    require_location INTEGER NOT NULL DEFAULT 0,
    latitude REAL,
    longitude REAL,
    radius_m INTEGER
);

CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
    marked_at TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('QR','MANUAL','FACE')),
    confidence REAL,
    marked_by TEXT,
    face_distance REAL,
    liveness TEXT,
    UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_records_student ON records(student_id);
CREATE INDEX IF NOT EXISTS idx_records_class ON records(class_id);

CREATE TABLE IF NOT EXISTS correction_requests (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    roll_number TEXT NOT NULL,
    session_id TEXT,
    class_id TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    faculty_comment TEXT,
    reviewed_by TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_applications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    roll_number TEXT NOT NULL,
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    document_name TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    faculty_comment TEXT,
    reviewed_by TEXT,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    type TEXT NOT NULL,
    affects_attendance INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extra_classes (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    faculty_id TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room TEXT NOT NULL,
    topic TEXT NOT NULL,
    reason TEXT NOT NULL,
    is_conducted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    author TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Outbox of attendance warning notices (email is sent when SMTP is configured).
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    channel TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    """Server-local wall-clock time (no offset), matching how lecture dates are compared."""
    return datetime.now().isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


@contextmanager
def transaction(write: bool = True) -> Iterator[sqlite3.Connection]:
    """Open a connection; for writes take the lock up front so check-then-insert is atomic."""
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


# Columns added after the first release; created on older databases at startup.
_ADDED_COLUMNS = {
    "records": {"face_distance": "REAL", "liveness": "TEXT"},
}


def init_schema() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        for table, cols in _ADDED_COLUMNS.items():
            have = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            for col, typ in cols.items():
                if col not in have:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    finally:
        conn.close()


def row(r: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(r) if r is not None else None


def rows(rs: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rs]


def get_setting(conn: sqlite3.Connection, key: str, default: Any) -> Any:
    r = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def set_setting(conn: sqlite3.Connection, key: str, value: Any) -> None:
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value)),
    )
