import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { LeaveType } from '../../types';
import { X, FileText, Check, AlertCircle, Upload, ShieldCheck } from 'lucide-react';
import { localDateString } from '../../utils/date';

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

const LEAVE_TYPES: { id: LeaveType; label: string; desc: string }[] = [
  { id: 'MEDICAL', label: 'Medical Leave', desc: 'Illness, hospitalization, or doctor prescribed rest' },
  { id: 'ON_DUTY_EVENT', label: 'College On-Duty (OD)', desc: 'Hackathons, conferences, symposiums, or cultural fest' },
  { id: 'SPORTS', label: 'Sports Representation', desc: 'Inter-collegiate, university, or national athletics/sports' },
  { id: 'PERSONAL', label: 'Personal / Family Emergency', desc: 'Family bereavement or critical personal emergency' },
];

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { applyLeave } = useAttendance();

  const todayStr = localDateString();
  const [leaveType, setLeaveType] = useState<LeaveType>('MEDICAL');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState('');
  const [docName, setDocName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!startDate || !endDate) {
      setError('Please select both start and end dates.');
      return;
    }
    if (endDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a valid explanation or reason for your leave.');
      return;
    }

    try {
      await applyLeave({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
        document_name: docName.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the application.');
      return;
    }

    onSuccess?.(`Leave application submitted successfully. Faculty and HOD will review your request.`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-md)',
                background: 'var(--blue-50)',
                color: 'var(--blue-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                Apply for Medical / Duty Leave (OD)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Approved leaves grant excused attendance credit to safeguard your standing
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {error && (
            <div className="alert alert-danger" style={{ padding: '0.65rem 0.875rem' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Leave Type */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Category of Leave</label>
            <select
              className="form-select form-select-sm"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — ({t.desc})
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">From Date *</label>
              <input
                type="date"
                className="form-input form-input-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">To Date *</label>
              <input
                type="date"
                className="form-input form-input-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Reason */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Reason / Purpose of Absence *</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Detail your medical condition, event name, or official duty representation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          {/* Document attachment */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Supporting Document (Certificate / OD Letter)</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                className="form-input form-input-sm"
                placeholder="e.g. doctor_prescription.pdf or od_approval.pdf"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDocName('medical_cert_' + Math.floor(Math.random() * 900 + 100) + '.pdf')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Upload size={13} /> Attach
              </button>
            </div>
          </div>

          {/* Info banner */}
          <div style={{ padding: '0.625rem 0.75rem', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--r-md)', fontSize: '0.75rem', color: 'var(--green-800)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <ShieldCheck size={16} color="var(--green-600)" style={{ flexShrink: 0 }} />
            <span>Approved duty &amp; medical leaves are recorded as <strong>EXCUSED</strong> and are credited towards your aggregate attendance percentage.</span>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Check size={14} /> Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
