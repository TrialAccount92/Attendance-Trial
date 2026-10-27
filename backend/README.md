# AttendPulse API

FastAPI + SQLite. It stores all data, handles sign-in, signs and verifies attendance QR codes, and enforces who may see and change what. The browser measures faces (face-api.js descriptors and landmarks); the API decides who they are (`app/face.py`) and whether the head is live (`app/liveness.py`). Stored face descriptors never leave the server.

## Run

```bash
cd backend
./run_backend.sh
```

or manually:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

On first start it creates `data/attendpulse.db` and fills it with demo data (accounts are in the main README).

- API docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/health>
- If `../dist` exists (after `npm run build`), the site itself is served at <http://localhost:8000>.

## Configuration (environment variables)

| Variable | Default | |
| --- | --- | --- |
| `APP_SECRET` | random, saved to `data/secret.key` | Signs QR codes. Set it explicitly in production. |
| `DATA_DIR` | `backend/data` | Where the DB and secret live |
| `DATABASE_PATH` | `$DATA_DIR/attendpulse.db` | |
| `COOKIE_SECURE` | `0` | Set `1` when served over HTTPS |
| `SESSION_HOURS` | `12` | Sign-in lifetime |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Only needed if the frontend is on another origin |
| `QR_INTERVAL` | `30` | Seconds per QR code |
| `GEOFENCE_METERS` | `150` | Default radius for the optional location check |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | unset | Enables emailing attendance warnings (STARTTLS) |

## Main endpoints

| | |
| --- | --- |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/change-password` | Sign-in (httpOnly cookie) |
| `GET /api/state` | Everything the signed-in user may see |
| `POST /api/sessions` · `POST /api/sessions/{id}/close` · `GET /api/sessions/{id}/qr` | Lecture sessions and the live QR |
| `POST /api/attendance/qr` | Student check-in with a scanned code (+ location if required) |
| `POST /api/classes/{id}/identify` · `POST /api/sessions/{id}/face-mark` · `PUT/DELETE /api/students/{id}/face` | Face recognition: identify descriptors, mark after identity + head-turn check, enroll with a both-ways head turn |
| `PUT /api/records` · `POST /api/roll-call` | Manual marks |
| `/api/corrections`, `/api/leaves`, `/api/announcements`, `/api/events`, `/api/extra-classes` | Requests and calendar |
| `/api/students`, `/api/faculty`, `/api/subjects`, `/api/classes`, `PUT /api/settings` | Administration |
| `POST /api/notices/dispatch` | Attendance warning emails |
| `POST /api/admin/reset-demo` | Wipe and reload demo data (admin) |

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```
