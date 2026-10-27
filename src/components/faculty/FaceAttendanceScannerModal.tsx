/**
 * Live face-recognition attendance for one class.
 *
 * The browser measures each face (face-api.js landmarks + 128-D descriptor) and
 * follows it from frame to frame. Front-facing descriptors are sent to the
 * server, which says who the face is; enrolled descriptors never come to the
 * browser. Once a face has matched the same student in a few frames, its recent
 * frames go to the server, which re-checks the identity and the liveness (the
 * head must visibly turn: a photo held up to the camera can't do that) before
 * marking the student present.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeftRight, Camera, CameraOff, CheckCircle2, FlipHorizontal, Pause, Play, Power, RefreshCw,
  Scan, Settings2, UserPlus, Volume2, VolumeX, X,
} from 'lucide-react';
import { useAttendance } from '../../context/AttendanceContext';
import { CollegeClass, FaceFrame, Student } from '../../types';
import {
  DetectorKind,
  detectFaces,
  faceBackendName,
  FaceBox,
  iou,
  loadFaceModels,
  toFaceFrame,
  warmUpFaceModels,
} from '../../utils/faceRecognitionEngine';
import { applyHardwareZoom, inspectCameraCapabilities, soundEffects } from '../../utils/cameraZoomController';
import { errorMessage } from '../../api/client';
import { FaceEnrollmentModal } from '../student/FaceEnrollmentModal';

interface FaceAttendanceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetClass: CollegeClass | null;
}

interface ScanSettings {
  confirmFrames: number;
  detector: DetectorKind;
  inputSize: 320 | 416 | 512 | 608;
  sound: boolean;
}

interface RecentMark {
  studentId: string;
  name: string;
  roll: string;
  confidence: number;
  time: string;
}

type TrackStatus = 'unknown' | 'confirming' | 'need-move' | 'marked';

/** One face followed across frames. */
interface Track {
  id: number;
  box: FaceBox;
  lastFrame: number;
  frontal: boolean;
  studentId: string | null;
  name: string | null;
  roll: string | null;
  confidence: number;
  hits: number;
  frames: FaceFrame[];
  status: TrackStatus;
  nextAttempt: number;
  inflight: boolean;
}

const DEFAULT_SETTINGS: ScanSettings = { confirmFrames: 3, detector: 'fast', inputSize: 416, sound: true };

const FRAME_INTERVAL_MS = 200;
const TRACK_MAX_MISSED_FRAMES = 6;
const TRACK_KEEP_MS = 60000;
const TRACK_MAX_FRAMES = 150;
const RETRY_LIVENESS_MS = 1500;

