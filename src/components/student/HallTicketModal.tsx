import React from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { Student } from '../../types';
import { X, Printer, ShieldCheck, ShieldAlert, Award, FileText, AlertTriangle } from 'lucide-react';

interface HallTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
}

export const HallTicketModal: React.FC<HallTicketModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  const { getStudentStats, departments, minAttendanceThreshold } = useAttendance();

  if (!isOpen) return null;

  const { subjectStats, overall } = getStudentStats(student.id);
  const dept = departments.find((d) => d.id === student.department_id);
  const requiredPct = Math.round(minAttendanceThreshold * 100);
  const isEligible = overall.percentage >= requiredPct;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 680, padding: '1.5rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar with actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--gray-200)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Award size={18} color="var(--blue-600)" />
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)' }}>
              {isEligible ? 'Official Examination Admit Card' : 'Academic Standing Notice'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isEligible && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Printer size={14} /> Print Admit Card
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {isEligible ? (
          /* ── ELIGIBLE: OFFICIAL HALL TICKET ── */
          <div
            id="printable-hall-ticket"
            style={{
              border: '2px solid var(--gray-800)',
              borderRadius: 'var(--r-lg)',
              padding: '1.25rem',
              background: 'var(--white)',
            }}
          >
            {/* Institute Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--gray-800)', paddingBottom: '0.875rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-500)', fontWeight: 600 }}>
                Autonomous Institution · Affiliated to State Technical University
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--gray-900)', marginTop: 2 }}>
                METROPOLITAN INSTITUTE OF TECHNOLOGY
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--blue-700)', marginTop: 2 }}>
                HALL TICKET · END SEMESTER EXAMINATIONS 2025–26
              </div>
            </div>

            {/* Student Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem', padding: '0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--gray-200)', marginBottom: '1rem', fontSize: '0.8125rem' }}>
              <div>
                <span style={{ color: 'var(--gray-500)', display: 'block', fontSize: '0.6875rem' }}>Candidate Full Name</span>
                <strong style={{ color: 'var(--gray-900)', fontSize: '0.875rem' }}>{student.name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--gray-500)', display: 'block', fontSize: '0.6875rem' }}>Roll Number / Seat No.</span>
                <strong style={{ color: 'var(--blue-700)', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{student.roll_number}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--gray-500)', display: 'block', fontSize: '0.6875rem' }}>Enrollment Number</span>
                <span style={{ color: 'var(--gray-800)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{student.enrollment_number}</span>
              </div>
              <div>
                <span style={{ color: 'var(--gray-500)', display: 'block', fontSize: '0.6875rem' }}>Department &amp; Class</span>
                <span style={{ color: 'var(--gray-800)', fontWeight: 600 }}>{dept?.name || 'Computer Engg.'} (Sem {student.semester}-{student.division})</span>
              </div>
            </div>

            {/* Enrolled Subjects Table */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-600)', marginBottom: '0.35rem' }}>
                Course Eligibility &amp; Attendance Record
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-100)', borderBottom: '1px solid var(--gray-300)' }}>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Course Code</th>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Course Title</th>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Attended / Total</th>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Attendance</th>
                    <th style={{ padding: '0.4rem 0.5rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectStats.map((sub) => (
                    <tr key={sub.subject_id} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{sub.subject_code}</td>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{sub.subject_name}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: 'var(--gray-600)' }}>
                        {sub.present + sub.excused} / {sub.conducted}
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: sub.percentage >= requiredPct ? 'var(--green-700)' : 'var(--amber-700)' }}>
                        {sub.percentage}%
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem' }}>
                        <span className="badge badge-success" style={{ fontSize: '0.625rem' }}>Eligible</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Official Stamps & Verification */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '2px solid var(--gray-800)', paddingTop: '0.875rem', marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--r-full)', border: '2px dashed var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-600)' }}>
                  <ShieldCheck size={26} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--green-700)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Exam Verified &amp; Cleared
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>
                    Aggregate Attendance: <strong>{overall.percentage}%</strong> (Mandatory &ge; {requiredPct}%)
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'center', borderTop: '1px solid var(--gray-400)', paddingTop: 4, width: 140 }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--gray-500)', display: 'block' }}>Controller of Examinations</span>
                <span style={{ fontSize: '0.625rem', color: 'var(--gray-400)' }}>Digital Seal &amp; Signature</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── INELIGIBLE: OFFICIAL DETENTION NOTICE ── */
          <div
            style={{
              border: '2px solid var(--red-500)',
              borderRadius: 'var(--r-lg)',
              padding: '1.5rem',
              background: 'var(--red-50)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--r-full)', background: 'var(--red-100)', color: 'var(--red-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={24} />
              </div>
              <div>
                <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--red-900)' }}>
                  Examination Detention Warning
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--red-700)' }}>
                  Official notice of academic ineligibility due to shortfall in required attendance
                </div>
              </div>
            </div>

            <div style={{ padding: '0.875rem', background: 'var(--white)', borderRadius: 'var(--r-md)', border: '1px solid var(--red-200)', marginBottom: '1rem', fontSize: '0.8125rem' }}>
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--gray-800)', lineHeight: 1.5 }}>
                Dear <strong>{student.name}</strong> (Roll: {student.roll_number}), your current cumulative attendance stands at <strong style={{ color: 'var(--red-600)', fontSize: '0.9375rem' }}>{overall.percentage}%</strong>, which fails to meet the statutory university requirement of <strong>{requiredPct}%</strong>.
              </p>
              <p style={{ margin: 0, color: 'var(--gray-600)', fontSize: '0.75rem', lineHeight: 1.4 }}>
                Under Academic Ordinance Clause 14.2, students with attendance below threshold are barred from appearing in end-semester examinations unless an official medical exemption or Dean condonation is granted.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--red-800)' }}>
                <AlertTriangle size={15} color="var(--red-600)" />
                <span>You must attend <strong>{overall.required_attend} consecutive lectures</strong> to restore your attendance back above {requiredPct}%.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--red-800)' }}>
                <FileText size={15} color="var(--red-600)" />
                <span>If you missed classes due to medical reasons or college sports/events, submit an <strong>Official Duty / Medical Leave</strong> application immediately.</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', borderTop: '1px solid var(--red-200)', paddingTop: '0.875rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                Close Notice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
