import React from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { X, Printer, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface OfficialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfficialReportModal: React.FC<OfficialReportModalProps> = ({ isOpen, onClose }) => {
  const { currentStudent, getStudentStats, minAttendanceThreshold } = useAttendance();

  if (!isOpen || !currentStudent) return null;

  const { subjectStats, overall } = getStudentStats(currentStudent.id);
  const isEligible = !overall.is_low_attendance;
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 720, padding: '2rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Actions (Hidden when printing) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            paddingBottom: '0.875rem',
            borderBottom: '1px solid var(--gray-200)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} color="var(--blue-600)" />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--gray-900)' }}>
              Official Attendance Certificate
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              <Printer size={13} /> Print / Save as PDF
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Official Slip */}
        <div
          className="printable-slip"
          style={{
            background: 'var(--white)',
            border: '1px solid var(--gray-300)',
            borderRadius: 'var(--r-md)',
            padding: '2rem',
            color: '#111827',
          }}
        >
          {/* Institutional Letterhead */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid var(--gray-800)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray-500)' }}>
              Faculty of Engineering &amp; Technology
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--gray-900)', marginTop: 2 }}>
              INSTITUTE OF ACADEMIC EXCELLENCE
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', marginTop: 2 }}>
              Department of Computer Engineering · Academic Session 2025–26
            </div>
            <div
              style={{
                display: 'inline-block',
                marginTop: '0.75rem',
                padding: '0.2rem 0.875rem',
                background: 'var(--gray-100)',
                borderRadius: 'var(--r-full)',
                fontWeight: 800,
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
                color: 'var(--gray-800)',
              }}
            >
              SEMESTER ATTENDANCE RECORD &amp; EXAM ELIGIBILITY SLIP
            </div>
          </div>

          {/* Student Meta Matrix */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem 1.5rem',
              padding: '0.875rem 1rem',
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 'var(--r-sm)',
              marginBottom: '1.25rem',
              fontSize: '0.8125rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--gray-500)' }}>Student Name: </span>
              <strong>{currentStudent.name}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--gray-500)' }}>Roll Number: </span>
              <strong>{currentStudent.roll_number}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--gray-500)' }}>Enrollment ID: </span>
              <strong>{currentStudent.enrollment_number}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--gray-500)' }}>Semester &amp; Div: </span>
              <strong>Sem {currentStudent.semester} (Division {currentStudent.division})</strong>
            </div>
            <div>
              <span style={{ color: 'var(--gray-500)' }}>Department: </span>
              <strong>Computer Engineering</strong>
            </div>
            <div>
              <span style={{ color: 'var(--gray-500)' }}>Issue Date: </span>
              <strong>{todayFormatted}</strong>
            </div>
          </div>

          {/* Course-wise Breakdown Table */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.8125rem',
              marginBottom: '1.25rem',
              border: '1px solid var(--gray-200)',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--gray-100)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Course Code</th>
                <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Subject Title</th>
                <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Conducted</th>
                <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Attended</th>
                <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'right' }}>Attendance %</th>
                <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {subjectStats.map((stat) => {
                const ok = stat.percentage >= minAttendanceThreshold * 100;
                return (
                  <tr key={stat.subject_id}>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', fontWeight: 700 }}>
                      {stat.subject_code}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>
                      {stat.subject_name}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>
                      {stat.conducted}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', color: 'var(--green-700)', fontWeight: 600 }}>
                      {stat.present}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'right', fontWeight: 800 }}>
                      {stat.percentage}%
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center', fontWeight: 700 }}>
                      <span style={{ color: ok ? 'var(--green-700)' : 'var(--red-600)' }}>
                        {ok ? 'ELIGIBLE' : 'DEFICIT'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Overall Total Row */}
              <tr style={{ background: 'var(--gray-50)', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '0.625rem 0.75rem', border: '1px solid var(--gray-200)' }}>
                  OVERALL AGGREGATE
                </td>
                <td style={{ padding: '0.625rem 0.75rem', border: '1px solid var(--gray-200)' }}>
                  {overall.total_conducted}
                </td>
                <td style={{ padding: '0.625rem 0.75rem', border: '1px solid var(--gray-200)', color: 'var(--green-700)' }}>
                  {overall.total_present}
                </td>
                <td style={{ padding: '0.625rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'right', fontSize: '0.9375rem' }}>
                  {overall.percentage}%
                </td>
                <td style={{ padding: '0.625rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center' }}>
                  <span style={{ color: isEligible ? 'var(--green-700)' : 'var(--red-600)' }}>
                    {isEligible ? 'ELIGIBLE' : 'DEFAULTER'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Official Certification Declaration */}
          <div
            style={{
              padding: '0.875rem 1rem',
              borderRadius: 'var(--r-sm)',
              border: `1px solid ${isEligible ? 'var(--green-200)' : 'var(--red-200)'}`,
              background: isEligible ? 'var(--green-50)' : 'var(--red-50)',
              marginBottom: '2rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}
          >
            {isEligible ? (
              <CheckCircle2 size={20} color="var(--green-600)" style={{ flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertTriangle size={20} color="var(--red-600)" style={{ flexShrink: 0, marginTop: 2 }} />
            )}
            <div style={{ fontSize: '0.8125rem', lineHeight: 1.45 }}>
              <strong>
                {isEligible
                  ? 'CERTIFICATION: EXAM ELIGIBILITY CONFIRMED'
                  : 'NOTICE: ATTENDANCE DEFAULTER — PROVISIONAL ADMIT STATUS'}
              </strong>
              <div style={{ marginTop: 2, color: 'var(--gray-700)' }}>
                {isEligible
                  ? `The candidate has satisfied the statutory 75% minimum semester attendance requirement with an aggregate of ${overall.percentage}%. Officially cleared to receive Examination Admit Card.`
                  : `The candidate has accrued an attendance deficit (${overall.percentage}% vs 75% threshold). Requires special academic review and departmental clearance prior to exam hall entry.`}
              </div>
            </div>
          </div>

          {/* Signature Sign-Off Block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center', marginTop: '3rem' }}>
            <div>
              <div style={{ height: 36, borderBottom: '1px solid var(--gray-300)', marginBottom: '0.375rem' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>Class Advisor / Proctor</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>Dept. of Computer Eng.</div>
            </div>
            <div>
              <div style={{ height: 36, borderBottom: '1px solid var(--gray-300)', marginBottom: '0.375rem' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>Head of Department</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>Academic Verification</div>
            </div>
            <div>
              <div style={{ height: 36, borderBottom: '1px solid var(--gray-300)', marginBottom: '0.375rem' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>Dean of Academics</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>Exam Controller Seal</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