export const FaceAttendanceScannerModal: React.FC<FaceAttendanceScannerModalProps> = ({ isOpen, onClose, targetClass }) => {
  const {
    classes, subjects, currentFaculty, currentRole, activeSession, records,
    startAttendanceSession, closeAttendanceSession, markAttendanceViaFace, manualUpdateAttendance,
    identifyFaces, getClassEnrolledStudents,
  } = useAttendance();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [classId, setClassId] = useState<string>(targetClass?.id ?? '');
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelError, setModelError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [scanning, setScanning] = useState(true);
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [tracksView, setTracksView] = useState<Track[]>([]);
  const [recent, setRecent] = useState<RecentMark[]>([]);
  const [fps, setFps] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [enrollStudent, setEnrollStudent] = useState<Student | null>(null);

  const cls = classes.find((c) => c.id === classId) ?? null;
  const subject = cls ? subjects.find((s) => s.id === cls.subject_id) : null;
  const myClasses = useMemo(
    () => (currentRole === 'ADMIN' ? classes : classes.filter((c) => c.faculty_id === currentFaculty?.id)),
    [classes, currentFaculty, currentRole]
  );
  const roster = useMemo(() => (cls ? getClassEnrolledStudents(cls.id) : []), [cls, getClassEnrolledStudents]);
  const session = activeSession && activeSession.class_id === classId ? activeSession : null;
  const otherSession = activeSession && activeSession.class_id !== classId ? activeSession : null;

  const presentIds = useMemo(() => {
    if (!session) return new Set<string>();
    return new Set(
      records
        .filter((r) => r.session_id === session.id && (r.status === 'PRESENT' || r.status === 'LATE'))
        .map((r) => r.student_id)
    );
  }, [records, session]);
  const methodById = useMemo(() => {
    const m = new Map<string, string>();
    if (session) for (const r of records) if (r.session_id === session.id) m.set(r.student_id, r.method);
    return m;
  }, [records, session]);

  // Mutable values read inside the frame loop.
  const loopState = useRef({
    classId: '',
    settings: DEFAULT_SETTINGS,
    sessionId: null as string | null,
    marked: new Set<string>(),
    tracks: [] as Track[],
    nextTrackId: 1,
    frame: 0,
    start: performance.now(),
    mirrored: true,
    paused: false,
  });

  // New session or class → forget local marks and tracks.
  useEffect(() => {
    loopState.current.marked = new Set();
    loopState.current.tracks = [];
    setRecent([]);
  }, [session?.id, classId]);

  // Mirror the latest render values into the ref the frame loop reads.
  useEffect(() => {
    const st = loopState.current;
    st.classId = classId;
    st.settings = settings;
    st.sessionId = session?.id ?? null;
    st.mirrored = mirrored;
    st.paused = !scanning || !!enrollStudent;
    for (const id of presentIds) st.marked.add(id);
  });

  useEffect(() => {
    if (isOpen) setClassId((prev) => targetClass?.id || prev || myClasses[0]?.id || '');
  }, [isOpen, targetClass, myClasses]);

  // ── Models ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setModelState('loading');
    loadFaceModels()
      .then(() => warmUpFaceModels())
      .then(() => setModelState('ready'))
      .catch((err) => {
        setModelError(errorMessage(err));
        setModelState('error');
      });
  }, [isOpen]);

  // ── Camera ───────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setZoomCaps(null);
  }, []);

  const startCamera = useCallback(
    async (id?: string) => {
      setCameraError(null);
      stopCamera();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: id
            ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraOn(true);
        const track = stream.getVideoTracks()[0];
        const caps = inspectCameraCapabilities(track);
        setZoomCaps(caps.supportsHardwareZoom ? { min: caps.minZoom, max: caps.maxZoom } : null);
        setZoom(caps.minZoom || 1);
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'videoinput'));
        if (!id) setDeviceId(track.getSettings().deviceId ?? '');
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        setCameraError(
          !window.isSecureContext
            ? 'The camera only works over HTTPS or on localhost.'
            : name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access in the browser and try again.'
              : name === 'NotFoundError'
                ? 'No camera found on this device.'
                : `Could not start the camera (${errorMessage(err)}).`
        );
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!isOpen) return;
    void startCamera();
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // ── Marking: the server verifies identity + liveness ─────────────────────
  const tryMark = useCallback(
    async (track: Track) => {
      const st = loopState.current;
      if (!track.studentId || !st.sessionId) return;
      track.inflight = true;
      const studentId = track.studentId;
      try {
        const res = await markAttendanceViaFace(st.sessionId, studentId, track.frames);
        if (res.status === 'MARKED' || res.status === 'ALREADY_MARKED') {
          st.marked.add(studentId);
          track.status = 'marked';
          if (res.status === 'MARKED') {
            if (st.settings.sound) soundEffects.playSuccessChime();
            setRecent((prev) =>
              [
                {
                  studentId,
                  name: track.name ?? res.student_name ?? 'Student',
                  roll: track.roll ?? '',
                  confidence: res.confidence ?? track.confidence,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                },
                ...prev,
              ].slice(0, 30)
            );
          }
        } else {
          track.status = res.status === 'NEED_LIVENESS' ? 'need-move' : 'confirming';
          track.nextAttempt = performance.now() + RETRY_LIVENESS_MS;
        }
      } catch (err) {
        // Identity didn't verify (or a replay was detected): start this face over.
        setNotice(errorMessage(err));
        track.studentId = null;
        track.name = null;
        track.hits = 0;
        track.frames = [];
        track.status = 'unknown';
        track.nextAttempt = performance.now() + RETRY_LIVENESS_MS;
      } finally {
        track.inflight = false;
      }
    },
    [markAttendanceViaFace]
  );

  // ── Frame loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || modelState !== 'ready' || !cameraOn) return;
    let stopped = false;
    let timer: number | undefined;
    let frames = 0;
    let fpsWindow = performance.now();

    const draw = (tracks: Track[]) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.max(1, canvas.width / 960);
      ctx.lineWidth = 3 * scale;
      ctx.font = `600 ${14 * scale}px system-ui, sans-serif`;
      const f = loopState.current.frame;
      for (const t of tracks) {
        if (t.lastFrame !== f) continue;
        const { x, y, width, height } = t.box;
        const left = loopState.current.mirrored ? canvas.width - x - width : x;
        const color =
          t.status === 'marked' ? '#22c55e' : t.status === 'need-move' ? '#a855f7' : t.studentId ? '#3b82f6' : '#f59e0b';
        ctx.strokeStyle = color;
        ctx.strokeRect(left, y, width, height);
        const label = !t.studentId
          ? t.frontal ? 'Unknown' : 'Face the camera'
          : t.status === 'marked'
            ? `${t.name} ✓`
            : t.status === 'need-move'
              ? `${t.name} · turn head ↔`
              : `${t.name} · confirming`;
        const tw = ctx.measureText(label).width + 10 * scale;
        ctx.fillStyle = color;
        ctx.fillRect(left, Math.max(0, y - 22 * scale), tw, 22 * scale);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, left + 5 * scale, Math.max(16 * scale, y - 6 * scale));
      }
    };

    const tick = async () => {
      if (stopped) return;
      const started = performance.now();
      const st = loopState.current;
      const video = videoRef.current;
      if (!st.paused && video && video.readyState >= 2 && video.videoWidth > 0 && st.classId) {
        try {
          const faces = await detectFaces(video, {
            detector: st.settings.detector,
            inputSize: st.settings.inputSize,
            minScore: 0.5,
          });
          const frameNo = ++st.frame;
          const now = performance.now();
          const t = now - st.start;

          // 1. Follow faces: pair each face with the track it overlaps most.
          const pairs: Array<[number, number, number]> = [];
          faces.forEach((face, fi) =>
            st.tracks.forEach((tr, ti) => {
              const o = iou(face.box, tr.box);
              if (o >= 0.3) pairs.push([o, fi, ti]);
            })
          );
          pairs.sort((a, b) => b[0] - a[0]);
          const faceTrack = new Map<number, Track>();
          const usedTracks = new Set<number>();
          for (const [, fi, ti] of pairs) {
            if (faceTrack.has(fi) || usedTracks.has(ti)) continue;
            faceTrack.set(fi, st.tracks[ti]);
            usedTracks.add(ti);
          }
          faces.forEach((face, fi) => {
            let tr = faceTrack.get(fi);
            if (!tr) {
              tr = {
                id: st.nextTrackId++, box: face.box, lastFrame: frameNo, frontal: face.frontal, studentId: null, name: null,
                roll: null, confidence: 0, hits: 0, frames: [], status: 'unknown', nextAttempt: 0, inflight: false,
              };
              st.tracks.push(tr);
              faceTrack.set(fi, tr);
            }
            tr.box = face.box;
            tr.lastFrame = frameNo;
            tr.frontal = face.frontal;
            tr.frames.push(toFaceFrame(face, t));
            tr.frames = tr.frames.filter((fr) => t - fr.t <= TRACK_KEEP_MS).slice(-TRACK_MAX_FRAMES);
          });
          st.tracks = st.tracks.filter((tr) => frameNo - tr.lastFrame <= TRACK_MAX_MISSED_FRAMES);

          // 2. Ask the server who the front-facing faces are.
          const frontal = faces.map((face, fi) => [face, fi] as const).filter(([face]) => face.frontal && face.descriptor);
          if (frontal.length) {
            const res = await identifyFaces(st.classId, frontal.map(([face]) => Array.from(face.descriptor!)));
            res.matches.forEach((m, k) => {
              const tr = faceTrack.get(frontal[k][1]);
              if (!tr) return;
              if (!m) {
                if (!tr.studentId) tr.status = 'unknown';
                return;
              }
              if (tr.studentId !== m.student_id) {
                // New (or changed) identity: start collecting evidence afresh.
                tr.studentId = m.student_id;
                tr.name = m.name;
                tr.roll = m.roll_number;
                tr.hits = 0;
                tr.frames = tr.frames.slice(-1);
                tr.status = 'confirming';
              }
              tr.hits++;
              tr.confidence = m.confidence;
              if (st.marked.has(m.student_id)) tr.status = 'marked';
            });
          }

          // 3. Enough consistent matches → let the server verify and mark.
          for (const tr of st.tracks) {
            if (
              tr.studentId &&
              st.sessionId &&
              tr.status !== 'marked' &&
              !tr.inflight &&
              tr.hits >= st.settings.confirmFrames &&
              now >= tr.nextAttempt
            ) {
              if (st.marked.has(tr.studentId)) tr.status = 'marked';
              else void tryMark(tr);
            }
          }

          if (!stopped) {
            setTracksView(st.tracks.filter((tr) => tr.lastFrame === frameNo).map((tr) => ({ ...tr })));
            draw(st.tracks);
          }
          frames++;
          const elapsed = performance.now() - fpsWindow;
          if (elapsed > 1000) {
            setFps(Math.round((frames * 10000) / elapsed) / 10);
            frames = 0;
            fpsWindow = performance.now();
          }
        } catch (err) {
          if (!stopped) setNotice(errorMessage(err));
        }
      } else if (st.paused) {
        draw([]);
      }
      const spent = performance.now() - started;
      timer = window.setTimeout(tick, Math.max(30, FRAME_INTERVAL_MS - spent));
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, modelState, cameraOn, tryMark, identifyFaces]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleStartSession = async () => {
    if (!cls) return;
    if (otherSession && !window.confirm('Another class has a live session. Starting this one will end it. Continue?')) return;
    setBusy('Starting session…');
    try {
      await startAttendanceSession(cls.id, 'Face recognition attendance', { mode: 'FACE' });
      setNotice(null);
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleEndSession = async () => {
    if (!session) return;
    if (!window.confirm('End this session? Students not marked present will be recorded absent.')) return;
    setBusy('Closing session…');
    try {
      const res = await closeAttendanceSession(session.id);
      setNotice(`Session closed: ${res.present} present, ${res.marked_absent} marked absent.`);
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  // Enrollment uses its own guided camera view, so release this camera meanwhile.
  const handleEnrollFromCamera = (student: Student) => {
    stopCamera();
    setEnrollStudent(student);
  };

  const handleEnrollClosed = () => {
    setEnrollStudent(null);
    void startCamera(deviceId || undefined);
  };

  const handleZoom = async (value: number) => {
    setZoom(value);
    await applyHardwareZoom(streamRef.current?.getVideoTracks()[0] ?? null, value);
  };

  if (!isOpen) return null;

  const enrolledIds = new Set(roster.filter((s) => s.face_registered).map((s) => s.id));
  const unknownCount = tracksView.filter((t) => !t.studentId).length;
  const waitingMove = tracksView.filter((t) => t.status === 'need-move');
  const presentCount = roster.filter((s) => presentIds.has(s.id)).length;
  const notEnrolledCount = roster.filter((s) => !enrolledIds.has(s.id)).length;
  const lockProgress: Record<string, string> = {};
  for (const t of tracksView) {
    if (t.studentId) lockProgress[t.studentId] = t.status === 'need-move' ? 'turn head' : t.status === 'confirming' ? 'confirming' : '';
  }

  return (
    <div className="modal-overlay" onClick={busy || enrollStudent ? undefined : onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 1240, width: '96%', padding: '1rem 1.25rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Scan size={20} color="var(--brand)" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-heading)' }}>Face Recognition Attendance</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {modelState === 'loading' && 'Loading recognition models…'}
                {modelState === 'ready' && `Models ready (${faceBackendName()}) · ${fps} fps · ${enrolledIds.size}/${roster.length} faces enrolled · matching on server`}
                {modelState === 'error' && <span style={{ color: 'var(--red)' }}>{modelError}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto', maxWidth: 280 }}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!!session}
              title={session ? 'End the session to switch class' : 'Class'}
            >
              {myClasses.map((c) => {
                const sub = subjects.find((s) => s.id === c.subject_id);
                return (
                  <option key={c.id} value={c.id}>
                    {sub?.name ?? 'Class'} — Sem {c.semester} Div {c.division}
                  </option>
                );
              })}
            </select>
            {session ? (
              <button className="btn btn-danger btn-sm" onClick={handleEndSession} disabled={!!busy}>
                <Power size={13} /> End session
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={handleStartSession} disabled={!cls || !!busy}>
                <Play size={13} /> Start session
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={!!busy || !!enrollStudent} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {!session && (
          <div className="alert alert-warning" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>
              Recognition is running as a preview. Start a session for {subject?.name ?? 'this class'} to mark attendance.
              {otherSession && ' (A session for another class is currently live.)'}
            </span>
          </div>
        )}
        {session && presentCount < roster.length && (
          <div
            className="alert"
            style={{ fontSize: '0.8125rem', marginBottom: '0.75rem', background: '#f5f3ff', borderColor: '#ddd6fe', color: '#5b21b6' }}
          >
            <ArrowLeftRight size={14} style={{ flexShrink: 0 }} />
            <span>
              <strong>Tell the class:</strong> “Look at the camera, then slowly turn your head to one side and back.” The
              head turn proves each face is a real person, not a photo
              {waitingMove.length > 0 && ` — waiting on ${waitingMove.map((t) => t.name).join(', ')}`}.
            </span>
          </div>
        )}
        {(notice || busy) && (
          <div className="alert alert-info" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem', cursor: 'pointer' }} onClick={() => setNotice(null)}>
            {busy ?? notice}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Camera */}
          <div style={{ flex: '2 1 520px', minWidth: 0 }}>
            <div
              style={{
                position: 'relative',
                background: '#020617',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                aspectRatio: '16 / 9',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: mirrored ? 'scaleX(-1)' : 'none' }}
              />
              <canvas
                ref={canvasRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
              />
              {!cameraOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#cbd5e1', textAlign: 'center', padding: '1rem' }}>
                  <div>
                    <CameraOff size={32} style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>{cameraError ?? 'Starting camera…'}</div>
                    {cameraError && (
                      <button className="btn btn-secondary btn-sm" onClick={() => startCamera(deviceId || undefined)}>
                        <RefreshCw size={13} /> Try again
                      </button>
                    )}
                  </div>
                </div>
              )}
              {cameraOn && (
                <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge" style={{ background: 'rgba(2,6,23,0.7)', color: '#fff' }}>
                    {tracksView.length} face{tracksView.length === 1 ? '' : 's'} · {unknownCount} unknown
                  </span>
                  {!scanning && <span className="badge badge-warning">Paused</span>}
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.625rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setScanning((v) => !v)} disabled={!cameraOn}>
                {scanning ? <Pause size={13} /> : <Play size={13} />} {scanning ? 'Pause' : 'Resume'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setMirrored((v) => !v)} title="Mirror preview">
                <FlipHorizontal size={13} />
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSettings((s) => ({ ...s, sound: !s.sound }))}
                title={settings.sound ? 'Mute' : 'Unmute'}
              >
                {settings.sound ? <Volume2 size={13} /> : <VolumeX size={13} />}
              </button>
              {devices.length > 1 && (
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto', maxWidth: 220 }}
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    void startCamera(e.target.value);
                  }}
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
              {zoomCaps && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                  <Camera size={13} /> Zoom
                  <input
                    type="range"
                    min={zoomCaps.min}
                    max={zoomCaps.max}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => void handleZoom(Number(e.target.value))}
                  />
                  {zoom.toFixed(1)}×
                </label>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings((v) => !v)}>
                <Settings2 size={13} /> Settings
              </button>
            </div>

            {showSettings && (
              <div style={{ marginTop: '0.625rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
                <label>
                  <div style={{ fontWeight: 600 }}>Frames to confirm: {settings.confirmFrames}</div>
                  <input
                    type="range"
                    min={3}
                    max={8}
                    step={1}
                    value={settings.confirmFrames}
                    onChange={(e) => setSettings((s) => ({ ...s, confirmFrames: Number(e.target.value) }))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Front-facing matches needed before asking the server to mark (the server needs at least 3).
                  </div>
                </label>
                <label>
                  <div style={{ fontWeight: 600 }}>Detector</div>
                  <select
                    className="form-select form-select-sm"
                    value={`${settings.detector}:${settings.inputSize}`}
                    onChange={(e) => {
                      const [det, size] = e.target.value.split(':');
                      setSettings((s) => ({ ...s, detector: det as DetectorKind, inputSize: Number(size) as ScanSettings['inputSize'] }));
                    }}
                  >
                    <option value="fast:320">Fast — front rows</option>
                    <option value="fast:416">Balanced (default)</option>
                    <option value="fast:608">Far rows — more detail, slower</option>
                    <option value="accurate:416">Accurate (SSD MobileNet) — slowest</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* Roster */}
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {[
                { label: 'Present', value: presentCount, color: 'var(--green)' },
                { label: 'Remaining', value: roster.length - presentCount, color: 'var(--text-heading)' },
                { label: 'No face', value: notEnrolledCount, color: 'var(--amber)' },
              ].map((k) => (
                <div key={k.label} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{k.label}</div>
                </div>
              ))}
            </div>

            {recent.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
                  Recognised just now
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                  {recent.map((r) => (
                    <div key={`${r.studentId}-${r.time}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span><CheckCircle2 size={11} color="var(--green)" /> {r.name} ({r.roll})</span>
                      <span style={{ color: 'var(--text-muted)' }}>{Math.round(r.confidence * 100)}% · {r.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
              Class roster
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {roster.map((stu) => {
                const present = presentIds.has(stu.id);
                const enrolled = enrolledIds.has(stu.id);
                const progress = lockProgress[stu.id];
                return (
                  <div key={stu.id} className={`roster-row${present ? ' is-present' : ''}`} style={{ padding: '0.4rem 0.6rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stu.name}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        Roll {stu.roll_number}
                        {!enrolled && ' · no face enrolled'}
                        {!present && progress && ` · ${progress}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {present ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={13} /> {methodById.get(stu.id) === 'FACE' ? 'Face' : methodById.get(stu.id) === 'QR' ? 'QR' : 'Manual'}
                        </span>
                      ) : (
                        <>
                          {!enrolled && (
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Enroll this student's face from the camera"
                              disabled={modelState !== 'ready' || !!enrollStudent}
                              onClick={() => handleEnrollFromCamera(stu)}
                            >
                              <UserPlus size={12} />
                            </button>
                          )}
                          {session && (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => manualUpdateAttendance(session.id, stu.id, session.class_id, 'PRESENT')}
                            >
                              Present
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {roster.length === 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem 0' }}>No students are enrolled in this class.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <FaceEnrollmentModal isOpen={!!enrollStudent} student={enrollStudent} onClose={handleEnrollClosed} />
    </div>
  );
};