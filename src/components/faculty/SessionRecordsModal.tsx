import React, { useEffect, useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import { useAttendance } from '../../context/AttendanceContext';
import { AttendanceStatus } from '../../types';
import { errorMessage } from '../../api/client';

interface SessionRecordsModalProps {
  sessionId: string | null;
  onClose: () => void;
}

const STATUSES: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

/** Edit the attendance of one past lecture without creating a new session. */
export const SessionRecordsModal: React.FC<SessionRecordsModalProps> = ({ sessionId, onClose }) => {
  const { sessions, classes, subjects, getClassEnrolledStudents, getSessionAttendanceMap, manualUpdateAttendance } =
    useAttendance();
  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const cls = session ? classes.find((c) => c.id === session.class_id) : undefined;
  const subject = cls ? subjects.find((s) => s.id === cls.subject_id) : undefined;
  const roster = useMemo(() => (cls ? getClassEnrolledStudents(cls.id) : []), [cls, getClassEnrolledStudents]);
  const current = useMemo(() => (sessionId ? getSessionAttendanceMap(sessionId) : {}), [sessionId, getSessionAttendanceMap]);

  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({});
    setError(null);
  }, [sessionId]);

  if (!session || !cls) return null;

  const statusOf = (studentId: string): AttendanceStatus | '' => draft[studentId] ?? current[studentId]?.status ?? '';
  const changes = Object.entries(draft).filter(([id, st]) => current[id]?.status !== st);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const [studentId, status] of changes) {
        await manualUpdateAttendance(session.id, studentId, cls.id, status);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-heading)' }}>
              {subject?.name} · Sem {cls.semester}-{cls.division}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Lecture of {new Date(session.start_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              {session.topic ? ` · ${session.topic}` : ''}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {roster.map((stu) => {
            const st = statusOf(stu.id);
            const changed = draft[stu.id] !== undefined && draft[stu.id] !== current[stu.id]?.status;
            return (
              <div key={stu.id} className="roster-row" style={changed ? { borderColor: 'var(--blue-500)' } : undefined}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{stu.name}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                    Roll {stu.roll_number}
                    {current[stu.id] ? ` · via ${current[stu.id].method.toLowerCase()}` : ' · no record'}
                  </div>
                </div>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={st}
                  onChange={(e) => setDraft((d) => ({ ...d, [stu.id]: e.target.value as AttendanceStatus }))}
                >
                  {st === '' && <option value="">—</option>}
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginTop: '0.75rem', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || changes.length === 0}>
            <Save size={14} /> {saving ? 'Saving…' : `Save ${changes.length || ''} change${changes.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
