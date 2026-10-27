"""End-to-end API tests against a throwaway database (see conftest.py).

Run from the backend folder:  python -m pytest -q
"""
from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app import security
from app.main import app
from conftest import login


# ── Auth ─────────────────────────────────────────────────────────────────────


def test_wrong_password_rejected(server):
    r = server.post("/api/auth/login", json={"identifier": "EN202401", "password": "nope"})
    assert r.status_code == 401


def test_unknown_user_rejected_not_defaulted(server):
    r = server.post("/api/auth/login", json={"identifier": "nobody@x.edu", "password": "password123"})
    assert r.status_code == 401


def test_ambiguous_roll_number_rejected(server):
    # Roll "01" exists in several divisions, so it can't identify one student.
    r = server.post("/api/auth/login", json={"identifier": "01", "password": "password123"})
    assert r.status_code == 401


def test_role_tab_mismatch(server):
    r = server.post("/api/auth/login", json={"identifier": "EMP-101", "password": "password123", "role": "ADMIN"})
    assert r.status_code == 403


def test_state_requires_login(server):
    assert TestClient(app).get("/api/state").status_code == 401


def test_lockout_after_failures(server):
    c = TestClient(app)
    for _ in range(5):
        c.post("/api/auth/login", json={"identifier": "EMP-108", "password": "bad"})
    r = c.post("/api/auth/login", json={"identifier": "EMP-108", "password": "password123"})
    assert r.status_code == 429
    security._failures.clear()


def test_logout_invalidates_session(server):
    c = login(server, "EMP-102", "password123")
    assert c.get("/api/state").status_code == 200
    c.post("/api/auth/logout")
    assert c.get("/api/state").status_code == 401


# ── Data scoping ─────────────────────────────────────────────────────────────


def test_student_sees_only_own_data(server):
    c = login(server, "EN202401", "password123", "STUDENT")
    st = c.get("/api/state").json()
    assert [s["id"] for s in st["students"]] == ["stu-1"]
    assert {r["student_id"] for r in st["records"]} == {"stu-1"}
    assert all(s["qr_token"] == "" for s in st["sessions"])
    assert len(st["users"]) == 1


def test_student_cannot_call_staff_endpoints(server):
    c = login(server, "EN202401", "password123")
    assert c.post("/api/sessions", json={"class_id": "cls-dbms-3a"}).status_code == 403
    assert c.post("/api/classes/cls-dbms-3a/identify", json={"descriptors": []}).status_code == 403
    assert c.post("/api/students", json={"name": "X", "roll_number": "99"}).status_code == 403
    assert c.put("/api/settings", json={"min_attendance_threshold": 0.5}).status_code == 403


def test_faculty_scope_and_ownership(server):
    c = login(server, "EMP-101", "password123")
    st = c.get("/api/state").json()
    class_ids = {r["class_id"] for r in st["records"]}
    assert class_ids <= {"cls-dbms-3a", "cls-toc-3a", "cls-dbms-3b"}
    # fac-1 doesn't teach OS
    assert c.post("/api/sessions", json={"class_id": "cls-os-3a"}).status_code == 403


# ── QR attendance ────────────────────────────────────────────────────────────


def test_qr_flow_end_to_end(server):
    fac = login(server, "EMP-101", "password123")
    sess = fac.post("/api/sessions", json={"class_id": "cls-dbms-3a", "topic": "Joins"}).json()
    qr = fac.get(f"/api/sessions/{sess['id']}/qr").json()

    stu = login(server, "EN202402", "password123")
    r = stu.post("/api/attendance/qr", json={"payload": qr["payload"]})
    assert r.status_code == 200, r.text
    # second scan is rejected
    assert stu.post("/api/attendance/qr", json={"payload": qr["payload"]}).status_code == 409

    # forged token
    forged = json.dumps({"v": 2, "s": sess["id"], "t": "AAAAAAAAAAAAAAAA"})
    other = login(server, "EN202403", "password123")
    assert other.post("/api/attendance/qr", json={"payload": forged}).status_code == 400

    # student from another division is not enrolled
    outsider = login(server, "EN202431", "password123")
    assert outsider.post("/api/attendance/qr", json={"payload": qr["payload"]}).status_code == 403

    # closing marks every other enrolled student absent
    res = fac.post(f"/api/sessions/{sess['id']}/close").json()
    assert res["present"] == 1
    st = fac.get("/api/state").json()
    recs = [r for r in st["records"] if r["session_id"] == sess["id"]]
    enrolled = [e for e in st["enrollments"] if e["class_id"] == "cls-dbms-3a"]
    assert len(recs) == len(enrolled)
    assert sum(r["status"] == "PRESENT" for r in recs) == 1

    # closed session rejects scans
    assert other.post("/api/attendance/qr", json={"payload": qr["payload"]}).status_code == 409


def test_qr_expires(server, monkeypatch):
    fac = login(server, "EMP-101", "password123")
    sess = fac.post("/api/sessions", json={"class_id": "cls-toc-3a"}).json()
    old = security.current_qr(sess["id"], now=1_000_000.0)["payload"]
    stu = login(server, "EN202404", "password123")
    assert stu.post("/api/attendance/qr", json={"payload": old}).status_code == 400
    fac.post(f"/api/sessions/{sess['id']}/close")


def test_previous_window_still_valid():
    import time
    sid = "sess-x"
    t = time.time()
    prev = json.loads(security.current_qr(sid, now=t - security.settings.qr_interval_sec)["payload"])["t"]
    assert security.verify_qr_token(sid, prev, now=t)
    too_old = json.loads(security.current_qr(sid, now=t - 3 * security.settings.qr_interval_sec)["payload"])["t"]
    assert not security.verify_qr_token(sid, too_old, now=t)


