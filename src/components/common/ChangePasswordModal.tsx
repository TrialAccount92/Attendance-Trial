import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { useAttendance } from '../../context/AttendanceContext';
import { errorMessage } from '../../api/client';

interface ChangePasswordModalProps {
  onClose: () => void;
  /** When true (first sign-in with a temporary password) the modal can't be dismissed. */
  required?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, required = false }) => {
  const { changePassword, logout } = useAttendance();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');
    if (next === current) return setError('Choose a password different from the current one.');
    setSaving(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={required ? undefined : onClose}>
      <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={18} /> {required ? 'Set your password' : 'Change password'}
          </div>
          {!required && (
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </div>
        {done ? (
          <div>
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>Password updated. Other devices have been signed out.</div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
              Continue
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {required && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 0 }}>
                You signed in with a temporary password. Choose your own to continue.
              </p>
            )}
            <div className="form-group">
              <label className="form-label">{required ? 'Temporary password' : 'Current password'}</label>
              <input className="form-input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">New password</label>
              <input className="form-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm new password</label>
              <input className="form-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              {required ? (
                <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
                  Sign out
                </button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
