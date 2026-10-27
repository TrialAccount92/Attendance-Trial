import { Student, AttendanceRecord } from '../types';
import { localDateString } from './date';

/**
 * Export generic data array to CSV file and trigger download in browser
 */
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const stringVal = String(val ?? '');
    if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }
    return stringVal;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename.replace(/\s+/g, '_')}_${localDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export a course-specific attendance matrix (students x dates) to CSV
 */
export function exportClassMatrixCSV(
  courseName: string,
  courseCode: string,
  enrolledStudents: Student[],
  classRecords: AttendanceRecord[]
) {
  // Extract unique dates / session dates
  const dates = Array.from(
    new Set(
      classRecords.map((r) => {
        const d = new Date(r.marked_at);
        return isNaN(d.getTime())
          ? r.marked_at.split('T')[0]
          : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      })
    )
  ).slice(0, 30); // Up to 30 recent dates

  // Fallback if no records exist yet
  const dateColumns = dates.length > 0 ? dates : [new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })];

  const headers = [
    'Roll',
    'Enrollment',
    'Student Name',
    ...dateColumns,
    'Total Conducted',
    'Present',
    'Attendance %',
    'Eligibility',
  ];

  const rows = enrolledStudents.map((stu) => {
    const studentRecs = classRecords.filter((r) => r.student_id === stu.id);
    const total = studentRecs.length || 1;
    const presentCount = studentRecs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const pct = studentRecs.length > 0 ? Math.round((presentCount / total) * 100) : 100;

    const dateStatuses = dateColumns.map((dateStr) => {
      const match = studentRecs.find((r) => {
        const d = new Date(r.marked_at);
        const formatted = isNaN(d.getTime())
          ? r.marked_at.split('T')[0]
          : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        return formatted === dateStr;
      });
      if (!match) return '—';
      if (match.status === 'PRESENT') return 'P';
      if (match.status === 'LATE') return 'L';
      return 'A';
    });

    return [
      stu.roll_number,
      stu.enrollment_number,
      stu.name,
      ...dateStatuses,
      total,
      presentCount,
      `${pct}%`,
      pct >= 75 ? 'ELIGIBLE' : 'DEFAULTER',
    ];
  });

  exportToCSV(`${courseCode}_${courseName}_Attendance_Matrix`, headers, rows);
}