def test_geofence(server):
    fac = login(server, "EMP-101", "password123")
    sess = fac.post("/api/sessions", json={
        "class_id": "cls-dbms-3a", "require_location": True, "latitude": 21.1458, "longitude": 79.0882, "radius_m": 100,
    }).json()
    payload = fac.get(f"/api/sessions/{sess['id']}/qr").json()["payload"]
    far = login(server, "EN202405", "password123")
    r = far.post("/api/attendance/qr", json={"payload": payload, "latitude": 21.20, "longitude": 79.0882})
    assert r.status_code == 403
    assert far.post("/api/attendance/qr", json={"payload": payload}).status_code == 400
    near = far.post("/api/attendance/qr", json={"payload": payload, "latitude": 21.1459, "longitude": 79.0883})
    assert near.status_code == 200
    fac.post(f"/api/sessions/{sess['id']}/close")


# ── Face recognition ─────────────────────────────────────────────────────────


# ── Leave, corrections, roll call ────────────────────────────────────────────


def test_roll_call_and_leave_excuses(server):
    stu = login(server, "EN202409", "password123")
    leave = stu.post("/api/leaves", json={"leave_type": "MEDICAL", "start_date": "2030-01-10",
                                          "end_date": "2030-01-11", "reason": "Fever, doctor advised rest"}).json()
    fac = login(server, "EMP-101", "password123")
    assert fac.post(f"/api/leaves/{leave['id']}/review", json={"status": "APPROVED"}).status_code == 200
    assert fac.post(f"/api/leaves/{leave['id']}/review", json={"status": "APPROVED"}).status_code == 409

    roster = [{"student_id": "stu-2", "status": "PRESENT"}, {"student_id": "stu-26", "status": "PRESENT"}]
    res = fac.post("/api/roll-call", json={"class_id": "cls-dbms-3a", "date": "2030-01-10", "roster": roster}).json()
    assert res["recorded_count"] == 1  # stu-26 isn't enrolled in 3A
    recs = {r["student_id"]: r["status"] for r in fac.get("/api/state").json()["records"]
            if r["session_id"] == res["session_id"]}
    assert recs["stu-2"] == "PRESENT"
    assert recs["stu-9"] == "EXCUSED"
    assert recs["stu-1"] == "ABSENT"


def test_correction_request_fixes_exact_lecture(server):
    stu = login(server, "EN202403", "password123")  # Rohan: has absences
    st = stu.get("/api/state").json()
    absent = next(r for r in st["records"] if r["status"] == "ABSENT" and r["class_id"] == "cls-dbms-3a")
    req = stu.post("/api/corrections", json={"session_id": absent["session_id"], "reason": "I was there, QR failed"})
    assert req.status_code == 200, req.text
    assert stu.post("/api/corrections", json={"session_id": absent["session_id"], "reason": "again please"}).status_code == 409

    wrong_fac = login(server, "EMP-102", "password123")
    assert wrong_fac.post(f"/api/corrections/{req.json()['id']}/review", json={"status": "APPROVED"}).status_code == 403
    fac = login(server, "EMP-101", "password123")
    assert fac.post(f"/api/corrections/{req.json()['id']}/review", json={"status": "APPROVED"}).status_code == 200
    st = stu.get("/api/state").json()
    fixed = next(r for r in st["records"] if r["session_id"] == absent["session_id"])
    assert fixed["status"] == "PRESENT"


# ── Admin ────────────────────────────────────────────────────────────────────


def test_admin_creates_student_with_temp_password(server):
    admin = login(server, "dean.academics@college.edu", "admin2026", "ADMIN")
    r = admin.post("/api/students", json={"name": "New Kid", "roll_number": "77", "semester": 3, "division": "A"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["temp_password"]) == 10
    st = admin.get("/api/state").json()
    enrolled = {e["class_id"] for e in st["enrollments"] if e["student_id"] == body["student"]["id"]}
    assert "cls-dbms-3a" in enrolled
    assert not [x for x in st["records"] if x["student_id"] == body["student"]["id"]]  # no invented history

    dup = admin.post("/api/students", json={"name": "Dup", "roll_number": "77", "semester": 3, "division": "A"})
    assert dup.status_code == 409

    new = login(server, body["student"]["enrollment_number"], body["temp_password"])
    assert new.get("/api/auth/me").json()["user"]["must_change_password"] is True
    assert new.post("/api/auth/change-password", json={"current_password": body["temp_password"],
                                                       "new_password": "a-better-pass"}).status_code == 200


def test_threshold_setting_persists(server):
    admin = login(server, "dean.academics@college.edu", "admin2026")
    assert admin.put("/api/settings", json={"min_attendance_threshold": 0.8}).status_code == 200
    stu = login(server, "EN202401", "password123")
    assert stu.get("/api/state").json()["settings"]["min_attendance_threshold"] == 0.8
    admin.put("/api/settings", json={"min_attendance_threshold": 0.75})


def test_faculty_creates_only_own_classes(server):
    fac = login(server, "EMP-103", "password123")
    r = fac.post("/api/classes", json={"subject_id": "sub-maths", "faculty_id": "fac-1", "semester": 3, "division": "A"})
    assert r.status_code == 200 and r.json()["faculty_id"] == "fac-3"


def test_notices_queue_without_smtp(server):
    admin = login(server, "dean.academics@college.edu", "admin2026")
    r = admin.post("/api/notices/dispatch", json={"student_ids": ["stu-3", "stu-10"], "subject": "Low attendance",
                                                  "message": "Dear {name}, your attendance is low."}).json()
    assert r == {"sent": 0, "queued": 2, "failed": 0, "email_configured": False}
