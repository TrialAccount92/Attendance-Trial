import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { X, UserPlus, AlertCircle } from 'lucide-react';
import { IssuedCredentials, Credential } from '../common/IssuedCredentials';
import { errorMessage } from '../../api/client';

interface AddFacultyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (facultyName: string) => void;
}

const DESIGNATIONS = [
  'Assistant Professor',
  'Associate Professor',
  'Professor',
  'Head of Department (HOD)',
  'Visiting Faculty',
  'Lecturer',
];

export const AddFacultyModal: React.FC<AddFacultyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { departments, facultyList, addFaculty } = useAttendance();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [designation, setDesignation] = useState('Assistant Professor');
  const [departmentId, setDepartmentId] = useState('dept-ce');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Credential | null>(null);

  // Auto-generate employee ID and email based on name
  useEffect(() => {
    if (name.trim()) {
      if (!email) {
        const clean = name.trim().toLowerCase().replace(/\s+/g, '.');
        setEmail(`${clean}@college.edu`);
      }
      if (!employeeId) {
        const nextNum = 100 + facultyList.length + 1;
        setEmployeeId(`EMP-${nextNum}`);
      }
    }
  }, [name, facultyList.length]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanEmpId = employeeId.trim();

    if (!cleanName) {
      setError('Please enter faculty member’s full name.');
      return;
    }
    if (!cleanEmail) {
      setError('Please enter faculty email address.');
      return;
    }
    if (!cleanEmpId) {
      setError('Please enter an employee ID.');
      return;
    }

    // Check duplicate employee ID
    const dupEmp = facultyList.find(
      (f) => f.employee_id.toLowerCase() === cleanEmpId.toLowerCase()
    );
    if (dupEmp) {
      setError(`Employee ID "${cleanEmpId}" is already assigned to ${dupEmp.name}.`);
      return;
    }

    try {
      const { faculty, tempPassword } = await addFaculty({
        name: cleanName,
        email: cleanEmail,
        employee_id: cleanEmpId,
        designation,
        department_id: departmentId,
      });

      setName('');
      setEmail('');
      setEmployeeId('');
      setDesignation('Assistant Professor');
      setIssued({ name: faculty.name, loginId: faculty.employee_id, password: tempPassword });
      if (onSuccess) onSuccess(faculty.name);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const close = () => {
    setIssued(null);
    setError(null);
    onClose();
  };

  if (issued) {
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 800, fontSize: '1.0625rem', marginBottom: '1rem' }}>{issued.name} added</div>
          <IssuedCredentials credentials={[issued]} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={close}>
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
              <UserPlus size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                Add New Faculty Member
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Register professor into academic directory and enable portal access
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

          {/* Name & Employee ID */}
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className="form-input form-input-sm"
                placeholder="e.g. Dr. Rajesh Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Employee ID *</label>
              <input
                type="text"
                className="form-input form-input-sm"
                placeholder="e.g. EMP104"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">College Email *</label>
            <input
              type="email"
              className="form-input form-input-sm"
              placeholder="e.g. rajesh.sharma@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Designation & Department */}
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Academic Designation</label>
              <select
                className="form-select form-select-sm"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              >
                {DESIGNATIONS.map((desig) => (
                  <option key={desig} value={desig}>{desig}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Department</label>
              <select
                className="form-select form-select-sm"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notice info */}
          <div style={{ padding: '0.625rem 0.75rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', fontSize: '0.75rem', color: 'var(--gray-600)' }}>
            A faculty login account will automatically be created. You can immediately allot classes to this professor or switch into their dashboard view from the navigation bar.
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <UserPlus size={14} /> Register Faculty
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
