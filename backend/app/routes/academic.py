"""Correction requests, leave, announcements, academic calendar, extra classes and warning notices."""
from __future__ import annotations

import smtplib
from email.message import EmailMessage
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from ..db import new_id, now_iso, row, transaction
from ..deps import Actor, current_actor, require_class_access, require_roles, require_student_access
from ..services import add_announcement, apply_leave_to_records, get_session, is_enrolled, subject_name_for_class, upsert_record

router = APIRouter(prefix="/api", tags=["academic"])

Review = Literal["APPROVED", "REJECTED"]
DATE = r"^\d{4}-\d{2}-\d{2}$"


class ReviewIn(BaseModel):
    status: Review
    comment: str | None = Field(default=None, max_length=500)


# ── Attendance correction requests ───────────────────────────────────────────


class CorrectionIn(BaseModel):
    session_id: str
    reason: str = Field(min_length=5, max_length=1000)


@router.post("/corrections")
def submit_correction(body: CorrectionIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "STUDENT")
    stu = actor.student
    with transaction() as conn:
        sess = get_session(conn, body.session_id)
        if not sess or not is_enrolled(conn, stu["id"], sess["class_id"]):
            raise HTTPException(404, "Lecture not found.")
        rec = row(conn.execute(
            "SELECT status FROM records WHERE session_id = ? AND student_id = ?", (sess["id"], stu["id"])
        ).fetchone())
        if rec and rec["status"] in ("PRESENT", "LATE", "EXCUSED"):
            raise HTTPException(400, "You are not marked absent for that lecture.")
        if conn.execute(
            "SELECT 1 FROM correction_requests WHERE student_id = ? AND session_id = ? AND status = 'PENDING'",
            (stu["id"], sess["id"]),
        ).fetchone():
            raise HTTPException(409, "You already have a pending request for that lecture.")
        req = {
            "id": new_id("req"), "student_id": stu["id"], "student_name": stu["name"], "roll_number": stu["roll_number"],
            "session_id": sess["id"], "class_id": sess["class_id"],
            "subject_name": subject_name_for_class(conn, sess["class_id"]), "date": sess["start_time"][:10],
            "reason": body.reason.strip(), "status": "PENDING", "faculty_comment": None, "reviewed_by": None,
            "created_at": now_iso(),
        }
        conn.execute(
            """INSERT INTO correction_requests VALUES (:id, :student_id, :student_name, :roll_number, :session_id,
               :class_id, :subject_name, :date, :reason, :status, :faculty_comment, :reviewed_by, :created_at)""",
            req,
        )
    return req


