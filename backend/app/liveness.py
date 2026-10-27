"""Liveness: telling a real head from a photo or a screen held up to the camera.

The browser sends the 68 face-api landmarks it measured on each frame. From
them we compute the head's left/right turn ("yaw"):

    yaw = (|nose tip - left jaw edge| - |nose tip - right jaw edge|) / face width

This uses distances measured within the face, so moving, rotating, scaling or
tilting a flat photo barely changes it. A real head turning does change it.
Calibration on real webcam footage (two people) and on a printed-photo
simulation (perspective tilt up to ±18%, in-plane rotation ±8°, scale ±15%):

    photo held and waved around      yaw range ≤ 0.11
    real head turning left/right     yaw range 0.4 – 1.6

Blink detection was also tried. At the 2–5 fps a classroom scanner achieves,
blinks were not reliably visible, and a still real face is indistinguishable
from a photo. So liveness here means **the head has to turn**.

Limits:
- A video of the student played on a phone screen shows a turning head and passes.
- The yaw formula itself is immune to tilting a photo, but the landmark detector
  is not: in a live browser test, a printed photo tilted and waved quickly made
  face-api.js misplace the jaw/nose points on some frames, giving spurious yaw
  readings of ±0.4–0.9, and the check passed. A photo held still never passed.
So this is a deterrent against holding up a picture, not proof of presence.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Only "frontal" frames are used to identify a face: turned (yaw) or sideways-
# tilted (roll) heads give unreliable descriptors. On the calibration footage,
# frames outside these limits drifted up to 0.7 from the person's own samples.
FRONTAL_MAX_YAW = 0.25
FRONTAL_MAX_ROLL_DEG = 15.0

# Classroom: yaw must vary at least this much over the student's recent frames.
PASSIVE_MIN_YAW_RANGE = 0.20

# Enrollment: the head must turn this far to *each* side of the frontal pose.
ACTIVE_MIN_TURN = 0.15

MAX_TRACK_FRAMES = 240
MAX_TRACK_SECONDS = 120


@dataclass
class TrackFrame:
    t: float  # ms
    points: np.ndarray  # (68, 2)
    yaw: float
    roll: float  # degrees

    @property
    def frontal(self) -> bool:
        return abs(self.yaw) <= FRONTAL_MAX_YAW and abs(self.roll) <= FRONTAL_MAX_ROLL_DEG


@dataclass
class LivenessResult:
    ok: bool
    reason: str
    yaw_min: float = 0.0
    yaw_max: float = 0.0
    frames: int = 0
    details: dict = field(default_factory=dict)

    def summary(self) -> str:
        return f"head-turn {self.yaw_max - self.yaw_min:.2f}"


def yaw_of(points: np.ndarray) -> float:
    d = lambda a, b: float(np.linalg.norm(points[a] - points[b]))  # noqa: E731
    width = d(0, 16)
    if width <= 1e-6:
        return 0.0
    return (d(30, 0) - d(30, 16)) / width


def roll_of(points: np.ndarray) -> float:
    """Sideways head tilt in degrees (angle of the line between the eye centres)."""
    left, right = points[36:42].mean(axis=0), points[42:48].mean(axis=0)
    dx, dy = right - left
    return float(np.degrees(np.arctan2(dy, dx)))


def parse_track(raw: list[dict]) -> list[TrackFrame]:
    """Validate the browser's landmark track. Raises ValueError on malformed data."""
    if len(raw) > MAX_TRACK_FRAMES:
        raise ValueError(f"Too many tracking frames (max {MAX_TRACK_FRAMES}).")
    frames: list[TrackFrame] = []
    last_t = -1.0
    for f in raw:
        pts = np.asarray(f.get("p"), dtype=np.float64)
        t = float(f.get("t", -1))
        if pts.shape != (68, 2) or not np.isfinite(pts).all():
            raise ValueError("Each tracking frame needs 68 landmark points.")
        if t <= last_t:
            raise ValueError("Tracking frames must be in time order.")
        last_t = t
        frames.append(TrackFrame(t, pts, yaw_of(pts), roll_of(pts)))
    if frames and (frames[-1].t - frames[0].t) / 1000 > MAX_TRACK_SECONDS:
        raise ValueError(f"Tracking window longer than {MAX_TRACK_SECONDS}s.")
    return frames


def _plausible_face(frames: list[TrackFrame]) -> bool:
    """Reject synthetic tracks: frames must have sane face proportions (looser when the head is turned)."""
    for f in frames:
        p = f.points
        width = np.linalg.norm(p[0] - p[16])
        height = np.linalg.norm(p[27] - p[8])
        if width <= 0:
            return False
        lo, hi = (0.45, 1.6) if f.frontal else (0.2, 3.0)
        if not lo <= height / width <= hi:
            return False
    return True


def check_passive(frames: list[TrackFrame]) -> LivenessResult:
    """Classroom check: the head turned noticeably at some point in the window."""
    if len(frames) < 3:
        return LivenessResult(False, "Not enough frames yet.", frames=len(frames))
    if not _plausible_face(frames):
        return LivenessResult(False, "Landmark track does not look like a face.", frames=len(frames))
    yaws = np.array([f.yaw for f in frames])
    lo, hi = float(yaws.min()), float(yaws.max())
    ok = hi - lo >= PASSIVE_MIN_YAW_RANGE
    reason = "" if ok else "Waiting for the student to turn their head a little."
    return LivenessResult(ok, reason, lo, hi, len(frames))


def check_active(frames: list[TrackFrame]) -> LivenessResult:
    """Enrollment check: the head turned clearly to both sides of the frontal pose."""
    if len(frames) < 5:
        return LivenessResult(False, "Not enough frames recorded.", frames=len(frames))
    if not _plausible_face(frames):
        return LivenessResult(False, "Landmark track does not look like a face.", frames=len(frames))
    yaws = np.array([f.yaw for f in frames])
    frontal = float(np.median([f.yaw for f in frames if f.frontal] or [0.0]))
    lo, hi = float(yaws.min()), float(yaws.max())
    turned_one = lo <= frontal - ACTIVE_MIN_TURN
    turned_other = hi >= frontal + ACTIVE_MIN_TURN
    if turned_one and turned_other:
        return LivenessResult(True, "", lo, hi, len(frames), {"frontal": frontal})
    missing = "either side" if not (turned_one or turned_other) else "the other side"
    return LivenessResult(False, f"Head turn to {missing} not detected.", lo, hi, len(frames), {"frontal": frontal})
