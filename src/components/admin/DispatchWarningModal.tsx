import React, { useState } from 'react';
import { Student } from '../../types';
import { X, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAttendance } from '../../context/AttendanceContext';

interface DefaulterItem {
  student: Student;
  pct: number;
  total: number;
  present: number;
  absent: number;
}

interface DispatchWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaulters: DefaulterItem[];
  thresholdPct: number;
  onDispatchSuccess: (sent: number, queued: number) => void;
}

export const DispatchWarningModal: React.FC<DispatchWarningModalProps> = ({
  isOpen,
  onClose,
  defaulters,
  thresholdPct,
  onDispatchSuccess,
}) => {
  const { dispatchNotices } = useAttendance();
  const [subject, setSubject] = useState('Attendance shortfall — exam eligibility warning');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; queued: number; failed: number; email_configured: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const body =
    message ||
    `Dear {name},\n\nYour overall attendance is below the mandatory ${thresholdPct}% required for semester examinations. ` +
      'Please attend all upcoming lectures and contact your class teacher if you have approved leave that is not yet recorded.\n\n— Attendance Committee';

  const handleSend = async () => {
    setIsSending(true);
    setError(null);
    try {
      const res = await dispatchNotices(defaulters.map((d) => d.student.id), subject, body);
      setResult(res);
      onDispatchSuccess(res.sent, res.queued);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send notices.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-box"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Head */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-sm)',
                background: 'var(--amber-50)',
                border: '1px solid var(--amber-200)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--amber-600)',
              }}
            >
              <AlertTriangle size={17} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.0625rem', margin: 0, fontWeight: 700, color: 'var(--gray-900)' }}>
                Dispatch Defaulter Warning Notices
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Official institutional alert for students with attendance below {thresholdPct}%
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleClose}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
          {result ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'var(--green-50)',
                  border: '1px solid var(--green-200)',
                  color: 'var(--green-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                }}
              >
                <CheckCircle2 size={28} />
              </div>
              <h3 style={{ margin: '0 0 0.5rem', fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                {result.email_configured ? `${result.sent} email notice(s) sent` : `${result.queued} notice(s) queued`}
              </h3>
              <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', maxWidth: 440, margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                {result.email_configured
                  ? result.failed > 0
                    ? `${result.failed} could not be delivered — check the server's SMTP settings.`
                    : 'Each student received the notice at their registered email address.'
                  : 'No email server is configured, so the notices were saved to the outbox only. Set SMTP_HOST (see backend/README.md) to send them.'}
              </p>
              <button className="btn btn-primary" onClick={handleClose}>
                Done &amp; Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Defaulter Count Summary Banner */}
              <div
                style={{
                  background: 'var(--red-50)',
                  border: '1px solid var(--red-200)',
                  borderRadius: 'var(--r-sm)',
                  padding: '0.875rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--red-700)', fontSize: '0.875rem' }}>
                    {defaulters.length} Student(s) Selected for Notice
                  </strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: 2 }}>
                    Criteria: Overall attendance strictly below {thresholdPct}% minimum mandatory requirement
                  </div>
                </div>
                <span className="badge badge-danger" style={{ fontWeight: 800 }}>
                  CRITICAL DEFICIT
                </span>
              </div>

              {/* Roster Preview */}
              <div>
                <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--gray-400)', marginBottom: '0.5rem' }}>
                  Recipients Preview ({defaulters.length} Students)
                </div>
                <div
                  style={{
                    maxHeight: 170,
                    overflowY: 'auto',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--gray-50)',
                  }}
                >
                  <table className="data-table" style={{ margin: 0, fontSize: '0.75rem' }}>
                    <thead>
                      <tr>
                        <th>Roll</th>
                        <th>Student Name</th>
                        <th>Sem / Div</th>
                        <th>Attendance %</th>
                        <th>Shortfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defaulters.map(({ student: s, pct, total, absent }) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 700 }}>{s.roll_number}</td>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>Sem {s.semester}-{s.division}</td>
                          <td style={{ color: 'var(--red-600)', fontWeight: 800 }}>{pct}%</td>
                          <td style={{ color: 'var(--gray-500)' }}>{absent} missed of {total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Email subject</label>
                <input className="form-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Message ({'{name}'} is replaced with each student's name)</label>
                <textarea className="form-textarea" rows={5} value={body} onChange={(e) => setMessage(e.target.value)} />
              </div>
              {error && <div className="alert alert-danger" style={{ fontSize: '0.8125rem' }}>{error}</div>}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isSending}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={isSending || defaulters.length === 0}
                >
                  <Send size={14} />
                  {isSending ? 'Sending…' : `Email ${defaulters.length} student${defaulters.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
