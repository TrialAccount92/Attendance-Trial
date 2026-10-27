"""Password hashing, login sessions, rotating QR tokens and geofencing."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from .config import settings

# ── Passwords ────────────────────────────────────────────────────────────────

_PBKDF2_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def generate_temp_password() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(10))


# ── Login session tokens (stored hashed) ─────────────────────────────────────

def new_session_token() -> tuple[str, str, str]:
    """Returns (raw_token, token_hash, expires_at_iso)."""
    raw = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.session_hours)
    return raw, hash_token(raw), expires.isoformat()


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Brute-force protection (per identifier, in memory) ───────────────────────

_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def login_locked(key: str) -> int:
    """Seconds remaining on a lockout, or 0."""
    with _failures_lock:
        now = time.time()
        attempts = [t for t in _failures.get(key, []) if now - t < settings.lockout_seconds]
        _failures[key] = attempts
        if len(attempts) >= settings.max_login_failures:
            return int(settings.lockout_seconds - (now - attempts[0])) + 1
        return 0


def record_login_failure(key: str) -> None:
    with _failures_lock:
        _failures.setdefault(key, []).append(time.time())


def clear_login_failures(key: str) -> None:
    with _failures_lock:
        _failures.pop(key, None)


# ── Rotating QR tokens ───────────────────────────────────────────────────────
# token = HMAC(secret, session_id:window). The server never stores tokens; it
# recomputes them, so a code is only valid during its window (plus one window
# of grace) and cannot be forged without the server secret.

def _qr_token(session_id: str, window: int) -> str:
    mac = hmac.new(settings.secret.encode(), f"qr:{session_id}:{window}".encode(), hashlib.sha256).digest()
    return base64.b32encode(mac[:10]).decode().rstrip("=")


def current_qr(session_id: str, now: float | None = None) -> dict:
    now = time.time() if now is None else now
    interval = settings.qr_interval_sec
    window = int(now // interval)
    payload = json.dumps({"v": 2, "s": session_id, "t": _qr_token(session_id, window)}, separators=(",", ":"))
    return {
        "payload": payload,
        "generated_at": int(window * interval * 1000),
        "expires_at": int((window + 1) * interval * 1000),
        "interval_sec": interval,
    }


def parse_qr(raw: str) -> tuple[str, str] | None:
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get("v") != 2:
            return None
        sid, tok = data.get("s"), data.get("t")
        if isinstance(sid, str) and isinstance(tok, str):
            return sid, tok
    except (ValueError, TypeError):
        pass
    return None


def verify_qr_token(session_id: str, token: str, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    window = int(now // settings.qr_interval_sec)
    return any(hmac.compare_digest(token, _qr_token(session_id, w)) for w in (window, window - 1))


# ── Geofence ─────────────────────────────────────────────────────────────────

def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