@router.post("/corrections/{request_id}/review")
def review_correction(request_id: str, body: ReviewIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        req = row(conn.execute("SELECT * FROM correction_requests WHERE id = ?", (request_id,)).fetchone())
        if not req:
            raise HTTPException(404, "Request not found.")
        require_class_access(conn, actor, req["class_id"])
        if req["status"] != "PENDING":
            raise HTTPException(409, "This request was already reviewed.")
        conn.execute(
            "UPDATE correction_requests SET status = ?, faculty_comment = ?, reviewed_by = ? WHERE id = ?",
            (body.status, (body.comment or "").strip() or None, actor.user["id"], request_id),
        )
        if body.status == "APPROVED":
            sess = get_session(conn, req["session_id"]) if req["session_id"] else None
            if not sess:
                # Older requests name only a date: fix the lecture of that class on that day.
                sess = row(conn.execute(
                    """SELECT s.* FROM sessions s JOIN records r ON r.session_id = s.id
                       WHERE s.class_id = ? AND substr(s.start_time, 1, 10) = ? AND r.student_id = ?
                       ORDER BY s.start_time LIMIT 1""",
                    (req["class_id"], req["date"], req["student_id"]),
                ).fetchone())
            if sess:
                upsert_record(conn, sess, req["student_id"], "PRESENT", "MANUAL", actor.user["id"])
    return {"ok": True}


# ── Leave applications ───────────────────────────────────────────────────────


class LeaveIn(BaseModel):
    leave_type: Literal["MEDICAL", "ON_DUTY_EVENT", "SPORTS", "PERSONAL"]
    start_date: str = Field(pattern=DATE)
    end_date: str = Field(pattern=DATE)
    reason: str = Field(min_length=5, max_length=1000)
    document_name: str | None = Field(default=None, max_length=200)


@router.post("/leaves")
def apply_leave(body: LeaveIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "STUDENT")
    if body.end_date < body.start_date:
        raise HTTPException(400, "End date is before start date.")
    stu = actor.student
    leave = {
        "id": new_id("leave"), "student_id": stu["id"], "student_name": stu["name"], "roll_number": stu["roll_number"],
        "leave_type": body.leave_type, "start_date": body.start_date, "end_date": body.end_date,
        "reason": body.reason.strip(), "document_name": body.document_name, "status": "PENDING",
        "faculty_comment": None, "reviewed_by": None, "applied_at": now_iso(),
    }
    with transaction() as conn:
        conn.execute(
            """INSERT INTO leave_applications VALUES (:id, :student_id, :student_name, :roll_number, :leave_type,
               :start_date, :end_date, :reason, :document_name, :status, :faculty_comment, :reviewed_by, :applied_at)""",
            leave,
        )
    return leave


@router.post("/leaves/{leave_id}/review")
def review_leave(leave_id: str, body: ReviewIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        leave = row(conn.execute("SELECT * FROM leave_applications WHERE id = ?", (leave_id,)).fetchone())
        if not leave:
            raise HTTPException(404, "Leave application not found.")
        require_student_access(conn, actor, leave["student_id"])
        if leave["status"] != "PENDING":
            raise HTTPException(409, "This application was already reviewed.")
        conn.execute(
            "UPDATE leave_applications SET status = ?, faculty_comment = ?, reviewed_by = ? WHERE id = ?",
            (body.status, (body.comment or "").strip() or None, actor.user["id"], leave_id),
        )
        excused = apply_leave_to_records(conn, leave) if body.status == "APPROVED" else 0
    return {"ok": True, "excused_records": excused}


# ── Announcements ────────────────────────────────────────────────────────────


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=5000)
    category: Literal["GENERAL", "ACADEMIC", "ATTENDANCE", "ALERT"] = "GENERAL"


@router.post("/announcements")
def post_announcement(body: AnnouncementIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        return add_announcement(conn, body.title.strip(), body.content.strip(), body.category, actor.user["name"])


# ── Academic calendar ────────────────────────────────────────────────────────


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_date: str = Field(pattern=DATE)
    end_date: str = Field(pattern=DATE)
    type: Literal["HOLIDAY", "EXAM_WEEK", "FESTIVAL", "VACATION", "ACADEMIC_DEADLINE"]
    affects_attendance: bool = False
    created_by: str | None = None


@router.post("/events")
def add_event(body: EventIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    if body.end_date < body.start_date:
        raise HTTPException(400, "End date is before start date.")
    ev = {**body.model_dump(), "id": new_id("ev"), "created_by": body.created_by or actor.user["name"]}
    with transaction() as conn:
        conn.execute(
            """INSERT INTO academic_events VALUES (:id, :title, :description, :start_date, :end_date, :type,
               :affects_attendance, :created_by)""",
            {**ev, "affects_attendance": int(ev["affects_attendance"])},
        )
        span = body.start_date if body.start_date == body.end_date else f"{body.start_date} to {body.end_date}"
        add_announcement(
            conn, f"Academic Calendar: {body.title}",
            f'"{body.title}" ({span}) has been added to the college calendar.'
            + (" Classes are suspended." if body.affects_attendance else ""),
            "ACADEMIC", actor.user["name"],
        )
    return ev


@router.delete("/events/{event_id}")
def remove_event(event_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        conn.execute("DELETE FROM academic_events WHERE id = ?", (event_id,))
    return {"ok": True}


# ── Extra / compensatory classes ─────────────────────────────────────────────


class ExtraClassIn(BaseModel):
    class_id: str
    date: str = Field(pattern=DATE)
    start_time: str = Field(min_length=1, max_length=20)
    end_time: str = Field(min_length=1, max_length=20)
    room: str = Field(min_length=1, max_length=60)
    topic: str = Field(min_length=1, max_length=300)
    reason: str = Field(default="", max_length=500)


@router.post("/extra-classes")
def schedule_extra_class(body: ExtraClassIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        cls = require_class_access(conn, actor, body.class_id)
        extra = {**body.model_dump(), "id": new_id("extra"), "faculty_id": cls["faculty_id"], "is_conducted": 0}
        conn.execute(
            """INSERT INTO extra_classes VALUES (:id, :class_id, :faculty_id, :date, :start_time, :end_time, :room,
               :topic, :reason, :is_conducted)""",
            extra,
        )
        add_announcement(
            conn, f"Extra Class: {subject_name_for_class(conn, cls['id'])}",
            f'An extra lecture is scheduled on {body.date} ({body.start_time}–{body.end_time}) in {body.room}. Topic: "{body.topic}".',
            "ACADEMIC", actor.user["name"],
        )
    extra["is_conducted"] = False
    return extra


def _owned_extra(conn, actor: Actor, extra_id: str) -> dict:
    extra = row(conn.execute("SELECT * FROM extra_classes WHERE id = ?", (extra_id,)).fetchone())
    if not extra:
        raise HTTPException(404, "Extra class not found.")
    require_class_access(conn, actor, extra["class_id"])
    return extra


@router.delete("/extra-classes/{extra_id}")
def cancel_extra_class(extra_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        _owned_extra(conn, actor, extra_id)
        conn.execute("DELETE FROM extra_classes WHERE id = ?", (extra_id,))
    return {"ok": True}


@router.post("/extra-classes/{extra_id}/conducted")
def mark_extra_conducted(extra_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        _owned_extra(conn, actor, extra_id)
        conn.execute("UPDATE extra_classes SET is_conducted = 1 WHERE id = ?", (extra_id,))
    return {"ok": True}


# ── Attendance warning notices ───────────────────────────────────────────────


class NoticeIn(BaseModel):
    student_ids: list[str] = Field(min_length=1, max_length=5000)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)


def _send_email(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password or "")
        smtp.send_message(msg)


@router.post("/notices/dispatch")
def dispatch_notices(body: NoticeIn, actor: Actor = Depends(current_actor)):
    """Email attendance warnings. Without SMTP configured they are only queued in the outbox."""
    require_roles(actor, "ADMIN")
    sent = queued = failed = 0
    with transaction() as conn:
        for sid in dict.fromkeys(body.student_ids):
            stu = row(conn.execute("SELECT id, name, email FROM students WHERE id = ?", (sid,)).fetchone())
            if not stu:
                continue
            text = body.message.replace("{name}", stu["name"])
            status, error = "QUEUED", None
            if settings.smtp_host:
                try:
                    _send_email(stu["email"], body.subject, text)
                    status = "SENT"
                except Exception as exc:  # noqa: BLE001 - report any delivery failure
                    status, error = "FAILED", str(exc)[:300]
            conn.execute(
                "INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?,?)",
                (new_id("ntf"), stu["id"], stu["email"], "EMAIL", body.subject, text, status, error, now_iso()),
            )
            sent += status == "SENT"
            queued += status == "QUEUED"
            failed += status == "FAILED"
    return {"sent": sent, "queued": queued, "failed": failed, "email_configured": bool(settings.smtp_host)}
