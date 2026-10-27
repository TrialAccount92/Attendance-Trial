import React from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { X, Printer, Download, AlertTriangle } from 'lucide-react';
import { exportToCSV } from '../../utils/exportUtils';

interface DefaulterNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DefaulterNoticeModal: React.FC<DefaulterNoticeModalProps> = ({ isOpen, onClose }) => {
  const { students, records, minAttendanceThreshold } = useAttendance();

  if (!isOpen) return null;

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const thresholdPct = minAttendanceThreshold * 100;

  // Calculate stats for all students
  const defaulters = students
    .map((stu) => {
      const rs = records.filter((r) => r.student_id === stu.id);
      const total = rs.length;
      // Approved leave (EXCUSED) counts as attendance, same as the student's own dashboard.
      const present = rs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EXCUSED').length;
      const pct = total > 0 ? Math.round((present / total) * 1000) / 10 : 100;
      const deficit = Math.max(0, Math.ceil((minAttendanceThreshold * total - present) / (1 - minAttendanceThreshold)));

      return {
        student: stu,
        total,
        present,
        absent: Math.max(0, total - present),
        pct,
        deficit,
        isLow: pct < thresholdPct,
      };
    })
    .filter((s) => s.isLow);

  const handleExportCSV = () => {
    const headers = [
      'Roll',
      'Enrollment Number',
      'Student Name',
      'Semester',
      'Division',
      'Conducted',
      'Attended',
      'Missed',
      'Attendance %',
      'Consecutive Classes Needed',
    ];

    const rows = defaulters.map((d) => [
      d.student.roll_number,
      d.student.enrollment_number,
      d.student.name,
      d.student.semester,
      d.student.division,
      d.total,
      d.present,
      d.absent,
      `${d.pct}%`,
      d.deficit,
    ]);

    exportToCSV('Defaulters_Notice_Board', headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 740, padding: '2rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Actions bar */}
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
            <AlertTriangle size={18} color="var(--red-600)" />
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--gray-900)' }}>
              Campus Defaulter Notice Generator
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>
              <Download size={13} /> Export CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={handlePrint}>
              <Printer size={13} /> Print Notice Board Copy
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable Notice Board Sheet */}
        <div
          className="printable-slip"
          style={{
            background: 'var(--white)',
            border: '2px solid var(--gray-300)',
            borderRadius: 'var(--r-md)',
            padding: '2rem',
            color: '#111827',
          }}
        >
          {/* Official Letterhead */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid var(--gray-900)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-600)' }}>
              Office of the Dean (Academics) &amp; Examination Cell
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--gray-900)', marginTop: 2 }}>
              COLLEGE OF ENGINEERING &amp; TECHNOLOGY
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', marginTop: 2 }}>
              Academic Session 2025–26 · Department of Computer Engineering
            </div>

            <div
              style={{
                display: 'inline-block',
                marginTop: '0.875rem',
                padding: '0.25rem 1rem',
                background: 'var(--red-50)',
                border: '1px solid var(--red-200)',
                borderRadius: 'var(--r-full)',
                fontWeight: 800,
                fontSize: '0.8125rem',
                color: 'var(--red-700)',
                letterSpacing: '0.04em',
              }}
            >
              OFFICIAL NOTICE: LOW ATTENDANCE DEFAULTERS LIST
            </div>
          </div>

          {/* Notice Metadata */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>
            <span>Ref No: CET/ACAD/2025/ATTN-DEF-04</span>
            <span>Date: {todayFormatted}</span>
          </div>

          {/* Notice Body Text */}
          <div
            style={{
              padding: '0.875rem 1rem',
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.8125rem',
              lineHeight: 1.5,
              color: 'var(--gray-800)',
              marginBottom: '1.25rem',
            }}
          >
            <strong>ATTENTION ALL STUDENTS:</strong> Pursuant to Section 14.1 of the University Academic Regulations, a minimum of{' '}
            <strong>{thresholdPct}%</strong> aggregate attendance in each registered subject is mandatory to be eligible to sit for the Semester End Examinations.
            The following students have recorded attendance below the prescribed threshold and are placed on the{' '}
            <strong style={{ color: 'var(--red-600)' }}>Defaulters List</strong>. They are required to appear before their Head of Department within 3 working days.
          </div>

          {/* Defaulters Table */}
          {defaulters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--green-700)', fontWeight: 700 }}>
              ✓ No students currently below the {thresholdPct}% threshold. College-wide attendance is compliant.
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                marginBottom: '2rem',
                border: '1px solid var(--gray-200)',
              }}
            >
              <thead>
                <tr style={{ background: 'var(--gray-100)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Roll</th>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Enrollment ID</th>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Student Name</th>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>Sem/Div</th>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center' }}>Attended / Total</th>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'right' }}>Attendance %</th>
                  <th style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center' }}>Classes Needed</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map((d) => (
                  <tr key={d.student.id}>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', fontWeight: 700 }}>
                      {d.student.roll_number}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', color: 'var(--gray-500)' }}>
                      {d.student.enrollment_number}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', fontWeight: 600 }}>
                      {d.student.name}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)' }}>
                      Sem {d.student.semester} ({d.student.division})
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center' }}>
                      {d.present} / {d.total}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'right', fontWeight: 800, color: 'var(--red-600)' }}>
                      {d.pct}%
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--gray-200)', textAlign: 'center', fontWeight: 700, color: 'var(--amber-700)' }}>
                      +{d.deficit} classes
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Official Sign-Off Block */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', textAlign: 'center', marginTop: '3.5rem' }}>
            <div>
              <div style={{ height: 36, borderBottom: '1px solid var(--gray-300)', marginBottom: '0.375rem' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>Dr. S. K. Kulkarni</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>Dean of Academic Affairs</div>
            </div>
            <div>
              <div style={{ height: 36, borderBottom: '1px solid var(--gray-300)', marginBottom: '0.375rem' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>Dr. N. V. Rao</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>Head, Department of Computer Eng.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
