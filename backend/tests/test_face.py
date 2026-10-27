"""Face matching + liveness, using landmarks/descriptors measured on real webcam footage.

fixtures/face_tracks.json holds what face-api.js measured on two real people
("female", "male") turning their heads, and on a printed photo of "female"
being tilted, rotated and rescaled in front of the camera ("photo").
Enrollment uses frames 0-149 of each clip; marking uses frames 150-299, so
the server never sees the exact same frame twice.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from app import face as facelib
from app import liveness
from conftest import login

FIX = json.loads((Path(__file__).parent / "fixtures" / "face_tracks.json").read_text())


def window(who: str, lo: int, hi: int, *, with_desc: bool = True) -> list[dict]:
    out = []
    for f in FIX[who]:
        if lo <= f["i"] < hi:
            frame = {"t": f["t"], "p": f["p"]}
            if with_desc and "d" in f:
                frame["d"] = f["d"]
            out.append(frame)
    return out


def track(frames):
    return liveness.parse_track(frames)


# ── Liveness on real footage ────────────────────────────────────────────────


@pytest.mark.parametrize("who,lo,hi", [("female", 200, 250), ("male", 200, 250), ("female", 0, 60)])
def test_real_head_turn_passes_classroom_check(who, lo, hi):
    assert liveness.check_passive(track(window(who, lo, hi))).ok


@pytest.mark.parametrize("who,lo,hi", [("female", 250, 300), ("male", 150, 200)])
def test_still_real_face_waits_for_movement(who, lo, hi):
    res = liveness.check_passive(track(window(who, lo, hi)))
    assert not res.ok and "turn" in res.reason


def test_photo_waved_around_never_passes():
    frames = window("photo", 0, 100)
    assert len(frames) == 60
    assert not liveness.check_passive(track(frames)).ok
    assert not liveness.check_active(track(frames)).ok


@pytest.mark.parametrize("who", ["female", "male"])
def test_enrollment_turn_both_ways_passes(who):
    assert liveness.check_active(track(window(who, 0, 150))).ok


def test_enrollment_without_turning_fails():
    assert not liveness.check_active(track(window("female", 250, 300))).ok


def test_yaw_ignores_moving_a_flat_photo():
    """Squeezing, rotating and scaling landmarks (what tilting a photo does) leaves yaw ~unchanged."""
    p = np.array(window("male", 0, 2)[0]["p"], dtype=float)
    base = liveness.yaw_of(p)
    c = p.mean(axis=0)
    for squeeze, angle, scale in [(0.6, 0, 1), (1, 30, 1), (0.75, -20, 1.4), (1, 0, 0.5)]:
        a = math.radians(angle)
        rot = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        moved = ((p - c) * [squeeze, 1]) @ rot.T * scale + c
        assert abs(liveness.yaw_of(moved) - base) < 0.03


def test_malformed_tracks_rejected():
    good = window("male", 0, 20)
    with pytest.raises(ValueError):
        liveness.parse_track([{**good[0], "p": good[0]["p"][:10]}])
    with pytest.raises(ValueError):
        liveness.parse_track(list(reversed(good)))


# ── Matching on real descriptors ────────────────────────────────────────────


def frontal_descriptors(who, lo, hi):
    frames = window(who, lo, hi)
    tr = track(frames)
    return np.array([f["d"] for f, t in zip(frames, tr) if "d" in f and t.frontal],
                    dtype=np.float32)


def test_identify_real_people_without_mixups():
    enrolled = {"stu-f": frontal_descriptors("female", 0, 150), "stu-m": frontal_descriptors("male", 0, 150)}
    gallery = facelib.Gallery(
        ["stu-f", "stu-m"], ["F", "M"], ["1", "2"],
        np.concatenate([enrolled["stu-f"], enrolled["stu-m"]]),
        np.array([0] * len(enrolled["stu-f"]) + [1] * len(enrolled["stu-m"]), dtype=np.int32),
    )
    right = wrong = unknown = 0
    for who, sid in [("female", "stu-f"), ("male", "stu-m")]:
        # One probe per call: identify() lets each student match only one face per frame.
        for probe in frontal_descriptors(who, 150, 300):
            m = facelib.identify(gallery, probe[None, :])[0]
            if m is None:
                unknown += 1
            elif m.student_id == sid:
                right += 1
            else:
                wrong += 1
    assert wrong == 0
    assert right >= 12 and right > 2 * unknown


# ── API ─────────────────────────────────────────────────────────────────────

FEMALE_STU, MALE_STU, OTHER_STU = "stu-12", "stu-13", "stu-14"  # all in Sem 3 Div A


@pytest.fixture(scope="module")
def enrolled(server):
    f = login(server, "EN202412", "password123")
    r = f.put(f"/api/students/{FEMALE_STU}/face", json={"frames": window("female", 0, 150), "photo": "data:image/jpeg;base64,AA"})
    assert r.status_code == 200, r.text
    m = login(server, "EN202413", "password123")
    r = m.put(f"/api/students/{MALE_STU}/face", json={"frames": window("male", 0, 150)})
    assert r.status_code == 200, r.text
    return True


def test_enroll_rejects_photo_and_still_face(server):
    s = login(server, "EN202415", "password123")
    r = s.put("/api/students/stu-15/face", json={"frames": window("photo", 0, 100)})
    assert r.status_code == 400 and "Liveness" in r.json()["detail"]
    r = s.put("/api/students/stu-15/face", json={"frames": window("female", 250, 300)})
    assert r.status_code == 400


def test_same_person_cannot_enroll_on_second_account(server, enrolled):
    s = login(server, "EN202414", "password123")
    r = s.put(f"/api/students/{OTHER_STU}/face", json={"frames": window("female", 150, 300)})
    assert r.status_code == 409 and "Kavya" in r.json()["detail"]


def test_enrolled_descriptors_never_leave_server(server, enrolled):
    fac = login(server, "EMP-101", "password123")
    assert fac.get("/api/classes/cls-dbms-3a/face-gallery").status_code in (404, 405)
    assert "descriptors" not in json.dumps(fac.get("/api/state").json())


def test_identify_endpoint(server, enrolled):
    fac = login(server, "EMP-101", "password123")
    probes = [frontal_descriptors("female", 250, 300)[0].tolist(), frontal_descriptors("male", 250, 300)[0].tolist()]
    r = fac.post("/api/classes/cls-dbms-3a/identify", json={"descriptors": probes}).json()
    assert [m and m["student_id"] for m in r["matches"]] == [FEMALE_STU, MALE_STU]
    assert r["enrolled_faces"] >= 2
    assert fac.post("/api/classes/cls-os-3a/identify", json={"descriptors": probes}).status_code == 403
    stu = login(server, "EN202401", "password123")
    assert stu.post("/api/classes/cls-dbms-3a/identify", json={"descriptors": probes}).status_code == 403


def test_face_mark_flow(server, enrolled):
    fac = login(server, "EMP-101", "password123")
    sess = fac.post("/api/sessions", json={"class_id": "cls-dbms-3a", "mode": "FACE"}).json()
    url = f"/api/sessions/{sess['id']}/face-mark"

    # Real face, but sitting still: matched, not yet marked.
    r = fac.post(url, json={"student_id": FEMALE_STU, "frames": window("female", 250, 300)}).json()
    assert r["status"] == "NEED_LIVENESS"

    # Wrong student claimed for this face.
    r = fac.post(url, json={"student_id": MALE_STU, "frames": window("female", 200, 250)})
    assert r.status_code == 400

    # A photo of her waved at the camera: identity may match, liveness never passes.
    r = fac.post(url, json={"student_id": FEMALE_STU, "frames": window("photo", 0, 100)})
    assert r.status_code == 400 or r.json()["status"] in ("NEED_LIVENESS", "NEED_FRONTAL")

    # Replaying her stored enrollment frames.
    r = fac.post(url, json={"student_id": FEMALE_STU, "frames": window("female", 0, 150)})
    assert r.status_code == 400 and "copy" in r.json()["detail"]

    # Real head turn: marked, with evidence stored.
    r = fac.post(url, json={"student_id": FEMALE_STU, "frames": window("female", 200, 250)}).json()
    assert r["status"] == "MARKED", r
    r = fac.post(url, json={"student_id": FEMALE_STU, "frames": window("female", 200, 250)}).json()
    assert r["status"] == "ALREADY_MARKED"

    r = fac.post(url, json={"student_id": MALE_STU, "frames": window("male", 200, 250)}).json()
    assert r["status"] == "MARKED", r

    recs = {x["student_id"]: x for x in fac.get("/api/state").json()["records"] if x["session_id"] == sess["id"]}
    assert recs[FEMALE_STU]["method"] == "FACE" and recs[FEMALE_STU]["liveness"].startswith("head-turn")
    assert 0.5 < recs[FEMALE_STU]["confidence"] <= 1

    # Too few front-facing frames.
    few = [f for f in window("male", 200, 250) if "d" not in f][:5]
    assert fac.post(url, json={"student_id": MALE_STU, "frames": few}).json()["status"] == "NEED_FRONTAL"
    fac.post(f"/api/sessions/{sess['id']}/close")
