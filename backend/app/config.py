"""Runtime configuration, read from environment variables.

Every value has a sensible default for local development, so the server
starts with no setup. For a real deployment set at least APP_SECRET,
COOKIE_SECURE=1 and CORS_ORIGINS.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BACKEND_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_secret() -> str:
    """Use APP_SECRET if set, otherwise a random key persisted in DATA_DIR."""
    env = os.environ.get("APP_SECRET")
    if env:
        return env
    key_file = DATA_DIR / "secret.key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key


class Settings:
    db_path: str = os.environ.get("DATABASE_PATH", str(DATA_DIR / "attendpulse.db"))
    secret: str = _load_secret()

    # Auth
    session_cookie: str = "ap_session"
    session_hours: int = int(os.environ.get("SESSION_HOURS", "12"))
    cookie_secure: bool = os.environ.get("COOKIE_SECURE", "0") == "1"
    max_login_failures: int = 5
    lockout_seconds: int = 300

    # QR codes rotate every QR_INTERVAL seconds; the previous code stays valid
    # for one more interval to absorb scanning / network delay.
    qr_interval_sec: int = int(os.environ.get("QR_INTERVAL", "30"))
    default_geofence_m: int = int(os.environ.get("GEOFENCE_METERS", "150"))

    # Comma-separated list of browser origins allowed to call the API directly.
    # Not needed when the frontend is served by this server or via the Vite proxy.
    cors_origins: list[str] = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if o.strip()
    ]

    # Optional SMTP for attendance warning emails. Without it, notices are
    # stored in the outbox table only.
    smtp_host: str | None = os.environ.get("SMTP_HOST") or None
    smtp_port: int = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user: str | None = os.environ.get("SMTP_USER") or None
    smtp_password: str | None = os.environ.get("SMTP_PASSWORD") or None
    smtp_from: str = os.environ.get("SMTP_FROM", "attendance@college.edu")

    # Built frontend (npm run build) served at / when present.
    frontend_dist: Path = PROJECT_DIR / "dist"


settings = Settings()
