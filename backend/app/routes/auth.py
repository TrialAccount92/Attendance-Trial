from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..config import settings
from ..db import now_iso, transaction
from ..deps import Actor, current_actor, load_actor
from ..security import (
    clear_login_failures, hash_password, hash_token, login_locked, new_session_token,
    record_login_failure, verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    role: str | None = None  # optional: reject a login made from the wrong portal tab


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


def _resolve_user_id(conn, identifier: str) -> str | None:
    ident = identifier.strip()
    r = conn.execute("SELECT id FROM users WHERE email = ? COLLATE NOCASE", (ident,)).fetchone()
    if r:
        return r[0]
    r = conn.execute("SELECT user_id FROM faculty WHERE employee_id = ? COLLATE NOCASE", (ident,)).fetchone()
    if r:
        return r[0]
    r = conn.execute("SELECT user_id FROM students WHERE enrollment_number = ? COLLATE NOCASE", (ident,)).fetchone()
    if r:
        return r[0]
    # Roll numbers repeat across divisions, so only accept one that is unique.
    found = conn.execute("SELECT user_id FROM students WHERE roll_number = ?", (ident,)).fetchall()
    if len(found) == 1:
        return found[0][0]
    return None


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.session_cookie, token, httponly=True, samesite="strict", secure=settings.cookie_secure,
        max_age=settings.session_hours * 3600, path="/",
    )


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    key = f"{body.identifier.strip().lower()}|{request.client.host if request.client else ''}"
    wait = login_locked(key)
    if wait:
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait} seconds.")
    with transaction() as conn:
        user_id = _resolve_user_id(conn, body.identifier)
        stored = conn.execute("SELECT password_hash, role FROM users WHERE id = ?", (user_id,)).fetchone() if user_id else None
        if not stored or not verify_password(body.password, stored["password_hash"]):
            record_login_failure(key)
            raise HTTPException(401, "Incorrect ID or password.")
        if body.role and body.role != stored["role"]:
            role_name = stored["role"].title()
            raise HTTPException(403, f"This is a {role_name} account. Use the {role_name} tab to sign in.")
        raw, token_hash, expires = new_session_token()
        conn.execute("DELETE FROM auth_tokens WHERE expires_at < ?", (datetime.now(timezone.utc).isoformat(),))
        conn.execute(
            "INSERT INTO auth_tokens(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
            (token_hash, user_id, now_iso(), expires),
        )
        actor = load_actor(conn, user_id)
    clear_login_failures(key)
    _set_cookie(response, raw)
    return {"user": actor.user, "student_id": actor.student["id"] if actor.student else None,
            "faculty_id": actor.faculty["id"] if actor.faculty else None}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(settings.session_cookie)
    if token:
        with transaction() as conn:
            conn.execute("DELETE FROM auth_tokens WHERE token_hash = ?", (hash_token(token),))
    response.delete_cookie(settings.session_cookie, path="/")
    return {"ok": True}


@router.get("/me")
def me(actor: Actor = Depends(current_actor)):
    return {"user": actor.user, "student_id": actor.student["id"] if actor.student else None,
            "faculty_id": actor.faculty["id"] if actor.faculty else None}


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request, actor: Actor = Depends(current_actor)):
    with transaction() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE id = ?", (actor.user["id"],)).fetchone()
        if not verify_password(body.current_password, stored["password_hash"]):
            raise HTTPException(400, "Current password is incorrect.")
        conn.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
            (hash_password(body.new_password), actor.user["id"]),
        )
        # Sign out every other device.
        current = request.cookies.get(settings.session_cookie) or ""
        conn.execute(
            "DELETE FROM auth_tokens WHERE user_id = ? AND token_hash != ?", (actor.user["id"], hash_token(current))
        )
    return {"ok": True}
