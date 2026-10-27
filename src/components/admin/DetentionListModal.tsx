import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { X, Printer, ShieldAlert, Download } from 'lucide-react';
import { exportToCSV } from '../../utils/exportUtils';

interface DetentionListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DetentionListModal: React.FC<DetentionListModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { students, records, departments, minAttendanceThreshold } = useAttendance();

  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedSem, setSelectedSem] = useState<string>('ALL');

  if (!isOpen) return null;

  const thresholdPct = Math.round(minAttendanceThreshold * 100);

  // Compute student stats
  const allStats = students.map((stu) => {
    const rs = records.filter((r) => r.student_id === stu.id);
    const conducted = rs.length;
    const present = rs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EXCUSED').length;
    const pct = conducted > 0 ? Math.round((present / conducted) * 1000) / 10 : 100;
    const isDefaulter = pct < thresholdPct;
    return {
      student: stu,
      conducted,
      present,
      absent: Math.max(0, conducted - present),
      pct,
      isDefaulter,
    };
  });

  const filteredDefaulters = allStats.filter(({ student: s, isDefaulter }) => {
    if (!isDefaulter) return false;
    if (selectedDept !== 'ALL' && s.department_id !== selectedDept) return false;
    if (selectedSem !== 'ALL' && String(s.semester) !== selectedSem) return false;
    return true;
  });

  const totalEnrolled = allStats.length;
  const totalDetained = allStats.filter((s) => s.isDefaulter).length;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ['Roll', 'Enrollment', 'Name', 'Department', 'Semester', 'Division', 'Conducted', 'Attended', 'Attendance %', 'Status'];
    const rows = filteredDefaulters.map((d) => {
      const dept = departments.find((deptItem) => deptItem.id === d.student.department_id);
      return [
        d.student.roll_number,
        d.student.enrollment_number,
        d.student.name,
        dept?.name || 'Computer Engineering',
        d.student.semester,
        d.student.division,
        d.conducted,
        d.present,
        `${d.pct}%`,
        'DETAINED (<75%)',
      ];
    });
    exportToCSV('Official_Exam_Detention_List', headers, rows);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--gray-200)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert size={20} color="var(--red-600)" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--gray-900)' }}>
                Official Examination Detention Notification
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>
                Students debarred from appearing in End-Semester Examinations 2025–26
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCSV}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Download size={13} /> Export
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Printer size={13} /> Print Notice
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>Department:</span>
            <select
              className="form-select form-select-sm"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <span style={{ fontWeight: 600, color: 'var(--gray-700)', marginLeft: 8 }}>Semester:</span>
            <select
              className="form-select form-select-sm"
              value={selectedSem}
              onChange={(e) => setSelectedSem(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="ALL">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={String(s)}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red-600)' }}>
            {filteredDefaulters.length} Candidates Debarred
          </div>
        </div>

        {/* Printable Official Document */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--gray-300)', borderRadius: 'var(--r-md)', padding: '1.25rem', background: 'var(--white)' }}>
          {/* Institute Header */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid var(--gray-800)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray-500)' }}>
              Office of the Controller of Examinations
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--gray-900)' }}>
              METROPOLITAN INSTITUTE OF TECHNOLOGY
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--red-600)', marginTop: 2 }}>
              OFFICIAL DETENTION LIST · END-SEMESTER EXAMINATIONS (SESSION 2025–26)
            </div>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', lineHeight: 1.5, marginBottom: '1rem' }}>
            In accordance with University Academic Regulation 12(B), the following candidates have failed to secure the mandatory minimum attendance of <strong>{thresholdPct}%</strong> during the instructional period. Consequently, their hall tickets stand revoked and they are hereby <strong>DETAINED</strong> from taking the upcoming semester end examinations:
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left', marginBottom: '1.5rem' }}>
            <thead>
              <tr style={{ background: 'var(--gray-100)', borderBottom: '2px solid var(--gray-400)' }}>
                <th style={{ padding: '0.4rem 0.5rem' }}>Roll</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Enrollment ID</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Candidate Name</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Class</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Attended / Total</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Attendance %</th>
                <th style={{ padding: '0.4rem 0.5rem' }}>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {filteredDefaulters.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
                    No students currently detained under the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredDefaulters.map((d) => (
                  <tr key={d.student.id} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{d.student.roll_number}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'var(--font-mono)', color: 'var(--gray-600)' }}>{d.student.enrollment_number}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, color: 'var(--gray-900)' }}>{d.student.name}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>Sem {d.student.semester} - {d.student.division}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--gray-600)' }}>{d.present} / {d.conducted}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 800, color: 'var(--red-600)' }}>{d.pct}%</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--red-700)', fontWeight: 600 }}>
                      -{Math.round((thresholdPct - d.pct) * 10) / 10}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Signatures */}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '1.5rem', marginTop: '1rem', borderTop: '1px solid var(--gray-300)', fontSize: '0.75rem', color: 'var(--gray-600)' }}>
            <div style={{ textAlign: 'center', width: 160 }}>
              <div style={{ height: 28 }}></div>
              <div style={{ borderTop: '1px solid var(--gray-400)', paddingTop: 4, fontWeight: 600 }}>Head of Department</div>
            </div>

            <div style={{ textAlign: 'center', width: 160 }}>
              <div style={{ height: 28 }}></div>
              <div style={{ borderTop: '1px solid var(--gray-400)', paddingTop: 4, fontWeight: 600 }}>Dean (Academic Affairs)</div>
            </div>

            <div style={{ textAlign: 'center', width: 160 }}>
              <div style={{ height: 28 }}></div>
              <div style={{ borderTop: '1px solid var(--gray-400)', paddingTop: 4, fontWeight: 600 }}>Controller of Examinations</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
            College-wide Defaulter Rate: <strong>{Math.round((totalDetained / (totalEnrolled || 1)) * 100)}%</strong> ({totalDetained} of {totalEnrolled} students)
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
