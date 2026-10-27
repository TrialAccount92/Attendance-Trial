import React, { useEffect, useState } from 'react';
import { useAttendance, StartSessionOptions } from '../../context/AttendanceContext';
import { QRCodeSVG } from 'qrcode.react';
import { X, Clock, Power, QrCode, CheckCircle2, Users, Scan, MapPin, AlertCircle } from 'lucide-react';
import { FaceAttendanceScannerModal } from './FaceAttendanceScannerModal';
import { SessionQR } from '../../types';
import { errorMessage } from '../../api/client';

interface ActiveSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (classId: string, topic?: string, options?: StartSessionOptions) => Promise<void>;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot share location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Location permission was denied.')), {
      enableHighAccuracy: true,
      timeout: 15000,
    });
  });
}

const METHOD_LABEL: Record<string, string> = { QR: 'QR', FACE: 'Face', MANUAL: 'Manual' };

export const ActiveSessionModal: React.FC<ActiveSessionModalProps> = ({ isOpen, onClose, onStart }) => {
  const {
    activeSession, classes, subjects, records, getSessionQR, closeAttendanceSession,
    manualUpdateAttendance, currentFaculty, getClassEnrolledStudents,
  } = useAttendance();

  const [qr, setQr] = useState<SessionQR | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedClassId, setSelectedClassId] = useState('');
  const [topic, setTopic] = useState('');
  const [requireLocation, setRequireLocation] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);

  const sessionId = activeSession?.id;

  // Fetch the server-signed QR, and fetch again whenever it rotates.
  useEffect(() => {
    if (!isOpen || !sessionId) {
      setQr(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const next = await getSessionQR(sessionId);
        if (cancelled) return;
        setQr(next);
        setQrError(null);
        timer = window.setTimeout(load, Math.max(500, next.expires_at - Date.now() + 250));
      } catch (err) {
        if (cancelled) return;
        setQrError(errorMessage(err));
        timer = window.setTimeout(load, 3000);
      }
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, sessionId, getSessionQR]);

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  const myClasses = currentFaculty ? classes.filter((c) => c.faculty_id === currentFaculty.id) : [];

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      let options: StartSessionOptions = { mode: 'QR' };
      if (requireLocation) {
        const pos = await getPosition();
        options = { ...options, requireLocation: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
      await onStart(selectedClassId, topic, options);
      setTopic('');
    } catch (err) {
      setStartError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  // --- No active session: class picker ---
  if (!activeSession) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-heading)' }}>Start QR Attendance Session</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Students scan the code on your screen</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="form-group">
            <label className="form-label">Class</label>
            <select className="form-select form-select-sm" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              <option value="">Choose a class…</option>
              {myClasses.map((c) => {
                const s = subjects.find((sub) => sub.id === c.subject_id);
                return <option key={c.id} value={c.id}>{s?.name} — Sem {c.semester} Div {c.division} · {c.schedule_time}</option>;
              })}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Topic covered today (optional)</label>
            <input
              type="text"
              className="form-input form-input-sm"
              placeholder="e.g. Graph Traversals (BFS & DFS)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.8125rem', marginBottom: '1rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={requireLocation} onChange={(e) => setRequireLocation(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <strong><MapPin size={12} style={{ verticalAlign: 'middle' }} /> Only accept scans from inside the classroom</strong>
              <br />
              <span style={{ color: 'var(--text-muted)' }}>
                Uses this device's location; students must be within 150 m and allow location access. Needs HTTPS (or localhost).
              </span>
            </span>
          </label>
          <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
            <QrCode size={14} style={{ flexShrink: 0 }} />
            The code is signed by the server and changes every 30 seconds, so a photo of an old code stops working.
          </div>
          {startError && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> {startError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!selectedClassId || starting} onClick={handleStart}>
              <QrCode size={14} />
              {starting ? 'Starting…' : 'Start Session'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentClass = classes.find((c) => c.id === activeSession.class_id) ?? null;
  const currentSubject = currentClass ? subjects.find((s) => s.id === currentClass.subject_id) : null;
  const enrolledStudents = currentClass ? getClassEnrolledStudents(currentClass.id) : [];
  const sessionRecords = records.filter((r) => r.session_id === activeSession.id);
  const presentIds = new Set(sessionRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').map((r) => r.student_id));
  const presentCount = presentIds.size;
  const total = enrolledStudents.length;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;
  const interval = qr?.interval_sec ?? activeSession.token_refresh_interval_sec ?? 30;
  const timeLeft = qr ? Math.max(0, Math.ceil((qr.expires_at - now) / 1000)) : interval;

  const handleClose = async () => {
    if (!window.confirm('End this session? Students who have not been marked will be recorded absent.')) return;
    try {
      const res = await closeAttendanceSession(activeSession.id);
      window.alert(`Session closed: ${res.present} present, ${res.marked_absent} marked absent.`);
      onClose();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  };

  // --- Active session: QR display + live roster ---
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 820, width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="pulse-indicator" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-heading)' }}>
                {currentSubject?.name} — Division {currentClass?.division}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Room {currentClass?.room} · Started {new Date(activeSession.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {activeSession.topic && <span> · Topic: <strong>{activeSession.topic}</strong></span>}
                {activeSession.require_location && <span> · <MapPin size={11} style={{ verticalAlign: 'middle' }} /> location check on</span>}
              </div>
            </div>
            <span className="badge badge-success">Live</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setIsFaceModalOpen(true)}>
              <Scan size={13} />
              Face Scanner
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleClose}>
              <Power size={13} />
              End Session
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: 'var(--brand-light)', border: '1px solid var(--brand-muted)',
              borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
            }}>
              <div className="dynamic-qr-card">
                <div className="qr-timer-pill">
                  <Clock size={11} />
                  {qr ? `Changes in ${timeLeft}s` : 'Loading code…'}
                </div>
                <div style={{ margin: '0.75rem 0', minHeight: 232, display: 'grid', placeItems: 'center' }}>
                  {qr ? (
                    <QRCodeSVG value={qr.payload} size={232} level="M" marginSize={2} bgColor="#ffffff" fgColor="#0f172a" />
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{qrError ?? 'Loading…'}</span>
                  )}
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>New code every {interval}s</span>
                  <span style={{ fontWeight: 700, color: timeLeft <= 5 ? 'var(--red)' : 'var(--brand)' }}>{timeLeft}s</span>
                </div>
                <div className="progress-bar-track" style={{ height: 5 }}>
                  <div className="progress-bar-fill" style={{ width: `${(timeLeft / interval) * 100}%`, backgroundColor: timeLeft <= 5 ? 'var(--red)' : 'var(--brand)', transition: 'width 0.5s linear, background-color 0.3s' }} />
                </div>
              </div>
            </div>

            <div style={{ width: '100%', padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <Users size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Present so far
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.25rem', color: rate >= 75 ? 'var(--green)' : 'var(--amber)' }}>{presentCount}/{total} ({rate}%)</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${rate}%`, backgroundColor: rate >= 75 ? 'var(--green)' : 'var(--amber)' }} />
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem' }}>
              Live Roster ({presentCount} present)
            </div>
            <div style={{ maxHeight: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {enrolledStudents.map((stu) => {
                const isPresent = presentIds.has(stu.id);
                const rec = sessionRecords.find((r) => r.student_id === stu.id);
                return (
                  <div key={stu.id} className={`roster-row${isPresent ? ' is-present' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 'var(--radius-full)', flexShrink: 0,
                        background: isPresent ? 'var(--green)' : 'var(--bg-subtle-2)',
                        color: isPresent ? '#fff' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700,
                      }}>
                        {stu.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stu.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{stu.roll_number}</div>
                      </div>
                    </div>
                    {isPresent ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: 'var(--green)', flexShrink: 0 }}>
                        <CheckCircle2 size={13} />
                        {METHOD_LABEL[rec?.method ?? 'MANUAL']}
                      </span>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flexShrink: 0, fontSize: '0.6875rem' }}
                        onClick={() => manualUpdateAttendance(activeSession.id, stu.id, activeSession.class_id, 'PRESENT')}
                      >
                        Mark Present
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <FaceAttendanceScannerModal
        isOpen={isFaceModalOpen}
        onClose={() => setIsFaceModalOpen(false)}
        targetClass={currentClass}
      />
    </div>
  );
};
