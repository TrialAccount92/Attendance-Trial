"""One call that returns everything the signed-in user is allowed to see."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..db import get_setting, rows, transaction
from ..deps import Actor, current_actor
from ..services import all_rows, bools, session_out, student_out

router = APIRouter(prefix="/api", tags=["state"])

USER_COLS = "id, name, email, role, avatar, created_at"


def _faces(conn, student_ids: list[str] | None) -> dict[str, dict]:
    sql = "SELECT student_id, enrolled_at, photo_url, descriptors FROM face_profiles"
    data = rows(conn.execute(sql).fetchall())
    wanted = None if student_ids is None else set(student_ids)
    return {f["student_id"]: f for f in data if wanted is None or f["student_id"] in wanted}


@router.get("/state")
def get_state(actor: Actor = Depends(current_actor)):
    with transaction(write=False) as conn:
        common = {
            "departments": all_rows(conn, "SELECT * FROM departments ORDER BY name"),
            "subjects": all_rows(conn, "SELECT * FROM subjects ORDER BY code"),
            "faculty": all_rows(conn, "SELECT * FROM faculty ORDER BY name"),
            "classes": all_rows(conn, "SELECT * FROM classes"),
            "academic_events": bools(all_rows(conn, "SELECT * FROM academic_events ORDER BY start_date"), "affects_attendance"),
            "extra_classes": bools(all_rows(conn, "SELECT * FROM extra_classes ORDER BY date"), "is_conducted"),
            "announcements": all_rows(conn, "SELECT * FROM announcements ORDER BY date DESC, rowid DESC"),
            "settings": {"min_attendance_threshold": get_setting(conn, "min_attendance_threshold", 0.75)},
        }

        if actor.is_admin:
            students = all_rows(conn, "SELECT * FROM students ORDER BY semester, division, roll_number")
            faces = _faces(conn, None)
            scoped = {
                "users": all_rows(conn, f"SELECT {USER_COLS} FROM users ORDER BY role, name"),
                "students": [student_out(s, faces.get(s["id"]), include_face_detail=True) for s in students],
                "enrollments": all_rows(conn, "SELECT * FROM enrollments"),
                "sessions": [session_out(s) for s in all_rows(conn, "SELECT * FROM sessions ORDER BY start_time DESC")],
                "records": all_rows(conn, "SELECT * FROM records"),
                "correction_requests": all_rows(conn, "SELECT * FROM correction_requests ORDER BY created_at DESC"),
                "leave_applications": all_rows(conn, "SELECT * FROM leave_applications ORDER BY applied_at DESC"),
            }

        elif actor.role == "FACULTY":
            fid = actor.faculty["id"]
            my_classes = "SELECT id FROM classes WHERE faculty_id = ?"
            my_students = f"SELECT student_id FROM enrollments WHERE class_id IN ({my_classes})"
            students = all_rows(
                conn, f"SELECT * FROM students WHERE id IN ({my_students}) ORDER BY semester, division, roll_number", (fid,)
            )
            faces = _faces(conn, [s["id"] for s in students])
            scoped = {
                "users": [actor.user],
                "students": [student_out(s, faces.get(s["id"]), include_face_detail=True) for s in students],
                "enrollments": all_rows(conn, f"SELECT * FROM enrollments WHERE class_id IN ({my_classes})", (fid,)),
                "sessions": [session_out(s) for s in all_rows(
                    conn, f"SELECT * FROM sessions WHERE class_id IN ({my_classes}) ORDER BY start_time DESC", (fid,))],
                "records": all_rows(conn, f"SELECT * FROM records WHERE class_id IN ({my_classes})", (fid,)),
                "correction_requests": all_rows(
                    conn, f"SELECT * FROM correction_requests WHERE class_id IN ({my_classes}) ORDER BY created_at DESC", (fid,)),
                "leave_applications": all_rows(
                    conn, f"SELECT * FROM leave_applications WHERE student_id IN ({my_students}) ORDER BY applied_at DESC", (fid,)),
            }

        else:  # STUDENT: only their own data
            sid = actor.student["id"]
            faces = _faces(conn, [sid])
            my_classes = "SELECT class_id FROM enrollments WHERE student_id = ?"
            scoped = {
                "users": [actor.user],
                "students": [student_out(actor.student, faces.get(sid), include_face_detail=True)],
                "enrollments": all_rows(conn, "SELECT * FROM enrollments WHERE student_id = ?", (sid,)),
                "sessions": [session_out(s) for s in all_rows(
                    conn, f"SELECT * FROM sessions WHERE class_id IN ({my_classes}) ORDER BY start_time DESC", (sid,))],
                "records": all_rows(conn, "SELECT * FROM records WHERE student_id = ?", (sid,)),
                "correction_requests": all_rows(
                    conn, "SELECT * FROM correction_requests WHERE student_id = ? ORDER BY created_at DESC", (sid,)),
                "leave_applications": all_rows(
                    conn, "SELECT * FROM leave_applications WHERE student_id = ? ORDER BY applied_at DESC", (sid,)),
            }

    # lecture_at = when the lecture took place (marked_at is when the mark was made).
    started = {sess["id"]: sess["start_time"] for sess in scoped["sessions"]}
    for r in scoped["records"]:
        r.pop("marked_by", None)
        r["lecture_at"] = started.get(r["session_id"], r["marked_at"])
    scoped["records"].sort(key=lambda r: r["lecture_at"], reverse=True)
    return {
        "me": {
            "user": actor.user,
            "student_id": actor.student["id"] if actor.student else None,
            "faculty_id": actor.faculty["id"] if actor.faculty else None,
        },
        **common,
        **scoped,
    }
