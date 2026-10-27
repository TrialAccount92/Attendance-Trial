"""Server-side face matching.

The browser only *measures* faces (128-D face-api.js descriptors + 68 landmarks).
Deciding who a face belongs to happens here, against descriptors that never
leave the server, so a modified browser can't label a stranger as a student.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

import numpy as np

DESCRIPTOR_LEN = 128

# Same person: usually < 0.45 apart. Different people: usually > 0.6.
MATCH_MAX_DISTANCE = 0.5
# The best student must beat the runner-up by at least this much.
MATCH_MIN_MARGIN = 0.06
# Two enrollments closer than this are the same person.
DUPLICATE_FACE_DISTANCE = 0.4
# A live camera frame is never this close to a stored sample; anything closer
# is a stored descriptor being replayed.
REPLAY_MAX_DISTANCE = 0.02
# Enrollment samples further than this from the most typical sample are dropped.
ENROLL_CONSISTENCY = 0.45


@dataclass
class Gallery:
    student_ids: list[str]
    names: list[str]
    rolls: list[str]
    samples: np.ndarray  # (S, 128)
    owner: np.ndarray  # (S,) index into student_ids

    def __len__(self) -> int:
        return len(self.student_ids)


@dataclass
class Match:
    student_id: str
    name: str
    roll_number: str
    distance: float
    nearest_sample: float  # distance to the single closest stored sample (replay check)

    @property
    def confidence(self) -> float:
        return round(max(0.0, min(1.0, 1.0 - self.distance)), 3)


def to_array(descriptors: list[list[float]]) -> np.ndarray:
    arr = np.asarray(descriptors, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != DESCRIPTOR_LEN or not np.isfinite(arr).all():
        raise ValueError("Each face descriptor must be 128 finite numbers.")
    return arr


def load_class_gallery(conn: sqlite3.Connection, class_id: str) -> Gallery:
    rows = conn.execute(
        """SELECT s.id, s.name, s.roll_number, f.descriptors FROM enrollments e
           JOIN students s ON s.id = e.student_id JOIN face_profiles f ON f.student_id = s.id
           WHERE e.class_id = ? ORDER BY s.roll_number""",
        (class_id,),
    ).fetchall()
    ids, names, rolls, samples, owner = [], [], [], [], []
    for idx, r in enumerate(rows):
        ids.append(r["id"])
        names.append(r["name"])
        rolls.append(r["roll_number"])
        for d in json.loads(r["descriptors"]):
            samples.append(d)
            owner.append(idx)
    arr = np.asarray(samples, dtype=np.float32).reshape(-1, DESCRIPTOR_LEN)
    return Gallery(ids, names, rolls, arr, np.asarray(owner, dtype=np.int32))


def _per_student_distance(gallery: Gallery, probes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(P, N) closest-sample distance per student, and (P,) closest single sample overall."""
    d = np.linalg.norm(probes[:, None, :] - gallery.samples[None, :, :], axis=2)  # (P, S)
    per_student = np.full((len(probes), len(gallery)), np.inf, dtype=np.float32)
    np.minimum.at(per_student.T, gallery.owner, d.T)
    return per_student, d.min(axis=1)


def identify(gallery: Gallery, probes: np.ndarray) -> list[Match | None]:
    """Match each probe face to at most one student; each student to at most one face."""
    if len(gallery) == 0 or len(probes) == 0:
        return [None] * len(probes)
    per_student, nearest = _per_student_distance(gallery, probes)
    candidates = []
    for p in range(len(probes)):
        order = np.argsort(per_student[p])
        best = float(per_student[p, order[0]])
        second = float(per_student[p, order[1]]) if len(order) > 1 else np.inf
        if best <= MATCH_MAX_DISTANCE and second - best >= MATCH_MIN_MARGIN:
            candidates.append((best, p, int(order[0])))
    out: list[Match | None] = [None] * len(probes)
    used_students: set[int] = set()
    for best, p, s in sorted(candidates):
        if s in used_students or out[p] is not None:
            continue
        used_students.add(s)
        out[p] = Match(gallery.student_ids[s], gallery.names[s], gallery.rolls[s], best, float(nearest[p]))
    return out


def verify_student(gallery: Gallery, probes: np.ndarray, student_id: str, min_matches: int = 3) -> tuple[bool, str, float]:
    """Do these frames really show student_id?

    No frame may match a *different* student; at least ``min_matches`` frames and
    most of them (60%) must match this one (a blurred frame matching nobody is
    tolerated). No frame may be a replayed copy of a stored sample.
    """
    if student_id not in gallery.student_ids:
        return False, "This student has no enrolled face in this class.", 1.0
    distances = []
    for probe in probes:
        m = identify(gallery, probe[None, :])[0]
        if m is not None and m.student_id != student_id:
            return False, "The face matched a different student.", 1.0
        if m is not None and m.nearest_sample < REPLAY_MAX_DISTANCE:
            return False, "Rejected: this looks like a copy of a stored face sample, not a live camera frame.", 1.0
        if m is not None:
            distances.append(m.distance)
    if len(distances) < min_matches or len(distances) < 0.6 * len(probes):
        return False, "The face did not match this student consistently.", 1.0
    if len(probes) > 1 and float(np.linalg.norm(probes[1:] - probes[:-1], axis=1).max()) < 1e-4:
        return False, "Rejected: the face samples are identical, not separate camera frames.", 1.0
    return True, "", float(np.mean(distances))


def consistent_samples(samples: np.ndarray) -> np.ndarray:
    """Keep the samples that agree with the most typical one (the medoid); drop stray frames."""
    if len(samples) == 0:
        return samples
    pair = np.linalg.norm(samples[:, None, :] - samples[None, :, :], axis=2)
    medoid = samples[int(pair.sum(axis=1).argmin())]
    return samples[np.linalg.norm(samples - medoid, axis=1) <= ENROLL_CONSISTENCY]


def find_duplicate(conn: sqlite3.Connection, student_id: str, samples: np.ndarray) -> str | None:
    """Name of another student whose enrolled face matches these samples, if any."""
    for r in conn.execute(
        """SELECT f.descriptors, s.name, s.roll_number, s.semester, s.division FROM face_profiles f
           JOIN students s ON s.id = f.student_id WHERE f.student_id != ?""",
        (student_id,),
    ):
        other = np.asarray(json.loads(r["descriptors"]), dtype=np.float32).reshape(-1, DESCRIPTOR_LEN)
        if other.size and float(np.linalg.norm(samples[:, None, :] - other[None, :, :], axis=2).min()) < DUPLICATE_FACE_DISTANCE:
            return f"{r['name']}, roll {r['roll_number']}, sem {r['semester']}{r['division']}"
    return None
