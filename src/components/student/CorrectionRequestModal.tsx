import React, { useMemo, useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { X, AlertCircle } from 'lucide-react';
import { errorMessage } from '../../api/client';

interface CorrectionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CorrectionRequestModal: React.FC<CorrectionRequestModalProps> = ({ isOpen, onClose }) => {
  const { currentStudent, classes, subjects, sessions, records, correctionRequests, submitCorrectionRequest } = useAttendance();
  const [sessionId, setSessionId] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lectures this student was marked absent for, newest first, without a pending request.
  const disputable = useMemo(() => {
    if (!currentStudent) return [];
    const pending = new Set(correctionRequests.filter((r) => r.status === 'PENDING').map((r) => r.session_id));
    const sessionById = new Map(sessions.map((s) => [s.id, s] as const));
    return records
      .filter((r) => r.student_id === currentStudent.id && r.status === 'ABSENT' && !pending.has(r.session_id))
      .map((r) => {
        const sess = sessionById.get(r.session_id);
        const cls = classes.find((c) => c.id === r.class_id);
        const sub = subjects.find((s) => s.id === cls?.subject_id);
        return { sessionId: r.session_id, start: sess?.start_time ?? r.marked_at, subject: sub?.name ?? 'Class' };
      })
      .sort((a, b) => b.start.localeCompare(a.start));
  }, [currentStudent, records, sessions, classes, subjects, correctionRequests]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCorrectionRequest(sessionId, reason.trim());
      setSubmitted(true);
      setSessionId('');
      setReason('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-heading)' }}>Dispute / OD Request</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Ask your teacher to correct an absence</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={close} aria-label="Close"><X size={18} /></button>
        </div>

        {submitted ? (
          <div className="alert alert-success" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.5rem' }}>
            <AlertCircle size={36} style={{ marginBottom: '0.5rem', color: 'var(--green)' }} />
            <strong>Request Submitted</strong>
            <p style={{ fontSize: '0.8125rem', marginTop: 6, opacity: 0.85 }}>Your faculty will review and respond soon. You'll see the status in your dashboard.</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={close}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Lecture you were marked absent for</label>
              <select className="form-select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} required>
                <option value="">{disputable.length ? 'Choose a lecture…' : 'No absences to dispute'}</option>
                {disputable.map((d) => (
                  <option key={d.sessionId} value={d.sessionId}>
                    {d.subject} — {new Date(d.start).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="Describe why you were absent or why the record needs correction…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <div className="alert alert-warning" style={{ marginBottom: '1rem', fontSize: '0.75rem', padding: '0.625rem 0.875rem' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              Supporting documents (medical certificate, OD letter) should be submitted physically to your faculty.
            </div>
            {error && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !sessionId}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
