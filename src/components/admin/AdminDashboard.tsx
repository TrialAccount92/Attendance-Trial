import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { CollegeClass, Student } from '../../types';
import {
  FileSpreadsheet, GraduationCap, Users, Calendar, Settings,
  AlertTriangle, Download, Megaphone, Upload, Trash2, Search,
  Plus, Send, CheckCircle2, Edit2, BookOpen, Filter, X,
  ShieldAlert,
  KeyRound,
} from 'lucide-react';
import { exportToCSV } from '../../utils/exportUtils';
import { ImportStudentsModal } from './ImportStudentsModal';
import { DefaulterNoticeModal } from './DefaulterNoticeModal';
import { DetentionListModal } from './DetentionListModal';
import { DispatchWarningModal } from './DispatchWarningModal';
import { AddStudentModal } from './AddStudentModal';
import { AddFacultyModal } from './AddFacultyModal';
import { AdminClassTimetableModal } from './AdminClassTimetableModal';
import { ManageSubjectsModal } from './ManageSubjectsModal';
import { ManageStudentEnrollmentsModal } from './ManageStudentEnrollmentsModal';
import { AcademicCalendarModal } from '../common/AcademicCalendarModal';

export const AdminDashboard: React.FC = () => {
  const {
    students, facultyList, subjects, classes, records, announcements,
    addAnnouncement, minAttendanceThreshold, setMinAttendanceThreshold, resetStudentPassword,
    removeStudent, removeFaculty, removeClass, departments,
  } = useAttendance();

  const [activeTab, setActiveTab] = useState<'REPORTS' | 'STUDENTS' | 'FACULTY' | 'CLASSES' | 'SETTINGS'>('REPORTS');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isDefaulterNoticeOpen, setIsDefaulterNoticeOpen] = useState(false);
  const [isDetentionModalOpen, setIsDetentionModalOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);
  const [addStudentSuccessMsg, setAddStudentSuccessMsg] = useState<string | null>(null);
  const [adminToastMsg, setAdminToastMsg] = useState<string | null>(null);

  // Modals for faculty, timetable, subjects, and student enrollment
  const [isAddFacultyOpen, setIsAddFacultyOpen] = useState(false);
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<CollegeClass | null>(null);
  const [preselectedFacultyId, setPreselectedFacultyId] = useState<string | undefined>(undefined);
  const [isManageSubjectsOpen, setIsManageSubjectsOpen] = useState(false);
  const [enrollingStudent, setEnrollingStudent] = useState<Student | null>(null);

  // Filters for Reports tab
  const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
  const [filterSemester, setFilterSemester] = useState<string>('ALL');
  const [filterDivision, setFilterDivision] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'DEFAULTER' | 'ELIGIBLE'>('ALL');
  const [reportSearch, setReportSearch] = useState('');

  const [studentSearch, setStudentSearch] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [classSemesterFilter, setClassSemesterFilter] = useState<string>('ALL');
  const [classDivisionFilter, setClassDivisionFilter] = useState<string>('ALL');
  const [classDayFilter, setClassDayFilter] = useState<string>('ALL');
  const [classSearch, setClassSearch] = useState('');

  const [announcementTitle, setAnnouncementTitle]     = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementCategory, setAnnouncementCategory] = useState<'GENERAL' | 'ACADEMIC' | 'ATTENDANCE' | 'ALERT'>('ATTENDANCE');

  const studentStats = students.map((stu) => {
    const rs      = records.filter((r) => r.student_id === stu.id);
    const total   = rs.length;
    // Approved leave (EXCUSED) counts as attendance, same as the student's own dashboard.
    const present = rs.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EXCUSED').length;
    const pct     = total > 0 ? Math.round((present / total) * 1000) / 10 : 100;
    return { student: stu, total, present, absent: Math.max(0, total - present), pct, isLow: pct < minAttendanceThreshold * 100 };
  });

  const filteredStudentStats = studentStats.filter(({ student: s, isLow }) => {
    if (filterDepartment !== 'ALL' && s.department_id !== filterDepartment) return false;
    if (filterSemester !== 'ALL' && s.semester.toString() !== filterSemester) return false;
    if (filterDivision !== 'ALL' && s.division !== filterDivision) return false;
    if (filterStatus === 'DEFAULTER' && !isLow) return false;
    if (filterStatus === 'ELIGIBLE' && isLow) return false;
    if (reportSearch.trim()) {
      const q = reportSearch.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.roll_number.toLowerCase().includes(q) && !s.enrollment_number.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const defaultersList = studentStats.filter((s) => s.isLow);

  const totalPresent = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'EXCUSED').length;
  const collegeAvg   = records.length > 0 ? Math.round((totalPresent / records.length) * 1000) / 10 : 0;
  const defaulters   = studentStats.filter((s) => s.isLow).length;

  const handleExport = () => {
    const headers = ['Roll', 'Enrollment', 'Name', 'Department', 'Semester', 'Division', 'Total Conducted', 'Present', 'Absent', 'Attendance %', 'Status'];
    const rows = filteredStudentStats.map((s) => {
      const dept = departments.find((d) => d.id === s.student.department_id);
      return [
        s.student.roll_number,
        s.student.enrollment_number,
        s.student.name,
        dept?.name || 'Computer Engineering',
        s.student.semester,
        s.student.division,
        s.total,
        s.present,
        s.absent,
        `${s.pct}%`,
        s.isLow ? 'DEFAULTER' : 'ELIGIBLE',
      ];
    });
    exportToCSV('College_Attendance_Report', headers, rows);
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementContent.trim()) return;
    await addAnnouncement(announcementTitle.trim(), announcementContent.trim(), announcementCategory);
    setAnnouncementTitle('');
    setAnnouncementContent('');
    setAdminToastMsg('Announcement published.');
    setTimeout(() => setAdminToastMsg(null), 4000);
  };

  return (
    <div>
      {/* ── Header ─────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Administration Console</h1>
          <p>Academic Year 2025–26 · College-wide attendance management and reporting</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setIsAddStudentOpen(true)}>
            <Plus size={14} /> Add Student
          </button>
          <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(true)}>
            <Upload size={14} /> Import CSV / Excel
          </button>
          <button className="btn btn-secondary" onClick={() => setIsCalendarOpen(true)}>
            <Calendar size={14} /> Academic Calendar
          </button>
          <button className="btn btn-secondary" onClick={() => setIsDefaulterNoticeOpen(true)}>
            <AlertTriangle size={14} /> Defaulter Notice
          </button>
          <button className="btn btn-secondary" onClick={() => setIsDetentionModalOpen(true)}>
            <ShieldAlert size={14} /> Exam Detention List
          </button>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Dynamic Notifications */}
      {adminToastMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--green-50)',
          border: '1px solid var(--green-200)',
          borderRadius: 'var(--r-md)',
          color: 'var(--green-700)',
          fontSize: '0.875rem',
          fontWeight: 500,
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} color="var(--green-600)" />
            <span>{adminToastMsg}</span>
          </div>
          <button
            onClick={() => setAdminToastMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-600)', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {addStudentSuccessMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--green-50)',
          border: '1px solid var(--green-200)',
          borderRadius: 'var(--r-md)',
          color: 'var(--green-700)',
          fontSize: '0.875rem',
          fontWeight: 500,
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} color="var(--green-600)" />
            <span>{addStudentSuccessMsg}</span>
          </div>
          <button
            onClick={() => setAddStudentSuccessMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-600)', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {dispatchSuccessMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--blue-50)',
          border: '1px solid var(--blue-200)',
          borderRadius: 'var(--r-md)',
          color: 'var(--blue-700)',
          fontSize: '0.875rem',
          fontWeight: 500,
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} color="var(--blue-600)" />
            <span>{dispatchSuccessMsg}</span>
          </div>
          <button
            onClick={() => setDispatchSuccessMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue-600)', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          SECTION 1 — KPI ROW
      ══════════════════════════════════════════ */}
      <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
        {[
          { label: 'Enrolled Students', value: students.length,   sub: 'Computer Engineering',     accent: 'var(--blue-600)',  bg: 'var(--blue-50)',  bdr: 'var(--blue-100)' },
          { label: 'Faculty Members',   value: facultyList.length, sub: 'Active staff',             accent: 'var(--gray-800)', bg: 'var(--gray-50)', bdr: 'var(--gray-200)' },
          { label: 'College Avg.',      value: `${collegeAvg}%`,  sub: '5 core subjects tracked',  accent: collegeAvg >= 75 ? 'var(--green-600)' : 'var(--amber-600)', bg: collegeAvg >= 75 ? 'var(--green-50)' : 'var(--amber-50)', bdr: collegeAvg >= 75 ? 'var(--green-200)' : 'var(--amber-200)' },
          { label: 'Defaulters (<75%)', value: defaulters,         sub: 'exam eligibility at risk', accent: defaulters > 0 ? 'var(--red-600)' : 'var(--green-600)', bg: defaulters > 0 ? 'var(--red-50)' : 'var(--green-50)', bdr: defaulters > 0 ? 'var(--red-200)' : 'var(--green-200)' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, border: `1px solid ${k.bdr}`, borderRadius: 'var(--r-lg)', padding: '1.125rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: k.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: k.accent, letterSpacing: '-0.04em', lineHeight: 1 }}>{k.value}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{k.sub}</span>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          SECTION 2 — TAB BODY
      ══════════════════════════════════════════ */}
      <div className="section">
        {/* Tab nav */}
        <div className="tab-list" style={{ marginBottom: '1.5rem' }}>
          {([
            { id: 'REPORTS',  label: 'Attendance Reports', Icon: FileSpreadsheet },
            { id: 'STUDENTS', label: 'Students',           Icon: GraduationCap  },
            { id: 'FACULTY',  label: 'Faculty',            Icon: Users          },
            { id: 'CLASSES',  label: 'Classes & Timetable',Icon: Calendar       },
            { id: 'SETTINGS', label: 'Rules & Notices',    Icon: Settings       },
          ] as const).map(({ id, label, Icon }) => (
            <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── REPORTS ── */}
        {activeTab === 'REPORTS' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--gray-900)' }}>Comprehensive Attendance Report</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)' }}>
                  Showing {filteredStudentStats.length} of {students.length} students · Minimum Threshold: {minAttendanceThreshold * 100}%
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsDefaulterNoticeOpen(true)}>
                   <AlertTriangle size={13} /> Defaulter Notice Board
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsDetentionModalOpen(true)}>
                   <ShieldAlert size={13} /> Exam Detention List
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsDispatchModalOpen(true)}>
                   <Send size={13} /> Dispatch Warnings
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleExport}><Download size={13} /> Export CSV</button>
              </div>
            </div>

            {/* Defaulter Alert Banner */}
            {defaulters > 0 && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>{defaulters} student(s) below {minAttendanceThreshold * 100}%: </strong>
                    {defaultersList.slice(0, 5).map((s) => `${s.student.name} (${s.pct}%)`).join(' · ')}
                    {defaultersList.length > 5 && ` and ${defaultersList.length - 5} more`}
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-xs"
                  onClick={() => setIsDispatchModalOpen(true)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <Send size={11} /> Dispatch Warnings ({defaulters})
                </button>
              </div>
            )}

            {/* Filter Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                background: 'var(--gray-50)',
                padding: '0.75rem 0.875rem',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--gray-200)',
              }}
            >
              {/* Search */}
              <div style={{ position: 'relative', flex: 1, minWidth: 170 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                <input
                  type="text"
                  placeholder="Search student or roll…"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  className="form-input form-input-sm"
                  style={{ paddingLeft: '2rem' }}
                />
              </div>

              {/* Department filter */}
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>

              {/* Semester filter */}
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
              >
                <option value="ALL">All Semesters</option>
                <option value="3">Semester 3</option>
                <option value="5">Semester 5</option>
              </select>

              {/* Division filter */}
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={filterDivision}
                onChange={(e) => setFilterDivision(e.target.value)}
              >
                <option value="ALL">All Divisions</option>
                <option value="A">Division A</option>
                <option value="B">Division B</option>
              </select>

              {/* Status filter */}
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                <option value="ALL">All Statuses</option>
                <option value="DEFAULTER">Defaulters Only (&lt;75%)</option>
                <option value="ELIGIBLE">Eligible (≥75%)</option>
              </select>

              {(filterDepartment !== 'ALL' || filterSemester !== 'ALL' || filterDivision !== 'ALL' || filterStatus !== 'ALL' || reportSearch) && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setFilterDepartment('ALL');
                    setFilterSemester('ALL');
                    setFilterDivision('ALL');
                    setFilterStatus('ALL');
                    setReportSearch('');
                  }}
                  style={{ fontSize: '0.6875rem' }}
                >
                  Reset Filters
                </button>
              )}
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Roll</th><th>Enrollment</th><th>Name</th>
                    <th>Dept</th><th>Sem</th><th>Div</th><th>Conducted</th>
                    <th>Present</th><th>Absent</th><th>Attendance %</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudentStats.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
                        No students matched the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStudentStats.map(({ student: s, total, present, absent, pct, isLow }) => {
                      const dept = departments.find((d) => d.id === s.department_id);
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 700 }}>{s.roll_number}</td>
                          <td style={{ color: 'var(--gray-400)' }}>{s.enrollment_number}</td>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{dept?.code || 'CE'}</td>
                          <td>{s.semester}</td><td>{s.division}</td><td>{total}</td>
                          <td style={{ color: 'var(--green-600)', fontWeight: 600 }}>{present}</td>
                          <td style={{ color: 'var(--red-600)' }}>{absent}</td>
                          <td><strong style={{ color: isLow ? 'var(--red-600)' : 'var(--green-600)' }}>{pct}%</strong></td>
                          <td>
                            {isLow
                              ? <span className="badge badge-danger">Defaulter</span>
                              : <span className="badge badge-success">Eligible</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── STUDENTS ── */}
        {activeTab === 'STUDENTS' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--gray-900)' }}>
                  Students Registry
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue-600)', background: 'var(--blue-50)', padding: '0.15rem 0.5rem', borderRadius: 'var(--r-full)', marginLeft: 8 }}>
                    {students.length} enrolled
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', marginTop: 2 }}>
                  Active college enrollment database · Import spreadsheet to register new batches
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                  <input
                    type="text"
                    className="form-input form-input-sm"
                    placeholder="Search name or roll..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    style={{ paddingLeft: '1.85rem', width: 190 }}
                  />
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setIsAddStudentOpen(true)}>
                  <Plus size={13} /> Add Student
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsImportModalOpen(true)}>
                  <Upload size={13} /> Import CSV / Excel
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Enrollment ID</th>
                    <th>Department</th>
                    <th>Semester</th>
                    <th>Division</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students
                    .filter((s) => {
                      if (!studentSearch.trim()) return true;
                      const q = studentSearch.toLowerCase();
                      return s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q) || s.enrollment_number.toLowerCase().includes(q);
                    })
                    .map((stu) => (
                      <tr key={stu.id}>
                        <td style={{ fontWeight: 700 }}>{stu.roll_number}</td>
                        <td style={{ fontWeight: 600 }}>{stu.name}</td>
                        <td style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>{stu.email}</td>
                        <td style={{ color: 'var(--gray-400)', fontSize: '0.8125rem' }}>{stu.enrollment_number}</td>
                        <td>{departments.find((d) => d.id === stu.department_id)?.name || 'Computer Engineering'}</td>
                        <td>Sem {stu.semester}</td>
                        <td>{stu.division}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-ghost btn-xs"
                            title="Allot Classes & Subjects"
                            style={{ color: 'var(--blue-600)', marginRight: 6 }}
                            onClick={() => setEnrollingStudent(stu)}
                          >
                            <BookOpen size={13} style={{ marginRight: 3 }} /> Allot
                          </button>
                          <button
                            className="btn btn-ghost btn-xs"
                            title="Issue a new temporary password"
                            style={{ marginRight: 6 }}
                            onClick={async () => {
                              if (!window.confirm(`Reset ${stu.name}'s password? Their current password stops working.`)) return;
                              const pw = await resetStudentPassword(stu.id);
                              window.prompt(`Temporary password for ${stu.name} (login ID ${stu.enrollment_number}). Copy it now:`, pw);
                            }}
                          >
                            <KeyRound size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-xs"
                            title="Remove Student"
                            style={{ color: 'var(--red-600)' }}
                            onClick={async () => {
                              if (window.confirm(`Remove ${stu.name} (Roll ${stu.roll_number})? This also deletes their attendance history and face profile.`)) {
                                await removeStudent(stu.id);
                                setAdminToastMsg(`Student ${stu.name} removed from registry.`);
                                setTimeout(() => setAdminToastMsg(null), 4000);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── FACULTY ── */}
        {activeTab === 'FACULTY' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--gray-900)' }}>
                  Faculty Registry
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue-600)', background: 'var(--blue-50)', padding: '0.15rem 0.5rem', borderRadius: 'var(--r-full)', marginLeft: 8 }}>
                    {facultyList.length} professors
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', marginTop: 2 }}>
                  Teaching staff across departments · Manage course loads and class allotments
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                  <input
                    type="text"
                    className="form-input form-input-sm"
                    placeholder="Search faculty or ID..."
                    value={facultySearch}
                    onChange={(e) => setFacultySearch(e.target.value)}
                    style={{ paddingLeft: '1.85rem', width: 200 }}
                  />
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsAddFacultyOpen(true)}
                >
                  <Plus size={13} /> Add Faculty
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Assigned Classes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {facultyList
                    .filter((f) => {
                      if (!facultySearch.trim()) return true;
                      const q = facultySearch.toLowerCase();
                      return f.name.toLowerCase().includes(q) || f.employee_id.toLowerCase().includes(q) || f.email.toLowerCase().includes(q);
                    })
                    .map((fac) => {
                      const facultyClasses = classes.filter((c) => c.faculty_id === fac.id);
                      const assigned = facultyClasses
                        .map((c) => {
                          const s = subjects.find((sub) => sub.id === c.subject_id);
                          return `${s?.name || 'Class'} (Sem ${c.semester}-${c.division})`;
                        })
                        .filter(Boolean)
                        .join(', ');
                      const dept = departments.find((d) => d.id === fac.department_id);
                      return (
                        <tr key={fac.id}>
                          <td style={{ fontWeight: 700 }}>{fac.employee_id}</td>
                          <td style={{ fontWeight: 600 }}>{fac.name}</td>
                          <td style={{ color: 'var(--gray-500)' }}>{fac.designation}</td>
                          <td style={{ color: 'var(--gray-400)' }}>{fac.email}</td>
                          <td>{dept?.name || 'Computer Engineering'}</td>
                          <td style={{ color: 'var(--blue-600)', fontWeight: 500 }}>
                            {assigned || <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>No classes assigned</span>}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Allot New Class to Faculty"
                              style={{ color: 'var(--blue-600)', marginRight: 6 }}
                              onClick={() => {
                                setEditingClass(null);
                                setPreselectedFacultyId(fac.id);
                                setIsTimetableModalOpen(true);
                              }}
                            >
                              <Calendar size={13} style={{ marginRight: 3 }} /> Allot Class
                            </button>
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Remove Faculty Member"
                              style={{ color: 'var(--red-600)' }}
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to remove ${fac.name} (${fac.employee_id})? Assigned classes will become unassigned.`)) {
                                  removeFaculty(fac.id);
                                  setAdminToastMsg(`Faculty member ${fac.name} removed.`);
                                  setTimeout(() => setAdminToastMsg(null), 4000);
                                }
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CLASSES & TIMETABLE ── */}
        {activeTab === 'CLASSES' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--gray-900)' }}>
                  Classes &amp; Master Timetable
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--blue-600)', background: 'var(--blue-50)', padding: '0.15rem 0.5rem', borderRadius: 'var(--r-full)', marginLeft: 8 }}>
                    {classes.length} scheduled slots
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', marginTop: 2 }}>
                  Master weekly schedule across semesters, divisions, classrooms and allotted faculty
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsManageSubjectsOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <BookOpen size={13} /> Manage Subjects ({subjects.length})
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setEditingClass(null);
                    setPreselectedFacultyId(undefined);
                    setIsTimetableModalOpen(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Plus size={13} /> Schedule Class / Lecture
                </button>
              </div>
            </div>

            {/* Filter toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'var(--gray-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--gray-200)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-700)' }}>
                <Filter size={13} /> Filter By:
              </div>

              <select
                className="form-input form-input-sm"
                value={classSemesterFilter}
                onChange={(e) => setClassSemesterFilter(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="ALL">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={String(s)}>Semester {s}</option>
                ))}
              </select>

              <select
                className="form-input form-input-sm"
                value={classDivisionFilter}
                onChange={(e) => setClassDivisionFilter(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="ALL">All Divisions</option>
                {['A', 'B', 'C', 'D'].map((d) => (
                  <option key={d} value={d}>Division {d}</option>
                ))}
              </select>

              <select
                className="form-input form-input-sm"
                value={classDayFilter}
                onChange={(e) => setClassDayFilter(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="ALL">All Days</option>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                <input
                  type="text"
                  className="form-input form-input-sm"
                  placeholder="Search subject or room..."
                  value={classSearch}
                  onChange={(e) => setClassSearch(e.target.value)}
                  style={{ paddingLeft: '1.85rem', width: 190 }}
                />
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Subject</th>
                    <th>Cohort</th>
                    <th>Day</th>
                    <th>Schedule</th>
                    <th>Room</th>
                    <th>Allotted Faculty</th>
                    <th>Credits</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes
                    .filter((cls) => {
                      if (classSemesterFilter !== 'ALL' && String(cls.semester) !== classSemesterFilter) return false;
                      if (classDivisionFilter !== 'ALL' && cls.division !== classDivisionFilter) return false;
                      if (classDayFilter !== 'ALL' && cls.day_of_week !== classDayFilter) return false;
                      if (classSearch.trim()) {
                        const q = classSearch.toLowerCase();
                        const sub = subjects.find((s) => s.id === cls.subject_id);
                        const fac = facultyList.find((f) => f.id === cls.faculty_id);
                        return (
                          sub?.name.toLowerCase().includes(q) ||
                          sub?.code.toLowerCase().includes(q) ||
                          cls.room.toLowerCase().includes(q) ||
                          fac?.name.toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((cls) => {
                      const sub = subjects.find((s) => s.id === cls.subject_id);
                      const fac = facultyList.find((f) => f.id === cls.faculty_id);
                      return (
                        <tr key={cls.id}>
                          <td style={{ fontWeight: 700 }}>{sub?.code || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{sub?.name || 'Unknown'}</td>
                          <td><span className="badge badge-neutral">Sem {cls.semester} · Div {cls.division}</span></td>
                          <td style={{ color: 'var(--blue-600)', fontWeight: 600 }}>{cls.day_of_week || 'Monday'}</td>
                          <td style={{ color: 'var(--gray-600)', fontWeight: 500 }}>{cls.schedule_time}</td>
                          <td>{cls.room}</td>
                          <td>
                            {fac ? (
                              <span style={{ fontWeight: 500, color: 'var(--gray-800)' }}>{fac.name}</span>
                            ) : (
                              <span style={{ color: 'var(--amber-600)', fontStyle: 'italic', fontWeight: 500 }}>Unassigned</span>
                            )}
                          </td>
                          <td>{sub?.credits || 4} cr.</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Edit Timetable Entry"
                              style={{ color: 'var(--blue-600)', marginRight: 6 }}
                              onClick={() => {
                                setEditingClass(cls);
                                setPreselectedFacultyId(undefined);
                                setIsTimetableModalOpen(true);
                              }}
                            >
                              <Edit2 size={12} style={{ marginRight: 3 }} /> Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Delete Class Slot"
                              style={{ color: 'var(--red-600)' }}
                              onClick={() => {
                                if (window.confirm(`Remove ${sub?.name || 'this class'} (${cls.day_of_week} ${cls.schedule_time}) from timetable?`)) {
                                  removeClass(cls.id);
                                  setAdminToastMsg(`Class slot removed.`);
                                  setTimeout(() => setAdminToastMsg(null), 4000);
                                }
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab === 'SETTINGS' && (
          <div className="grid-2">
            {/* Rules */}
            <div style={{ padding: '1.25rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-lg)', background: 'var(--gray-50)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)', marginBottom: '1rem' }}>Academic Attendance Rules</div>

              <div className="form-group">
                <label className="form-label">
                  Minimum Attendance Requirement —{' '}
                  <strong style={{ color: 'var(--blue-600)' }}>{minAttendanceThreshold * 100}%</strong>
                </label>
                <input
                  type="range" min="60" max="90" step="5"
                  value={minAttendanceThreshold * 100}
                  onChange={(e) => setMinAttendanceThreshold(parseInt(e.target.value) / 100)}
                  style={{ width: '100%', accentColor: 'var(--blue-600)', height: 20 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                  <span>60%</span><span>75% (Standard)</span><span>90% (Strict)</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">QR Token Lifetime</label>
                <select className="form-select" defaultValue="30">
                  <option value="20">20 Seconds — High Security</option>
                  <option value="30">30 Seconds — Recommended</option>
                  <option value="60">60 Seconds</option>
                </select>
              </div>

              <div className="alert alert-info" style={{ fontSize: '0.8125rem' }}>
                Changes apply immediately. Students below threshold will be flagged as defaulters.
              </div>
            </div>

            {/* Announcements */}
            <div style={{ padding: '1.25rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-lg)', background: 'var(--gray-50)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)', marginBottom: '1rem' }}>Broadcast Notice</div>
              <form onSubmit={handlePostAnnouncement}>
                <div className="form-group">
                  <label className="form-label">Notice Title</label>
                  <input type="text" className="form-input" placeholder="e.g. Low Attendance Warning" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={announcementCategory} onChange={(e) => setAnnouncementCategory(e.target.value as any)}>
                    <option value="ATTENDANCE">Attendance Warning</option>
                    <option value="ACADEMIC">Academic / Exam</option>
                    <option value="GENERAL">General Notice</option>
                    <option value="ALERT">Urgent Alert</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Content</label>
                  <textarea className="form-textarea" rows={4} placeholder="Message displayed to all students & faculty…" value={announcementContent} onChange={(e) => setAnnouncementContent(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <Megaphone size={14} /> Publish Announcement
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Manually Add Student */}
      <AddStudentModal
        isOpen={isAddStudentOpen}
        onClose={() => setIsAddStudentOpen(false)}
        onSuccess={(name) => {
          setAddStudentSuccessMsg(`Student "${name}" was successfully registered and enrolled into active classes.`);
          setTimeout(() => setAddStudentSuccessMsg(null), 6000);
        }}
      />

      {/* Modal: Import Students from CSV / Excel */}
      <ImportStudentsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Modal: Campus Defaulter Notice Board */}
      <DefaulterNoticeModal
        isOpen={isDefaulterNoticeOpen}
        onClose={() => setIsDefaulterNoticeOpen(false)}
      />

      {/* Modal: Official Exam Detention List */}
      <DetentionListModal
        isOpen={isDetentionModalOpen}
        onClose={() => setIsDetentionModalOpen(false)}
      />

      {/* Modal: Academic Calendar & Holidays (Admin Manageable) */}
      <AcademicCalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
      />

      {/* Modal: Dispatch Defaulter Warnings */}
      <DispatchWarningModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        defaulters={defaultersList}
        thresholdPct={Math.round(minAttendanceThreshold * 100)}
        onDispatchSuccess={(sent, queued) => {
          setDispatchSuccessMsg(
            sent > 0 ? `Attendance warnings emailed to ${sent} students.` : `${queued} attendance warnings saved to the outbox (email not configured).`
          );
        }}
      />

      {/* Modal: Add Faculty Member */}
      <AddFacultyModal
        isOpen={isAddFacultyOpen}
        onClose={() => setIsAddFacultyOpen(false)}
        onSuccess={(name) => {
          setAdminToastMsg(`Faculty member "${name}" registered successfully.`);
          setTimeout(() => setAdminToastMsg(null), 5000);
        }}
      />

      {/* Modal: Schedule or Edit Class Timetable Entry */}
      <AdminClassTimetableModal
        isOpen={isTimetableModalOpen}
        onClose={() => {
          setIsTimetableModalOpen(false);
          setEditingClass(null);
          setPreselectedFacultyId(undefined);
        }}
        initialClass={editingClass}
        preselectedFacultyId={preselectedFacultyId}
        onSuccess={(msg) => {
          setAdminToastMsg(msg);
          setTimeout(() => setAdminToastMsg(null), 5000);
        }}
      />

      {/* Modal: Manage Curriculum Subjects */}
      <ManageSubjectsModal
        isOpen={isManageSubjectsOpen}
        onClose={() => setIsManageSubjectsOpen(false)}
        onSuccess={(msg) => {
          setAdminToastMsg(msg);
          setTimeout(() => setAdminToastMsg(null), 5000);
        }}
      />

      {/* Modal: Manage Individual Student Class Allotments */}
      <ManageStudentEnrollmentsModal
        isOpen={enrollingStudent !== null}
        onClose={() => setEnrollingStudent(null)}
        student={enrollingStudent}
        onSuccess={(msg) => {
          setAdminToastMsg(msg);
          setTimeout(() => setAdminToastMsg(null), 5000);
        }}
      />
    </div>
  );
};
