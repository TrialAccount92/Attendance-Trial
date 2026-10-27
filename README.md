# AttendPulse — College Attendance & Academic Management

AttendPulse is a web portal for colleges to take and track lecture attendance. Students check in by scanning a rotating QR code or by face recognition. Faculty run sessions and review leave and correction requests, and administrators manage the timetable and see campus-wide reports.

It has two parts:

| Part | Tech | What it does |
| --- | --- | --- |
| `src/` (frontend) | React 19, TypeScript, Vite | All screens. The browser measures faces with face-api.js. |
| `backend/` (API) | Python, FastAPI, SQLite, numpy | Accounts and login, all data, QR signing, attendance rules, face matching and liveness checks. |

The browser never decides anything on its own. Every mark, approval and setting is checked and stored by the API.

---

## Quick start

You need **Node.js 18+** and **Python 3.10+**.

```bash
# 1. API server (first run creates backend/data/attendpulse.db with demo data)
cd backend
./run_backend.sh            # or see backend/README.md for manual steps

# 2. Frontend, in a second terminal
npm install
npm run dev                 # http://localhost:5173  (API calls are proxied to :8000)
```

To run it as one server instead, use `npm run build`. The API then also serves the built site at <http://localhost:8000>.

### Demo accounts

| Role | Login ID | Password |
| --- | --- | --- |
| Admin | `dean.academics@college.edu` | `admin2026` |
| Faculty | `EMP-101` … `EMP-108` | `password123` |
| Student | enrollment number (e.g. `EN202401`) or college email | `password123` |

These are sample data only. Before real use, sign in as admin and press **Reset demo** if you want a clean slate. Then delete the demo accounts or change their passwords, set `VITE_HIDE_DEMO_LOGINS=true` when building, and see *Deploying* below. Accounts that an admin creates get a one-time temporary password and must choose a new one on first sign-in.

---

## How attendance works

### QR check-in
1. A faculty member starts a session for one of their classes.
2. The screen shows a QR code signed by the server (HMAC). It changes every 30 seconds, and only the current and the previous code are accepted.
3. Students scan it with their phone camera from the Student Portal, or upload a photo of it. The server checks the code, the session, and that the student is enrolled in that class. Each student can be marked only once.
4. **Optional location check:** the teacher can require students to be within 150 m of where the session was started. This needs location permission on both devices.
5. When the session ends, every enrolled student who wasn't marked is recorded **absent**, or **excused** if they have approved leave for that day.

### Face recognition
The browser only *measures* faces: face-api.js (TinyFaceDetector or SSD MobileNet, 68 landmarks, ResNet-34) turns each face into a 128-number descriptor plus its landmark points. **Deciding who a face is happens on the server**, against stored descriptors that are never sent to any browser, so a modified page can't mark a stranger present.

- **Enrollment.** A student enrolls from their dashboard, or a teacher enrolls them from the scanner's roster. A guided check asks them to look straight, turn their head one way, then the other, then look straight again. The server checks the head really turned both ways, keeps up to 8 consistent front-facing samples plus a small thumbnail, and refuses the face if it is already enrolled on another account. Uploading a photo to enroll is not possible.
- **Scanning.** The teacher's browser sends descriptors of front-facing faces to `POST /api/classes/{id}/identify`; the server answers with the matching student or *unknown*.
  - A match counts only when the distance is under 0.5 **and** at least 0.06 better than the next-closest student.
  - Each student is matched to at most one face per frame.
  - To mark, the browser sends the student's recent frames to `/face-mark`. The server re-checks the identity on every frame (none may match someone else, at least 3 must match this student) and checks liveness: **the student's head must turn a little** while being scanned. Tell the class to look at the camera and slowly turn their heads; the scanner shows "turn head ↔" next to anyone still waiting.
  - Each mark stores the match distance and the liveness measurement, so it can be reviewed later.
  - Frames needed and detector are adjustable under **Settings**.
- Unknown faces are boxed in orange and never marked. The teacher can still mark anyone manually.
- The models load only when a face feature is first opened (~1.3 MB of code + ~12 MB of model files from `public/models`).

Tested on real webcam footage of two people: 27 of 27 identifications correct, no mix-ups; the closest two different people came was 0.59 (match limit 0.5).

**Limits to know about.**
- Liveness works from landmarks only. It reliably stops a **still** photo or screenshot held in front of the camera. In testing, a printed photo that was **tilted and waved around** sometimes made the landmark detector jump and fake a head turn, and a **video** of the student playing on a phone will always pass. Treat it as a deterrent, and run the scanner on a camera the teacher controls, in the room, with the teacher watching.
- Accuracy depends on lighting, distance and camera quality. For far rows, pick *Far rows* under Settings, or use a camera with optical zoom (the zoom slider appears when the camera supports it).

### Leave, corrections and the 75% rule
- Approved leave turns absences in its date range into **excused**, which count toward attendance.
- A correction request names one specific lecture. Approving it marks the student present for that lecture.
- The minimum-attendance threshold is set by the admin (Rules & Notices tab) and stored on the server.
- *Safe to miss* is the largest *k* with present ÷ (conducted + k) ≥ threshold. *Must attend* is the smallest *k* with (present + k) ÷ (conducted + k) ≥ threshold.

### Warning notices
**Dispatch Warnings** emails each defaulter when SMTP is configured on the server (see `backend/README.md`). Without it, the notices are only saved to the server's outbox, and the UI says so. SMS is not implemented.

---

## Roles and access

| | Student | Faculty | Admin |
| --- | --- | --- | --- |
| Sees | own records only | students and records of classes they teach | everything |
| Takes attendance | QR scan | QR / face / roll call / manual, own classes | any class |
| Reviews | — | corrections for own classes; leave for own students | all |
| Manages | own face profile, own password | own timetable | students, faculty, subjects, calendar, settings |

Sign-in uses an httpOnly, SameSite=Strict session cookie (12 h). Passwords are hashed with PBKDF2-SHA256. After 5 failed attempts an account is locked for 5 minutes. A user opening another role's portal URL is sent back to their own portal.

---

## Project layout

```
backend/            FastAPI app (see backend/README.md)
  app/routes/       auth, state, attendance, management, academic
  tests/            API tests (pytest)
public/models/      face-api.js model weights
src/api/client.ts   fetch wrapper (cookie auth, error messages)
src/context/        AttendanceContext — loads /api/state, exposes actions
src/utils/faceRecognitionEngine.ts   detection, head pose, guided enrollment
backend/app/face.py, liveness.py     server-side matching and liveness
src/components/     student / faculty / admin / common UI
```

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Vite dev server with `/api` proxied to `localhost:8000` (`API_TARGET` overrides) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lint` | oxlint |
| `cd backend && python -m pytest -q` | API tests (install `requirements-dev.txt` first) |

## Deploying

- Serve over **HTTPS**. Browsers only allow camera and location on HTTPS or `localhost`, so phones on the campus network need HTTPS to scan.
- Set `APP_SECRET` (signs QR codes; otherwise a random key is kept in `backend/data/secret.key`), `COOKIE_SECURE=1`, and `CORS_ORIGINS` if the frontend is on another origin.
- Back up `backend/data/attendpulse.db`. It holds all attendance and face data.
- Face descriptors are biometric data. Tell students what is stored, and remove profiles of students who leave (deleting a student deletes their face profile).

## License

MIT
