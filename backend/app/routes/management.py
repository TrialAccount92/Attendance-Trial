"""Admin / faculty management of students, faculty, subjects, classes and settings."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from ..db import new_id, now_iso, row, set_setting, transaction
from ..deps import Actor, current_actor, require_class_access, require_roles
from ..security import generate_temp_password, hash_password
from ..seed import seed_database, wipe
from ..services import enroll_cohort_in_class, enroll_student_in_cohort

router = APIRouter(prefix="/api", tags=["management"])


def _slug_email(name: str, domain: str) -> str:
    base = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".") or "user"
    return f"{base}@{domain}"


def _unique_email(conn, email: str) -> str:
    local, _, domain = email.partition("@")
    candidate, n = email, 1
    while conn.execute("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE", (candidate,)).fetchone():
        n += 1
        candidate = f"{local}{n}@{domain}"
    return candidate


# ── Students ─────────────────────────────────────────────────────────────────


class StudentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    roll_number: str = Field(min_length=1, max_length=20)
    enrollment_number: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    semester: int = Field(default=3, ge=1, le=12)
    division: str = Field(default="A", min_length=1, max_length=5)
    department_id: str | None = None


def _create_student(conn, data: StudentIn) -> tuple[dict, str]:
    name = data.name.strip()
    roll = data.roll_number.strip()
    division = data.division.strip().upper()
    enrollment = (data.enrollment_number or "").strip()
    if not enrollment:
        enrollment = f"EN{now_iso()[:4]}{data.semester}{division}{roll.zfill(2)}"
    if conn.execute("SELECT 1 FROM students WHERE enrollment_number = ? COLLATE NOCASE", (enrollment,)).fetchone():
        raise HTTPException(409, f"Enrollment number {enrollment} already exists.")
    if conn.execute(
        "SELECT 1 FROM students WHERE roll_number = ? AND semester = ? AND division = ?", (roll, data.semester, division)
    ).fetchone():
        raise HTTPException(409, f"Roll number {roll} is already taken in semester {data.semester} division {division}.")
    email = str(data.email).strip() if data.email else _slug_email(name, "student.college.edu")
    if data.email and conn.execute("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE", (email,)).fetchone():
        raise HTTPException(409, f"Email {email} is already registered.")
    email = _unique_email(conn, email)

    temp_password = generate_temp_password()
    student_id = new_id("stu")
    user_id = f"usr-{student_id}"
    conn.execute(
        "INSERT INTO users(id, name, email, role, password_hash, must_change_password, created_at) VALUES (?,?,?,?,?,1,?)",
        (user_id, name, email, "STUDENT", hash_password(temp_password), now_iso()),
    )
    stu = {
        "id": student_id, "user_id": user_id, "name": name, "email": email, "roll_number": roll,
        "enrollment_number": enrollment, "department_id": data.department_id or "dept-ce",
        "semester": data.semester, "division": division, "avatar": None,
    }
    conn.execute(
        """INSERT INTO students VALUES (:id, :user_id, :name, :email, :roll_number, :enrollment_number,
           :department_id, :semester, :division, :avatar)""",
        stu,
    )
    enroll_student_in_cohort(conn, stu)
    return stu, temp_password


@router.post("/students")
def add_student(body: StudentIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        stu, temp_password = _create_student(conn, body)
    return {"student": stu, "temp_password": temp_password}


class ImportIn(BaseModel):
    students: list[StudentIn] = Field(max_length=2000)


@router.post("/students/import")
def import_students(body: ImportIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    added, updated = [], 0
    with transaction() as conn:
        for item in body.students:
            existing = None
            if item.enrollment_number:
                existing = row(conn.execute(
                    "SELECT * FROM students WHERE enrollment_number = ? COLLATE NOCASE", (item.enrollment_number.strip(),)
                ).fetchone())
            if not existing:
                existing = row(conn.execute(
                    "SELECT * FROM students WHERE roll_number = ? AND semester = ? AND division = ?",
                    (item.roll_number.strip(), item.semester, item.division.strip().upper()),
                ).fetchone())
            if existing:
                conn.execute(
                    "UPDATE students SET name = ?, semester = ?, division = ?, department_id = COALESCE(?, department_id) WHERE id = ?",
                    (item.name.strip(), item.semester, item.division.strip().upper(), item.department_id, existing["id"]),
                )
                conn.execute("UPDATE users SET name = ? WHERE id = ?", (item.name.strip(), existing["user_id"]))
                existing.update(semester=item.semester, division=item.division.strip().upper())
                enroll_student_in_cohort(conn, existing)
                updated += 1
            else:
                stu, pw = _create_student(conn, item)
                added.append({"name": stu["name"], "enrollment_number": stu["enrollment_number"],
                              "email": stu["email"], "temp_password": pw})
    return {"added": len(added), "updated": updated, "credentials": added}


@router.delete("/students/{student_id}")
def remove_student(student_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        stu = row(conn.execute("SELECT user_id FROM students WHERE id = ?", (student_id,)).fetchone())
        if not stu:
            raise HTTPException(404, "Student not found.")
        conn.execute("DELETE FROM users WHERE id = ?", (stu["user_id"],))  # cascades to student + records
    return {"ok": True}


@router.post("/students/{student_id}/reset-password")
def reset_student_password(student_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        stu = row(conn.execute("SELECT user_id FROM students WHERE id = ?", (student_id,)).fetchone())
        if not stu:
            raise HTTPException(404, "Student not found.")
        pw = generate_temp_password()
        conn.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
                     (hash_password(pw), stu["user_id"]))
        conn.execute("DELETE FROM auth_tokens WHERE user_id = ?", (stu["user_id"],))
    return {"temp_password": pw}


class EnrollmentsIn(BaseModel):
    class_ids: list[str]


@router.put("/students/{student_id}/enrollments")
def set_enrollments(student_id: str, body: EnrollmentsIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        if not conn.execute("SELECT 1 FROM students WHERE id = ?", (student_id,)).fetchone():
            raise HTTPException(404, "Student not found.")
        valid = {r[0] for r in conn.execute("SELECT id FROM classes")}
        wanted = [c for c in dict.fromkeys(body.class_ids) if c in valid]
        conn.execute("DELETE FROM enrollments WHERE student_id = ?", (student_id,))
        conn.executemany(
            "INSERT INTO enrollments(id, student_id, class_id) VALUES (?,?,?)",
            [(f"enr-{student_id}-{c}", student_id, c) for c in wanted],
        )
    return {"class_ids": wanted}


# ── Faculty ──────────────────────────────────────────────────────────────────


class FacultyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    department_id: str
    designation: str | None = Field(default=None, max_length=80)
    employee_id: str | None = Field(default=None, max_length=30)


class FacultyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    department_id: str | None = None
    designation: str | None = Field(default=None, max_length=80)
    employee_id: str | None = Field(default=None, max_length=30)


@router.post("/faculty")
def add_faculty(body: FacultyIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        email = str(body.email).strip()
        if conn.execute("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE", (email,)).fetchone():
            raise HTTPException(409, f"Email {email} is already registered.")
        emp = (body.employee_id or "").strip()
        if not emp:
            n = conn.execute("SELECT COUNT(*) FROM faculty").fetchone()[0] + 101
            while conn.execute("SELECT 1 FROM faculty WHERE employee_id = ?", (f"EMP-{n}",)).fetchone():
                n += 1
            emp = f"EMP-{n}"
        elif conn.execute("SELECT 1 FROM faculty WHERE employee_id = ? COLLATE NOCASE", (emp,)).fetchone():
            raise HTTPException(409, f"Employee ID {emp} already exists.")
        temp_password = generate_temp_password()
        fid = new_id("fac")
        uid = f"usr-{fid}"
        conn.execute(
            "INSERT INTO users(id, name, email, role, password_hash, must_change_password, created_at) VALUES (?,?,?,?,?,1,?)",
            (uid, body.name.strip(), email, "FACULTY", hash_password(temp_password), now_iso()),
        )
        fac = {"id": fid, "user_id": uid, "name": body.name.strip(), "email": email,
               "department_id": body.department_id, "employee_id": emp,
               "designation": (body.designation or "").strip() or "Assistant Professor", "avatar": None}
        conn.execute(
            "INSERT INTO faculty VALUES (:id, :user_id, :name, :email, :department_id, :employee_id, :designation, :avatar)",
            fac,
        )
    return {"faculty": fac, "temp_password": temp_password}


@router.patch("/faculty/{faculty_id}")
def update_faculty(faculty_id: str, body: FacultyPatch, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    changes = body.model_dump(exclude_none=True)
    with transaction() as conn:
        fac = row(conn.execute("SELECT * FROM faculty WHERE id = ?", (faculty_id,)).fetchone())
        if not fac:
            raise HTTPException(404, "Faculty not found.")
        if "email" in changes:
            changes["email"] = str(changes["email"])
            if conn.execute("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ?",
                            (changes["email"], fac["user_id"])).fetchone():
                raise HTTPException(409, "That email is already registered.")
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            conn.execute(f"UPDATE faculty SET {sets} WHERE id = ?", (*changes.values(), faculty_id))
            if "name" in changes or "email" in changes:
                conn.execute("UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?",
                             (changes.get("name"), changes.get("email"), fac["user_id"]))
    return {"ok": True}


@router.delete("/faculty/{faculty_id}")
def remove_faculty(faculty_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        fac = row(conn.execute("SELECT user_id FROM faculty WHERE id = ?", (faculty_id,)).fetchone())
        if not fac:
            raise HTTPException(404, "Faculty not found.")
        conn.execute("UPDATE classes SET faculty_id = '' WHERE faculty_id = ?", (faculty_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (fac["user_id"],))
    return {"ok": True}


# ── Subjects ─────────────────────────────────────────────────────────────────


class SubjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=20)
    credits: int = Field(default=4, ge=0, le=12)
    department_id: str
    semester: int | None = Field(default=None, ge=1, le=12)


class SubjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, min_length=1, max_length=20)
    credits: int | None = Field(default=None, ge=0, le=12)
    department_id: str | None = None
    semester: int | None = Field(default=None, ge=1, le=12)


@router.post("/subjects")
def add_subject(body: SubjectIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    sub = {"id": new_id("sub"), "name": body.name.strip(), "code": body.code.strip().upper(),
           "credits": body.credits, "department_id": body.department_id, "semester": body.semester}
    with transaction() as conn:
        conn.execute("INSERT INTO subjects VALUES (:id, :name, :code, :credits, :department_id, :semester)", sub)
    return sub


@router.patch("/subjects/{subject_id}")
def update_subject(subject_id: str, body: SubjectPatch, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    changes = body.model_dump(exclude_none=True)
    if "code" in changes:
        changes["code"] = changes["code"].strip().upper()
    with transaction() as conn:
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            if conn.execute(f"UPDATE subjects SET {sets} WHERE id = ?", (*changes.values(), subject_id)).rowcount == 0:
                raise HTTPException(404, "Subject not found.")
    return {"ok": True}


@router.delete("/subjects/{subject_id}")
def remove_subject(subject_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        if conn.execute("SELECT 1 FROM classes WHERE subject_id = ?", (subject_id,)).fetchone():
            raise HTTPException(409, "Subject is still used by a class. Remove or reassign those classes first.")
        conn.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    return {"ok": True}


# ── Classes (timetable) ──────────────────────────────────────────────────────


class ClassIn(BaseModel):
    subject_id: str
    faculty_id: str = ""
    semester: int = Field(ge=1, le=12)
    division: str = Field(min_length=1, max_length=5)
    room: str = Field(default="", max_length=60)
    schedule_time: str = Field(default="", max_length=60)
    day_of_week: str = Field(default="", max_length=20)


class ClassPatch(BaseModel):
    subject_id: str | None = None
    faculty_id: str | None = None
    semester: int | None = Field(default=None, ge=1, le=12)
    division: str | None = Field(default=None, min_length=1, max_length=5)
    room: str | None = Field(default=None, max_length=60)
    schedule_time: str | None = Field(default=None, max_length=60)
    day_of_week: str | None = Field(default=None, max_length=20)


def _insert_class(conn, data: dict) -> dict:
    data = {**data, "id": new_id("cls"), "division": data["division"].strip().upper()}
    if not conn.execute("SELECT 1 FROM subjects WHERE id = ?", (data["subject_id"],)).fetchone():
        raise HTTPException(400, "Unknown subject.")
    conn.execute(
        """INSERT INTO classes VALUES (:id, :subject_id, :faculty_id, :semester, :division, :room,
           :schedule_time, :day_of_week)""",
        data,
    )
    enroll_cohort_in_class(conn, data)
    return data


def _faculty_for_new_class(actor: Actor, requested: str) -> str:
    if actor.is_admin:
        return requested
    require_roles(actor, "FACULTY")
    return actor.faculty["id"]  # faculty can only create classes they teach


@router.post("/classes")
def add_class(body: ClassIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    data = body.model_dump()
    data["faculty_id"] = _faculty_for_new_class(actor, body.faculty_id)
    with transaction() as conn:
        return _insert_class(conn, data)


@router.patch("/classes/{class_id}")
def update_class(class_id: str, body: ClassPatch, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    changes = body.model_dump(exclude_none=True)
    if not actor.is_admin:
        changes.pop("faculty_id", None)  # only admins re-allot classes
    if "division" in changes:
        changes["division"] = changes["division"].strip().upper()
    with transaction() as conn:
        require_class_access(conn, actor, class_id)
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            conn.execute(f"UPDATE classes SET {sets} WHERE id = ?", (*changes.values(), class_id))
            if "semester" in changes or "division" in changes:
                enroll_cohort_in_class(conn, row(conn.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()))
    return {"ok": True}


@router.delete("/classes/{class_id}")
def remove_class(class_id: str, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    with transaction() as conn:
        require_class_access(conn, actor, class_id)
        conn.execute("DELETE FROM classes WHERE id = ?", (class_id,))
    return {"ok": True}


class BulkClassesIn(BaseModel):
    faculty_id: str
    classes: list[ClassIn] = Field(max_length=500)
    replace_existing: bool = False


@router.post("/classes/bulk")
def bulk_import_classes(body: BulkClassesIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "FACULTY", "ADMIN")
    faculty_id = _faculty_for_new_class(actor, body.faculty_id)
    with transaction() as conn:
        if body.replace_existing:
            # Keep classes that already have attendance history; replace the rest.
            conn.execute(
                "DELETE FROM classes WHERE faculty_id = ? AND id NOT IN (SELECT DISTINCT class_id FROM sessions)",
                (faculty_id,),
            )
        created = [_insert_class(conn, {**c.model_dump(), "faculty_id": faculty_id}) for c in body.classes]
    return {"count": len(created)}


# ── Settings & demo reset ────────────────────────────────────────────────────


class SettingsIn(BaseModel):
    min_attendance_threshold: float = Field(ge=0.5, le=1.0)


@router.put("/settings")
def update_settings(body: SettingsIn, actor: Actor = Depends(current_actor)):
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        set_setting(conn, "min_attendance_threshold", round(body.min_attendance_threshold, 4))
    return body.model_dump()


@router.post("/admin/reset-demo")
def reset_demo(actor: Actor = Depends(current_actor)):
    """Wipe everything and reload the demo data set (signs everyone out)."""
    require_roles(actor, "ADMIN")
    with transaction() as conn:
        wipe(conn)
        seed_database(conn)
    return {"ok": True}
