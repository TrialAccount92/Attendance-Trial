"""Attendance sessions, QR check-in, face recognition marks, manual marks and roll call."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..config import settings
from ..db import new_id, now_iso, row, transaction
from ..deps import Actor, current_actor, require_class_access, require_roles, require_student_access
from ..security import current_qr, distance_m, parse_qr, verify_qr_token
from .. import face as facelib
from .. import liveness
from ..services import (
    close_session, finalize_absences, get_session, is_enrolled, session_out, subject_name_for_class, upsert_record,
)

router = APIRouter(prefix="/api", tags=["attendance"])

Status = Literal["PRESENT", "ABSENT", "LATE", "EXCUSED"]

MAX_FACE_SAMPLES = 8
# A face mark needs this many separate frontal frames that all match the student.
MIN_MARK_FRAMES = 3
MAX_IDENTIFY_FACES = 40


class StartSessionIn(BaseModel):
    class_id: str
    topic: str | None = Field(default=None, max_length=300)
    mode: Literal["QR", "FACE"] = "QR"
    require_location: bool = False
    latitude: float | None = None
    longitude: float | None = None
    radius_m: int | None = Field(default=None, ge=20, le=2000)


class QRCheckIn(BaseModel):
    payload: str = Field(max_length=500)
    latitude: float | None = None
    longitude: float | None = None


class FaceFrame(BaseModel):
    """One camera frame of one face: time (ms), 68 landmarks, and optionally its descriptor."""
    t: float
    p: list[list[float]]
    d: list[float] | None = None


class IdentifyIn(BaseModel):
    descriptors: list[list[float]] = Field(max_length=MAX_IDENTIFY_FACES)


class FaceMarkIn(BaseModel):
    student_id: str
    frames: list[FaceFrame] = Field(min_length=MIN_MARK_FRAMES, max_length=liveness.MAX_TRACK_FRAMES)


class ManualMarkIn(BaseModel):
    session_id: str
    student_id: str
    status: Status


class RollCallEntry(BaseModel):
    student_id: str
    status: Status


class RollCallIn(BaseModel):
    class_id: str
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    topic: str | None = Field(default=None, max_length=300)
    roster: list[RollCallEntry]


class FaceEnrollIn(BaseModel):
    frames: list[FaceFrame] = Field(min_length=5, max_length=liveness.MAX_TRACK_FRAMES)
    photo: str | None = Field(default=None, max_length=400_000)  # small JPEG data URL thumbnail

    @field_validator("photo")
    @classmethod
    def _photo(cls, v: str | None):
        if v and not v.startswith("data:image/"):
            raise ValueError("Photo must be an image data URL.")
        return v


def _split_frames(frames: list[FaceFrame]) -> tuple[list[liveness.TrackFrame], "facelib.np.ndarray"]:
    """Validate the track and return it with the descriptors of its frontal frames only."""
    try:
        track = liveness.parse_track([f.model_dump() for f in frames])
        frontal = [
            f.d for f, tf in zip(frames, track)
            if f.d is not None and tf.frontal
        ]
        probes = facelib.to_array(frontal) if frontal else facelib.np.zeros((0, facelib.DESCRIPTOR_LEN), dtype="float32")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return track, probes


def _owned_session(conn, actor: Actor, session_id: str) -> dict:
    sess = get_session(conn, session_id)
    if not sess:
        raise HTTPException(404, "Session not found.")
    require_class_access(conn, actor, sess["class_id"])
    return sess


# ── Sessions ─────────────────────────────────────────────────────────────────


@router.post("/sessions")
def start_session(body: StartSessionIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    if body.require_location and (body.latitude is None or body.longitude is None):
        raise HTTPException(400, "Location check needs the classroom's location. Allow location access and try again.")
    with transaction() as conn:
        cls = require_class_access(conn, actor, body.class_id)
        # One live session per faculty member: close their previous one properly.
        for old in conn.execute(
            "SELECT * FROM sessions WHERE status = 'ACTIVE' AND faculty_id = ?", (cls["faculty_id"],)
        ).fetchall():
            close_session(conn, dict(old))
        sess = {
            "id": new_id("sess"), "class_id": cls["id"], "faculty_id": cls["faculty_id"], "start_time": now_iso(),
            "end_time": None, "status": "ACTIVE", "topic": (body.topic or "").strip() or None, "mode": body.mode,
            "require_location": int(body.require_location),
            "latitude": body.latitude if body.require_location else None,
            "longitude": body.longitude if body.require_location else None,
            "radius_m": (body.radius_m or settings.default_geofence_m) if body.require_location else None,
        }
        conn.execute(
            """INSERT INTO sessions VALUES (:id, :class_id, :faculty_id, :start_time, :end_time, :status, :topic,
               :mode, :require_location, :latitude, :longitude, :radius_m)""",
            sess,
        )
    return session_out(sess)


@router.post("/sessions/{session_id}/close")
def end_session(session_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        sess = _owned_session(conn, actor, session_id)
        if sess["status"] != "ACTIVE":
            raise HTTPException(409, "This session is already closed.")
        absent = close_session(conn, sess)
        present = conn.execute(
            "SELECT COUNT(*) FROM records WHERE session_id = ? AND status IN ('PRESENT','LATE')", (session_id,)
        ).fetchone()[0]
    return {"ok": True, "present": present, "marked_absent": absent}


@router.get("/sessions/{session_id}/qr")
def session_qr(session_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction(write=False) as conn:
        sess = _owned_session(conn, actor, session_id)
    if sess["status"] != "ACTIVE":
        raise HTTPException(409, "Session is closed.")
    return current_qr(session_id)


# ── Student QR check-in ──────────────────────────────────────────────────────


@router.post("/attendance/qr")
def qr_check_in(body: QRCheckIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "STUDENT")
    parsed = parse_qr(body.payload)
    if not parsed:
        raise HTTPException(400, "This is not an AttendPulse attendance QR code.")
    session_id, token = parsed
    student = actor.student
    with transaction() as conn:
        sess = get_session(conn, session_id)
        if not sess:
            raise HTTPException(404, "Attendance session not found.")
        if sess["status"] != "ACTIVE":
            raise HTTPException(409, "This attendance session has already ended.")
        if not verify_qr_token(session_id, token):
            raise HTTPException(400, "This QR code has expired. Scan the code currently on the screen.")
        if not is_enrolled(conn, student["id"], sess["class_id"]):
            raise HTTPException(403, "You are not enrolled in this class.")
        if sess["require_location"]:
            if body.latitude is None or body.longitude is None:
                raise HTTPException(400, "This class requires your location. Allow location access and scan again.")
            dist = distance_m(body.latitude, body.longitude, sess["latitude"], sess["longitude"])
            if dist > (sess["radius_m"] or settings.default_geofence_m):
                raise HTTPException(403, f"You appear to be {int(dist)} m from the classroom. Check-in only works in class.")
        existing = row(conn.execute(
            "SELECT status FROM records WHERE session_id = ? AND student_id = ?", (session_id, student["id"])
        ).fetchone())
        if existing and existing["status"] in ("PRESENT", "LATE"):
            raise HTTPException(409, "Your attendance is already recorded for this session.")
        upsert_record(conn, sess, student["id"], "PRESENT", "QR", actor.user["id"])
        subject = subject_name_for_class(conn, sess["class_id"])
    return {"success": True, "message": f"Marked PRESENT for {subject}.", "subject": subject}


# ── Face recognition ─────────────────────────────────────────────────────────


@router.post("/classes/{class_id}/identify")
def identify_faces(class_id: str, body: IdentifyIn, actor: Actor = Depends(current_actor)):
    """Who are these faces? Matched on the server against the class's enrolled faces.

    Enrolled descriptors never leave the server; the browser only sends what it measured.
    """
    require_roles(actor, "FACULTY", "ADMIN")
    try:
        probes = facelib.to_array(body.descriptors) if body.descriptors else None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    with transaction(write=False) as conn:
        require_class_access(conn, actor, class_id)
        gallery = facelib.load_class_gallery(conn, class_id)
        enrolled_total = conn.execute("SELECT COUNT(*) FROM enrollments WHERE class_id = ?", (class_id,)).fetchone()[0]
    matches = facelib.identify(gallery, probes) if probes is not None else []
    return {
        "enrolled_faces": len(gallery),
        "enrolled_students": enrolled_total,
        "matches": [
            None if m is None else {
                "student_id": m.student_id, "name": m.name, "roll_number": m.roll_number,
                "distance": round(m.distance, 3), "confidence": m.confidence,
            }
            for m in matches
        ],
    }


@router.post("/sessions/{session_id}/face-mark")
def face_mark(session_id: str, body: FaceMarkIn, actor: Actor = Depends(current_actor)):
    """Mark a student present from a short face track.

    The server re-checks everything: every frontal descriptor must match this
    student (and not be a replayed stored sample), and the landmark track must
    show a real head turn (liveness). Returns status NEED_LIVENESS while the
    student hasn't moved enough yet; the scanner keeps collecting and retries.
    """
    require_roles(actor, "FACULTY", "ADMIN")
    track, probes = _split_frames(body.frames)
    if len(probes) < MIN_MARK_FRAMES:
        return {"status": "NEED_FRONTAL", "message": "Need a few clear, front-facing frames first."}
    with transaction() as conn:
        sess = _owned_session(conn, actor, session_id)
        if sess["status"] != "ACTIVE":
            raise HTTPException(409, "Session is closed.")
        if not is_enrolled(conn, body.student_id, sess["class_id"]):
            raise HTTPException(403, "Student is not enrolled in this class.")
        gallery = facelib.load_class_gallery(conn, sess["class_id"])
        ok, why, distance = facelib.verify_student(gallery, probes, body.student_id)
        if not ok:
            raise HTTPException(400, why)
        name = conn.execute("SELECT name FROM students WHERE id = ?", (body.student_id,)).fetchone()[0]
        existing = row(conn.execute(
            "SELECT status FROM records WHERE session_id = ? AND student_id = ?", (session_id, body.student_id)
        ).fetchone())
        if existing and existing["status"] in ("PRESENT", "LATE"):
            return {"status": "ALREADY_MARKED", "student_name": name, "message": f"{name} is already marked present."}
        live = liveness.check_passive(track)
        if not live.ok:
            return {
                "status": "NEED_LIVENESS", "student_name": name, "message": live.reason,
                "yaw_range": round(live.yaw_max - live.yaw_min, 3),
            }
        confidence = round(max(0.0, 1.0 - distance), 3)
        rec = upsert_record(conn, sess, body.student_id, "PRESENT", "FACE", actor.user["id"], confidence)
        conn.execute(
            "UPDATE records SET face_distance = ?, liveness = ? WHERE id = ?",
            (round(distance, 4), live.summary(), rec["id"]),
        )
    return {
        "status": "MARKED", "student_name": name, "confidence": confidence,
        "message": f"{name} marked PRESENT ({round(confidence * 100)}% match, head-turn verified).",
    }


@router.put("/students/{student_id}/face")
def enroll_face(student_id: str, body: FaceEnrollIn, actor: Actor = Depends(current_actor)):
    """Enroll a face from a live capture that includes a head turn to both sides."""
    track, probes = _split_frames(body.frames)
    if len(probes) < 3:
        raise HTTPException(400, "Need at least 3 clear, front-facing samples. Look straight at the camera and try again.")
    live = liveness.check_active(track)
    if not live.ok:
        raise HTTPException(400, f"Liveness check failed: {live.reason} Turn your head slowly left and right when asked.")
    samples = facelib.consistent_samples(probes)[:MAX_FACE_SAMPLES]
    if len(samples) < 3:
        raise HTTPException(400, "The samples did not look like the same person. Make sure only you are in front of the camera.")
    with transaction() as conn:
        stu = require_student_access(conn, actor, student_id)
        clash = facelib.find_duplicate(conn, student_id, samples)
        if clash:
            raise HTTPException(
                409, f"This face is already enrolled for another student ({clash}). Each person can enroll only once."
            )
        existing = row(conn.execute("SELECT photo_url FROM face_profiles WHERE student_id = ?", (student_id,)).fetchone())
        photo = body.photo or (existing or {}).get("photo_url")
        conn.execute(
            """INSERT INTO face_profiles(student_id, enrolled_at, enrolled_by, photo_url, descriptors) VALUES (?,?,?,?,?)
               ON CONFLICT(student_id) DO UPDATE SET enrolled_at = excluded.enrolled_at,
               enrolled_by = excluded.enrolled_by, photo_url = excluded.photo_url, descriptors = excluded.descriptors""",
            (student_id, now_iso(), actor.user["id"], photo,
             json.dumps([[round(float(x), 6) for x in d] for d in samples])),
        )
        if body.photo:
            conn.execute("UPDATE students SET avatar = ? WHERE id = ?", (body.photo, student_id))
    return {"ok": True, "student_id": stu["id"], "sample_count": len(samples), "liveness": live.summary()}


@router.delete("/students/{student_id}/face")
def delete_face(student_id: str, actor: Actor = Depends(current_actor)):
    with transaction() as conn:
        require_student_access(conn, actor, student_id)
        conn.execute("DELETE FROM face_profiles WHERE student_id = ?", (student_id,))
    return {"ok": True}


# ── Manual marking & roll call ───────────────────────────────────────────────


@router.put("/records")
def manual_mark(body: ManualMarkIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        sess = _owned_session(conn, actor, body.session_id)
        if not is_enrolled(conn, body.student_id, sess["class_id"]):
            raise HTTPException(403, "Student is not enrolled in this class.")
        rec = upsert_record(conn, sess, body.student_id, body.status, "MANUAL", actor.user["id"])
    rec.pop("marked_by", None)
    return rec


@router.post("/roll-call")
def roll_call(body: RollCallIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        cls = require_class_access(conn, actor, body.class_id)
        sess = {
            "id": new_id("sess"), "class_id": cls["id"], "faculty_id": cls["faculty_id"],
            "start_time": f"{body.date}T{now_iso()[11:19]}", "end_time": None, "status": "CLOSED",
            "topic": (body.topic or "").strip() or None, "mode": "MANUAL", "require_location": 0,
            "latitude": None, "longitude": None, "radius_m": None,
        }
        sess["end_time"] = sess["start_time"]
        conn.execute(
            """INSERT INTO sessions VALUES (:id, :class_id, :faculty_id, :start_time, :end_time, :status, :topic,
               :mode, :require_location, :latitude, :longitude, :radius_m)""",
            sess,
        )
        count = 0
        for entry in body.roster:
            if not is_enrolled(conn, entry.student_id, cls["id"]):
                continue
            upsert_record(conn, sess, entry.student_id, entry.status, "MANUAL", actor.user["id"])
            count += 1
        # Anyone enrolled but missing from the roster is absent (or excused on leave).
        finalize_absences(conn, sess)
    return {"recorded_count": count, "session_id": sess["id"]}
