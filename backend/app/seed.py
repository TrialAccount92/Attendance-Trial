"""Demo data for a fresh database.

Demo logins (change or remove before real use):
  Admin    dean.academics@college.edu / admin2026
  Faculty  EMP-101 … EMP-108         / password123
  Students enrollment number or email / password123
No face profiles are seeded: students enroll their own face from the portal.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path

from .db import now_iso, set_setting
from .security import hash_password

SEED_FILE = Path(__file__).with_name("seed_data.json")

DEMO_STUDENT_PASSWORD = "password123"
DEMO_FACULTY_PASSWORD = "password123"
DEMO_ADMIN_PASSWORD = "admin2026"

# Lectures held so far per class, and how many of them Aarav (stu-1) attended.
CLASS_DISTRIBUTION = [
    ("cls-dbms-3a", 14, 12), ("cls-os-3a", 12, 10), ("cls-maths-3a", 10, 8),
    ("cls-py-3a", 8, 7), ("cls-toc-3a", 6, 5), ("cls-se-3a", 6, 6),
    ("cls-dbms-3b", 12, 0), ("cls-os-3b", 10, 0), ("cls-maths-3b", 8, 0), ("cls-py-3b", 8, 0),
    ("cls-cn-5a", 12, 0), ("cls-cloud-5a", 10, 0), ("cls-ml-5a", 10, 0), ("cls-ca-5a", 8, 0),
]

# Fixed attendance ratios for demo personas (defaulters / borderline cases).
PERSONA_RATIO = {
    "stu-3": 0.62, "stu-10": 0.55, "stu-14": 0.72, "stu-20": 0.64, "stu-24": 0.58,
    "stu-25": 0.73, "stu-28": 0.60, "stu-42": 0.63,
}


def _is_present(student: dict, session_num: int, total: int, aarav_present: int) -> tuple[bool, bool]:
    sid = student["id"]
    if sid == "stu-1":
        present = session_num <= aarav_present
        return present, present and session_num % 5 == 0
    if sid == "stu-2":
        return session_num != 3, False
    if sid in PERSONA_RATIO:
        return session_num <= round(total * PERSONA_RATIO[sid]), False
    seed = (int(student["roll_number"]) * 7 + session_num * 13) % 100
    present = seed > 18
    return present, present and seed > 90


def seed_database(conn: sqlite3.Connection) -> None:
    data = json.loads(SEED_FILE.read_text())
    today = date.today()
    created = now_iso()

    student_hash = hash_password(DEMO_STUDENT_PASSWORD)
    faculty_hash = hash_password(DEMO_FACULTY_PASSWORD)

    conn.execute(
        "INSERT INTO users(id, name, email, role, password_hash, created_at) VALUES (?,?,?,?,?,?)",
        ("usr-admin", "Dr. S. K. Kulkarni", "dean.academics@college.edu", "ADMIN",
         hash_password(DEMO_ADMIN_PASSWORD), created),
    )
    for d in data["departments"]:
        conn.execute("INSERT INTO departments VALUES (?,?,?)", (d["id"], d["name"], d["code"]))
    for s in data["subjects"]:
        conn.execute(
            "INSERT INTO subjects VALUES (?,?,?,?,?,?)",
            (s["id"], s["name"], s["code"], s["credits"], s["department_id"], s.get("semester")),
        )
    for f in data["faculty"]:
        conn.execute(
            "INSERT INTO users(id, name, email, role, password_hash, created_at) VALUES (?,?,?,?,?,?)",
            (f["user_id"], f["name"], f["email"], "FACULTY", faculty_hash, created),
        )
        conn.execute(
            "INSERT INTO faculty VALUES (?,?,?,?,?,?,?,?)",
            (f["id"], f["user_id"], f["name"], f["email"], f["department_id"], f["employee_id"],
             f["designation"], f.get("avatar")),
        )
    for s in data["students"]:
        conn.execute(
            "INSERT INTO users(id, name, email, role, avatar, password_hash, created_at) VALUES (?,?,?,?,?,?,?)",
            (s["user_id"], s["name"], s["email"], "STUDENT", s.get("avatar"), student_hash, created),
        )
        conn.execute(
            "INSERT INTO students VALUES (?,?,?,?,?,?,?,?,?,?)",
            (s["id"], s["user_id"], s["name"], s["email"], s["roll_number"], s["enrollment_number"],
             s["department_id"], s["semester"], s["division"], s.get("avatar")),
        )
    for c in data["classes"]:
        conn.execute(
            "INSERT INTO classes VALUES (?,?,?,?,?,?,?,?)",
            (c["id"], c["subject_id"], c["faculty_id"], c["semester"], c["division"], c["room"],
             c["schedule_time"], c["day_of_week"]),
        )
    # Cohort enrollment: every student takes every class of their semester + division.
    conn.execute(
        """INSERT INTO enrollments(id, student_id, class_id)
           SELECT 'enr-' || s.id || '-' || c.id, s.id, c.id
           FROM students s JOIN classes c ON c.semester = s.semester AND c.division = s.division"""
    )

    students = {s["id"]: s for s in data["students"]}
    classes = {c["id"]: c for c in data["classes"]}
    for class_id, total, aarav_present in CLASS_DISTRIBUTION:
        cls = classes[class_id]
        enrolled = [s for s in students.values() if s["semester"] == cls["semester"] and s["division"] == cls["division"]]
        for n in range(1, total + 1):
            day = today - timedelta(days=int((total - n + 1) * 2.2))
            if day.weekday() == 6:  # no lectures on Sunday
                day -= timedelta(days=1)
            session_id = f"sess-{class_id}-{n}"
            conn.execute(
                """INSERT INTO sessions(id, class_id, faculty_id, start_time, end_time, status, topic, mode)
                   VALUES (?,?,?,?,?, 'CLOSED', NULL, 'QR')""",
                (session_id, class_id, cls["faculty_id"], f"{day}T10:00:00", f"{day}T11:00:00"),
            )
            for stu in enrolled:
                present, late = _is_present(stu, n, total, aarav_present)
                status = "LATE" if late else ("PRESENT" if present else "ABSENT")
                method = ("MANUAL" if n % 3 == 0 else "QR") if present else "MANUAL"
                conn.execute(
                    "INSERT INTO records(id, session_id, student_id, class_id, status, marked_at, method) VALUES (?,?,?,?,?,?,?)",
                    (f"rec-{session_id}-{stu['id']}", session_id, stu["id"], class_id, status, f"{day}T10:05:00", method),
                )

    for r in data["correction_requests"]:
        conn.execute(
            """INSERT INTO correction_requests(id, student_id, student_name, roll_number, session_id, class_id,
               subject_name, date, reason, status, faculty_comment, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (r["id"], r["student_id"], r["student_name"], r["roll_number"], r.get("session_id"), r["class_id"],
             r["subject_name"], r["date"], r["reason"], r["status"], r.get("faculty_comment"), r["created_at"]),
        )
    for a in data["announcements"]:
        conn.execute(
            "INSERT INTO announcements VALUES (?,?,?,?,?,?)",
            (a["id"], a["title"], a["content"], a["date"], a["category"], a["author"]),
        )

    d = lambda days: (today + timedelta(days=days)).isoformat()  # noqa: E731
    leaves = [
        ("leave-1", "stu-1", "ON_DUTY_EVENT", d(-3), d(-2),
         "Representing college at Inter-Collegiate Smart India Hackathon finals.", None, "APPROVED",
         "Official duty approved. Attendance credit granted."),
        ("leave-2", "stu-2", "MEDICAL", d(1), d(2), "Viral fever and medical rest advised by physician.",
         "medical_certificate.pdf", "PENDING", None),
        ("leave-3", "stu-7", "SPORTS", d(3), d(4),
         "State University Cricket Tournament representational team squad.", None, "PENDING", None),
    ]
    for lid, sid, ltype, start, end, reason, doc, status, comment in leaves:
        stu = students[sid]
        conn.execute(
            """INSERT INTO leave_applications(id, student_id, student_name, roll_number, leave_type, start_date,
               end_date, reason, document_name, status, faculty_comment, applied_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (lid, sid, stu["name"], stu["roll_number"], ltype, start, end, reason, doc, status, comment, created),
        )
    # Apply the approved leave to the seeded absences it covers.
    conn.execute(
        """UPDATE records SET status = 'EXCUSED' WHERE student_id = 'stu-1' AND status = 'ABSENT'
           AND session_id IN (SELECT id FROM sessions WHERE substr(start_time, 1, 10) BETWEEN ? AND ?)""",
        (d(-3), d(-2)),
    )

    events = [
        ("ev-1", "Gandhi Jayanti (National Holiday)",
         "National holiday in commemoration of the birth anniversary of Mahatma Gandhi. College and labs remain closed.",
         "2026-10-02", "2026-10-02", "HOLIDAY", 1, "Academic Dean Office"),
        ("ev-2", "Mid-Term Examination Week (Odd Sem)",
         "Official centralized mid-semester assessment examinations across all engineering departments.",
         "2026-10-12", "2026-10-17", "EXAM_WEEK", 0, "Controller of Examinations"),
        ("ev-3", "Diwali & Autumn Semester Break",
         "Festival vacation for students and faculty. Regular lectures resume post-break.",
         "2026-11-01", "2026-11-06", "VACATION", 1, "Academic Dean Office"),
        ("ev-4", "PULSE 2026 — Annual Tech & Cultural Fest",
         "Three-day annual inter-collegiate technical symposium and cultural festival. All regular classes suspended for events.",
         "2026-11-19", "2026-11-21", "FESTIVAL", 1, "Student Affairs Council"),
        ("ev-5", "End-Semester Exam Form & Hall Ticket Verification",
         "Mandatory portal deadline for student hall ticket verification and detention clearance.",
         "2026-11-30", "2026-11-30", "ACADEMIC_DEADLINE", 0, "Controller of Examinations"),
    ]
    conn.executemany("INSERT INTO academic_events VALUES (?,?,?,?,?,?,?,?)", events)

    extras = [
        ("extra-1", "cls-dbms-3a", "fac-1", d(2), "10:00 AM", "11:30 AM", "Lab 301",
         "Red-Black Trees & Advanced Balancing", "Compensatory lecture for a missed holiday session", 0),
        ("extra-2", "cls-os-3a", "fac-2", d(4), "02:00 PM", "03:30 PM", "Room 204",
         "Process Scheduling Practice Problems", "Syllabus catch-up prior to Mid-Term assessments", 0),
    ]
    conn.executemany("INSERT INTO extra_classes VALUES (?,?,?,?,?,?,?,?,?,?)", extras)

    set_setting(conn, "min_attendance_threshold", 0.75)


def is_empty(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0


def wipe(conn: sqlite3.Connection) -> None:
    for table in (
        "notifications", "auth_tokens", "records", "sessions", "correction_requests", "leave_applications",
        "extra_classes", "enrollments", "face_profiles", "classes", "students", "faculty", "subjects",
        "departments", "academic_events", "announcements", "settings", "users",
    ):
        conn.execute(f"DELETE FROM {table}")
