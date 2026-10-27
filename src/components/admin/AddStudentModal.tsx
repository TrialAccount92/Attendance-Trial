import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { X, UserPlus, GraduationCap, CheckCircle2, AlertCircle } from 'lucide-react';
import { IssuedCredentials, Credential } from '../common/IssuedCredentials';
import { errorMessage } from '../../api/client';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (studentName: string) => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { departments, classes, subjects, students, addStudent } = useAttendance();

  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [departmentId, setDepartmentId] = useState('dept-ce');
  const [semester, setSemester] = useState<number>(3);
  const [division, setDivision] = useState('A');
  const [issued, setIssued] = useState<Credential | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Suggest a college email from the name (the enrollment number is generated server-side if left blank).
  useEffect(() => {
    if (name.trim() && !email) {
      const cleanName = name.trim().toLowerCase().replace(/\s+/g, '.');
      setEmail(`${cleanName}@student.college.edu`);
    }
  }, [name]);

  if (!isOpen) return null;

  const close = () => {
    setIssued(null);
    setError(null);
    onClose();
  };

  if (issued) {
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <h2 style={{ fontSize: '1.0625rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} color="var(--green-600)" /> {issued.name} registered
            </h2>
          </div>
          <div className="modal-body">
            <IssuedCredentials credentials={[issued]} />
          </div>
          <div className="modal-foot">
            <button className="btn btn-secondary" onClick={() => setIssued(null)}>Add another</button>
            <button className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  // Matching classes for this cohort
  const matchingClasses = classes.filter(
    (c) => c.semester === semester && c.division === division
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanRoll = rollNumber.trim();

    if (!cleanName) {
      setError('Please enter the student’s full name.');
      return;
    }
    if (!cleanRoll) {
      setError('Please enter a valid roll number.');
      return;
    }

    // Check duplicate roll in same semester & division
    const duplicate = students.find(
      (s) =>
        s.semester === semester &&
        s.division.toUpperCase() === division.toUpperCase() &&
        s.roll_number.toLowerCase() === cleanRoll.toLowerCase()
    );

    if (duplicate) {
      setError(`Roll number "${cleanRoll}" is already assigned to ${duplicate.name} in Semester ${semester}, Division ${division}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const { student, tempPassword } = await addStudent({
        name: cleanName,
        roll_number: cleanRoll,
        enrollment_number: enrollmentNumber.trim() || undefined,
        email: email.trim() || undefined,
        department_id: departmentId,
        semester,
        division,
      });

      setIsSubmitting(false);
      setName('');
      setRollNumber('');
      setEnrollmentNumber('');
      setEmail('');
      setIssued({ name: student.name, loginId: student.enrollment_number, password: tempPassword });
      if (onSuccess) onSuccess(student.name);
    } catch (err) {
      setIsSubmitting(false);
      setError(errorMessage(err));
    }
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        {/* Head */}
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-sm)',
                background: 'var(--blue-50)',
                border: '1px solid var(--blue-200)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--blue-600)',
              }}
            >
              <UserPlus size={17} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.0625rem', margin: 0, fontWeight: 700, color: 'var(--gray-900)' }}>
                Add New Student
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Register student into official academic database and enroll in classes
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
              <div className="alert alert-danger" style={{ padding: '0.65rem 0.875rem' }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Name and Roll Number */}
            <div className="grid-2" style={{ gap: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Ishani Bassin"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Roll Number *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 26"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Enrollment ID and Email */}
            <div className="grid-2" style={{ gap: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Enrollment / PRN Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Leave blank to generate"
                  value={enrollmentNumber}
                  onChange={(e) => setEnrollmentNumber(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">College Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. name@student.college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Academic Cohort Placement */}
            <div
              style={{
                background: 'var(--gray-50)',
                padding: '0.875rem',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--gray-200)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-500)' }}>
                Academic Placement &amp; Cohort
              </div>

              <div className="grid-3" style={{ gap: '0.625rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Department</label>
                  <select
                    className="form-select"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Semester</label>
                  <select
                    className="form-select"
                    value={semester}
                    onChange={(e) => setSemester(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Division</label>
                  <select
                    className="form-select"
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                  >
                    {['A', 'B', 'C', 'D'].map((d) => (
                      <option key={d} value={d}>
                        Division {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Class Auto-Enrollment Preview */}
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--gray-600)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  paddingTop: '0.25rem',
                }}
              >
                <GraduationCap size={14} color="var(--blue-600)" />
                <span>
                  Will auto-enroll in <strong>{matchingClasses.length} course(s)</strong> for Sem {semester} (Div {division})
                  {matchingClasses.length > 0 &&
                    `: ${matchingClasses
                      .map((c) => subjects.find((s) => s.id === c.subject_id)?.code)
                      .filter(Boolean)
                      .join(', ')}`}
                </span>
              </div>
            </div>

          </div>

          {/* Modal Footer */}
          <div className="modal-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <UserPlus size={14} />
              {isSubmitting ? 'Registering Student…' : 'Register Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
