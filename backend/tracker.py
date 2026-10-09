import numpy as np
from typing import List, Tuple, Dict, Optional
import time

class TrackState:
    NEW = 0
    TRACKED = 1
    LOST = 2
    REMOVED = 3

class KalmanFilter2D:
    """
    Kalman filter for tracking bounding boxes in image space [x, y, a, h].
    x, y: bounding box center
    a: aspect ratio (width / height)
    h: height
    """
    def __init__(self):
        ndim, dt = 4, 1.0
        self._motion_mat = np.eye(2 * ndim, 2 * ndim)
        for i in range(ndim):
            self._motion_mat[i, ndim + i] = dt
        self._update_mat = np.eye(ndim, 2 * ndim)

        self._std_weight_position = 1.0 / 20
        self._std_weight_velocity = 1.0 / 160

    def initiate(self, measurement: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        mean_pos = measurement
        mean_vel = np.zeros_like(mean_pos)
        mean = np.r_[mean_pos, mean_vel]

        std = [
            2 * self._std_weight_position * measurement[3],
            2 * self._std_weight_position * measurement[3],
            1e-2,
            2 * self._std_weight_position * measurement[3],
            10 * self._std_weight_velocity * measurement[3],
            10 * self._std_weight_velocity * measurement[3],
            1e-5,
            10 * self._std_weight_velocity * measurement[3],
        ]
        covariance = np.diag(np.square(std))
        return mean, covariance

    def predict(self, mean: np.ndarray, covariance: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        std_pos = [
            self._std_weight_position * mean[3],
            self._std_weight_position * mean[3],
            1e-2,
            self._std_weight_position * mean[3],
        ]
        std_vel = [
            self._std_weight_velocity * mean[3],
            self._std_weight_velocity * mean[3],
            1e-5,
            self._std_weight_velocity * mean[3],
        ]
        motion_cov = np.diag(np.square(np.r_[std_pos, std_vel]))

        mean = np.dot(self._motion_mat, mean)
        covariance = np.linalg.multi_dot((self._motion_mat, covariance, self._motion_mat.T)) + motion_cov
        return mean, covariance

    def project(self, mean: np.ndarray, covariance: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        std = [
            self._std_weight_position * mean[3],
            self._std_weight_position * mean[3],
            1e-1,
            self._std_weight_position * mean[3],
        ]
        innovation_cov = np.diag(np.square(std))
        mean = np.dot(self._update_mat, mean)
        covariance = np.linalg.multi_dot((self._update_mat, covariance, self._update_mat.T)) + innovation_cov
        return mean, covariance

    def update(self, mean: np.ndarray, covariance: np.ndarray, measurement: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        projected_mean, projected_cov = self.project(mean, covariance)
        try:
            kalman_gain = np.linalg.solve(projected_cov, self._update_mat.dot(covariance)).T
        except np.linalg.LinAlgError:
            kalman_gain = covariance.dot(self._update_mat.T).dot(np.linalg.pinv(projected_cov))

        innovation = measurement - projected_mean
        new_mean = mean + kalman_gain.dot(innovation)
        new_covariance = covariance - kalman_gain.dot(self._update_mat).dot(covariance)
        return new_mean, new_covariance


def bbox_xyxy_to_xyah(bbox: np.ndarray) -> np.ndarray:
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = bbox[0] + w / 2
    y = bbox[1] + h / 2
    return np.array([x, y, w / (h + 1e-6), h], dtype=np.float32)

def bbox_xyah_to_xyxy(xyah: np.ndarray) -> np.ndarray:
    w = xyah[2] * xyah[3]
    h = xyah[3]
    return np.array([
        xyah[0] - w / 2,
        xyah[1] - h / 2,
        xyah[0] + w / 2,
        xyah[1] + h / 2
    ], dtype=np.float32)

def compute_iou(boxA: np.ndarray, boxB: np.ndarray) -> float:
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    iou = interArea / float(boxAArea + boxBArea - interArea + 1e-6)
    return iou


class STrack:
    _count = 0

    def __init__(self, bbox: np.ndarray, score: float):
        STrack._count += 1
        self.track_id = STrack._count
        self.bbox = np.array(bbox, dtype=np.float32)
        self.score = float(score)
        self.state = TrackState.NEW
        self.is_activated = False

        self.kalman_filter = KalmanFilter2D()
        self.mean, self.covariance = self.kalman_filter.initiate(bbox_xyxy_to_xyah(self.bbox))

        self.frame_id = 0
        self.tracklet_len = 0
        self.first_seen = time.time()
        self.last_seen = time.time()
        self.consecutive_hits = 1

        # Associated student identity cache
        self.matched_student_id: Optional[str] = None
        self.matched_student_name: Optional[str] = None
        self.match_confidence: float = 0.0
        self.is_attendance_marked: bool = False

    def predict(self):
        if self.state != TrackState.TRACKED:
            self.mean[7] = 0
        self.mean, self.covariance = self.kalman_filter.predict(self.mean, self.covariance)
        self.bbox = bbox_xyah_to_xyxy(self.mean[:4])

    def update(self, new_track: 'STrack', frame_id: int):
        self.frame_id = frame_id
        self.tracklet_len += 1
        self.consecutive_hits += 1
        self.last_seen = time.time()

        self.mean, self.covariance = self.kalman_filter.update(
            self.mean, self.covariance, bbox_xyxy_to_xyah(new_track.bbox)
        )
        self.bbox = bbox_xyah_to_xyxy(self.mean[:4])
        self.score = new_track.score
        self.state = TrackState.TRACKED
        self.is_activated = True

    def mark_lost(self):
        self.state = TrackState.LOST
        self.consecutive_hits = 0

    def mark_removed(self):
        self.state = TrackState.REMOVED


class ByteTracker:
    """
    ByteTrack: Multi-Object Tracking by associating every detection box.
    Uses first-stage matching on high-score detections, and second-stage
    recovery matching on low-score detections to prevent occlusion drops.
    """
    def __init__(self, track_thresh: float = 0.5, match_thresh: float = 0.8, max_time_lost: int = 30):
        self.track_thresh = track_thresh
        self.match_thresh = match_thresh
        self.max_time_lost = max_time_lost
        self.frame_id = 0

        self.tracked_stracks: List[STrack] = []
        self.lost_stracks: List[STrack] = []
        self.removed_stracks: List[STrack] = []

    def update(self, detections: List[Tuple[np.ndarray, float]]) -> List[STrack]:
        """
        detections: List of (bbox [x1, y1, x2, y2], score)
        returns active STracks
        """
        self.frame_id += 1
        activated_stracks: List[STrack] = []
        refind_stracks: List[STrack] = []
        lost_stracks: List[STrack] = []
        removed_stracks: List[STrack] = []

        # Partition detections into high and low confidence (The ByteTrack Principle)
        det_high = [STrack(b, s) for b, s in detections if s >= self.track_thresh]
        det_low = [STrack(b, s) for b, s in detections if 0.1 <= s < self.track_thresh]

        # Predict Kalman states for existing tracked and lost tracks
        unconfirmed: List[STrack] = []
        tracked_stracks: List[STrack] = []
        for track in self.tracked_stracks:
            if not track.is_activated:
                unconfirmed.append(track)
            else:
                tracked_stracks.append(track)

        strack_pool = tracked_stracks + self.lost_stracks
        for strack in strack_pool:
            strack.predict()

        # Step 1: Match high-confidence detections with active track pool
        matched_a, u_track, u_detection = self._match(strack_pool, det_high, self.match_thresh)
        for t_idx, d_idx in matched_a:
            track = strack_pool[t_idx]
            det = det_high[d_idx]
            if track.state == TrackState.TRACKED:
                track.update(det, self.frame_id)
                activated_stracks.append(track)
            else:
                track.update(det, self.frame_id)
                refind_stracks.append(track)

        # Step 2: Match remaining tracks with low-confidence detections (recovers occluded/turning students)
        r_strack_pool = [strack_pool[i] for i in u_track if strack_pool[i].state == TrackState.TRACKED]
        matched_b, u_track_b, _ = self._match(r_strack_pool, det_low, 0.5)
        for t_idx, d_idx in matched_b:
            track = r_strack_pool[t_idx]
            det = det_low[d_idx]
            track.update(det, self.frame_id)
            activated_stracks.append(track)

        # Mark unmatched tracks as lost
        for i in u_track_b:
            track = r_strack_pool[i]
            if track.state != TrackState.LOST:
                track.mark_lost()
                lost_stracks.append(track)

        # Step 3: Deal with unconfirmed tracks
        matched_c, u_unconfirmed, u_det_high = self._match(unconfirmed, [det_high[i] for i in u_detection], 0.7)
        for t_idx, d_idx in matched_c:
            unconfirmed[t_idx].update(det_high[d_idx], self.frame_id)
            activated_stracks.append(unconfirmed[t_idx])
        for i in u_unconfirmed:
            unconfirmed[i].mark_removed()
            removed_stracks.append(unconfirmed[i])

        # Step 4: Initialize new tracks for unmatched high-confidence detections
        for i in u_det_high:
            track = det_high[i]
            if track.score >= self.track_thresh:
                track.state = TrackState.TRACKED
                track.is_activated = True
                track.frame_id = self.frame_id
                activated_stracks.append(track)

        # Update lists and purge tracks that exceeded max_time_lost
        for track in self.lost_stracks:
            if self.frame_id - track.frame_id > self.max_time_lost:
                track.mark_removed()
                removed_stracks.append(track)

        self.tracked_stracks = [t for t in self.tracked_stracks if t.state == TrackState.TRACKED]
        self.tracked_stracks += activated_stracks
        self.tracked_stracks += refind_stracks
        self.tracked_stracks = list({t.track_id: t for t in self.tracked_stracks}.values())

        self.lost_stracks = [t for t in self.lost_stracks if t.state == TrackState.LOST]
        self.lost_stracks += lost_stracks
        self.lost_stracks = list({t.track_id: t for t in self.lost_stracks}.values())

        return [t for t in self.tracked_stracks if t.is_activated]

    def _match(self, tracks: List[STrack], detections: List[STrack], thresh: float) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
        if len(tracks) == 0 or len(detections) == 0:
            return [], list(range(len(tracks))), list(range(len(detections)))

        # IoU distance matrix
        cost_matrix = np.zeros((len(tracks), len(detections)), dtype=np.float32)
        for i, t in enumerate(tracks):
            for j, d in enumerate(detections):
                cost_matrix[i, j] = compute_iou(t.bbox, d.bbox)

        # Greedy bipartite matching
        matched_pairs = []
        unmatched_tracks = set(range(len(tracks)))
        unmatched_dets = set(range(len(detections)))

        while len(unmatched_tracks) > 0 and len(unmatched_dets) > 0:
            best_val = -1
            best_i, best_j = -1, -1
            for i in unmatched_tracks:
                for j in unmatched_dets:
                    if cost_matrix[i, j] > best_val:
                        best_val = cost_matrix[i, j]
                        best_i, best_j = i, j

            if best_val < thresh:
                break

            matched_pairs.append((best_i, best_j))
            unmatched_tracks.remove(best_i)
            unmatched_dets.remove(best_j)

        return matched_pairs, list(unmatched_tracks), list(unmatched_dets)
