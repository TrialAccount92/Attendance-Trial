import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import {
  Play, Square, ChevronDown, ChevronUp, BarChart3,
  CheckCircle, X as XIcon, Clock, QrCode, Edit3, Users,
  Plus, Edit2, Trash2, Calendar, MapPin, Layers, Upload,
  CheckCheck, Download, FileText, Scan, Camera,
} from 'lucide-react';
import { ActiveSessionModal } from './ActiveSessionModal';
import { ClassScheduleModal } from './ClassScheduleModal';
import { ImportTimetableModal } from './ImportTimetableModal';
import { QuickAttendanceModal } from './QuickAttendanceModal';
import { LeaveApplicationsInboxModal } from './LeaveApplicationsInboxModal';
import { AcademicCalendarModal } from '../common/AcademicCalendarModal';
import { ScheduleExtraClassModal } from './ScheduleExtraClassModal';
import { FaceAttendanceScannerModal } from './FaceAttendanceScannerModal';
import { exportClassMatrixCSV } from '../../utils/exportUtils';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { CollegeClass } from '../../types';

export const FacultyDashboard: React.FC = () => {
  const {
    currentFaculty, classes, subjects, records, students,
    activeSession, startAttendanceSession, closeAttendanceSession,
    reviewCorrectionRequest, correctionRequests, leaveApplications,
    extraClasses, cancelExtraClass,
    manualUpdateAttendance, removeClass,
  } = useAttendance();

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  // Class addition & scheduling state
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isImportTimetableOpen, setIsImportTimetableOpen] = useState(false);
  const [isQuickAttendanceOpen, setIsQuickAttendanceOpen] = useState(false);
  const [isLeaveInboxOpen, setIsLeaveInboxOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isExtraClassModalOpen, setIsExtraClassModalOpen] = useState(false);
  const [selectedClassForAttendance, setSelectedClassForAttendance] = useState<CollegeClass | null>(null);
  const [selectedClassForEdit, setSelectedClassForEdit] = useState<CollegeClass | null>(null);
  const [viewMode, setViewMode] = useState<'LIST' | 'SCHEDULE'>('LIST');
  const [isFaceScannerOpen, setIsFaceScannerOpen] = useState(false);
  const [faceScannerClass, setFaceScannerClass] = useState<CollegeClass | null>(null);
  const [ledgerClassFilter, setLedgerClassFilter] = useState<string>('ALL');

  if (!currentFaculty) return <div className="empty-state"><p>No faculty profile found.</p></div>;

  const myClasses = classes.filter((c) => c.faculty_id === currentFaculty.id);
  const myExtraClasses = extraClasses.filter((ex) => ex.faculty_id === currentFaculty.id);
  const pendingRequests = correctionRequests.filter((r) => r.status === 'PENDING');
  const pendingLeavesCount = leaveApplications.filter((l) => l.status === 'PENDING').length;

  // Always put PENDING requests at the top, and accepted/rejected requests below
  const sortedCorrectionRequests = [...correctionRequests].sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    return 0;
  });

  const handleStartSession = (classId: string, topic?: string) => {
    startAttendanceSession(classId, topic);
    setIsSessionModalOpen(true);
  };

  const endSession = () => {
    if (activeSession) closeAttendanceSession(activeSession.id);
  };

  const handleOpenAddModal = () => {
    setSelectedClassForEdit(null);
    setIsClassModalOpen(true);
  };

  const handleOpenEditModal = (cls: CollegeClass) => {
    setSelectedClassForEdit(cls);
    setIsClassModalOpen(true);
  };

  const handleConfirmRemove = (cls: CollegeClass) => {
    const sub = subjects.find((s) => s.id === cls.subject_id);
    const ok = window.confirm(
      `Are you sure you want to remove "${sub?.name || 'this class'}" (Sem ${cls.semester}, Div ${cls.division}) from your schedule?`
    );
    if (ok) {
      removeClass(cls.id);
    }
  };

  const getClassStats = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return { total: 0, rate: 0, sessions: 0 };
    const enrolled = students.filter((s) => s.semester === cls.semester && s.division === cls.division);
    const rs = records.filter((r) => r.class_id === classId);
    const sessions = [...new Set(rs.map((r) => r.session_id))].length;
    const present = rs.filter((r) => r.status === 'PRESENT').length;
    const rate = enrolled.length > 0 && sessions > 0
      ? Math.round((present / (enrolled.length * sessions)) * 100) : 0;
    return { total: enrolled.length, rate, sessions };
  };

  const myStudents = [...new Set(
    students.filter((s) => myClasses.some((c) => c.division === s.division)).map((s) => s.id)
  )].length;

  // Conducted lectures aggregation for Faculty Ledger
  const myClassIds = myClasses.map((c) => c.id);
  const myRecords = records.filter((r) => myClassIds.includes(r.class_id));

  const sessionAggregates: Record<string, {
    classId: string;
    dateStr: string;
    total: number;
    present: number;
    absent: number;
    late: number;
  }> = {};

  myRecords.forEach((r) => {
    const dStr = r.marked_at.split('T')[0];
    const key = `${r.class_id}_${dStr}`;
    if (!sessionAggregates[key]) {
      sessionAggregates[key] = {
        classId: r.class_id,
        dateStr: dStr,
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
      };
    }
    sessionAggregates[key].total++;
    if (r.status === 'PRESENT') sessionAggregates[key].present++;
    else if (r.status === 'LATE') sessionAggregates[key].late++;
    else sessionAggregates[key].absent++;
  });

  const conductedLectures = Object.values(sessionAggregates).sort(
    (a, b) => b.dateStr.localeCompare(a.dateStr)
  );

  const filteredLedger = conductedLectures.filter((item) => {
    if (ledgerClassFilter !== 'ALL' && item.classId !== ledgerClassFilter) return false;
    return true;
  });

  // Group classes by day for Schedule view
  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Today'];
  const classesByDay = daysOrder.reduce((acc, day) => {
    const matching = myClasses.filter((c) => (c.day_of_week || 'Today') === day);
    if (matching.length > 0) acc[day] = matching;
    return acc;
  }, {} as Record<string, CollegeClass[]>);

  return (
    <div>
      {/* ── Page Header ─────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Faculty Dashboard</h1>
          <p>{currentFaculty.name} · {currentFaculty.department_id} · {myClasses.length} classes assigned</p>
        </div>
        <div className="page-header-actions">
          {activeSession && (
            <>
              <button className="btn btn-secondary" onClick={() => setIsSessionModalOpen(true)}>
                <span className="pulse-indicator" />
                View Live Session
              </button>
              <button className="btn btn-danger" onClick={endSession}>
                <Square size={14} /> End Session
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={() => setIsLeaveInboxOpen(true)}>
            <FileText size={14} /> Duty &amp; Medical Leaves
            {pendingLeavesCount > 0 && (
              <span style={{ background: 'var(--red-500)', color: '#fff', fontSize: '0.6875rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 'var(--r-full)', marginLeft: 6 }}>
                {pendingLeavesCount}
              </span>
            )}
          </button>
          <button className="btn btn-secondary" onClick={() => setIsCalendarOpen(true)}>
            <Calendar size={14} /> Academic Calendar
          </button>
          <button className="btn btn-secondary" onClick={() => setIsExtraClassModalOpen(true)}>
            <Clock size={14} /> + Extra Class
          </button>
          <button className="btn btn-secondary" onClick={() => { setSelectedClassForAttendance(null); setIsQuickAttendanceOpen(true); }}>
            <CheckCheck size={14} /> Quick Roll Call
          </button>
          <button className="btn btn-secondary" onClick={() => setIsImportTimetableOpen(true)}>
            <Upload size={14} /> Import Timetable
          </button>
          <button
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              border: 'none',
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
              color: '#ffffff',
            }}
            onClick={() => {
              setFaceScannerClass(myClasses[0] || classes[0] || null);
              setIsFaceScannerOpen(true);
            }}
            title="Launch 360° Virtual Smart Classroom Camera Scanner"
          >
            <Camera size={14} /> 360° Virtual Classroom Scanner
          </button>
          <button
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #0284c7 100%)',
              border: 'none',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
              color: '#ffffff',
            }}
            onClick={() => {
              setFaceScannerClass(myClasses[0] || classes[0] || null);
              setIsFaceScannerOpen(true);
            }}
          >
            <Scan size={14} /> AI Face Auto-Attendance
          </button>
          <button className="btn btn-secondary" onClick={() => setIsSessionModalOpen(true)}>
            <QrCode size={14} /> QR Session
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          SECTION 1 — KPI ROW
      ══════════════════════════════════════════════ */}
      <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
        {[
          { label: 'My Classes', value: myClasses.length, sub: 'assigned to schedule', accent: 'var(--blue-600)', bg: 'var(--blue-50)', bdr: 'var(--blue-100)' },
          { label: 'Students', value: myStudents, sub: 'across all batches', accent: 'var(--gray-800)', bg: 'var(--gray-50)', bdr: 'var(--gray-200)' },
          { label: 'Pending Requests', value: pendingRequests.length, sub: 'awaiting review', accent: pendingRequests.length > 0 ? 'var(--amber-600)' : 'var(--green-600)', bg: pendingRequests.length > 0 ? 'var(--amber-50)' : 'var(--green-50)', bdr: pendingRequests.length > 0 ? 'var(--amber-200)' : 'var(--green-200)' },
          { label: 'Active Session', value: activeSession ? 'Live' : 'None', sub: activeSession ? 'attendance open' : 'no session running', accent: activeSession ? 'var(--green-600)' : 'var(--gray-400)', bg: activeSession ? 'var(--green-50)' : 'var(--gray-50)', bdr: activeSession ? 'var(--green-200)' : 'var(--gray-200)' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, border: `1px solid ${k.bdr}`, borderRadius: 'var(--r-lg)', padding: '1.125rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: k.accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: k.accent, letterSpacing: '-0.04em', lineHeight: 1 }}>{k.value}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{k.sub}</span>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════
          TWO COLUMN BODY
      ══════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', alignItems: 'start' }}>

        {/* ── Left: My classes & Schedule ────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* SECTION 2 — CLASS & SCHEDULE MANAGEMENT */}
          <div className="section">
            <div className="section-head" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div className="section-title">
                  <BarChart3 size={16} color="var(--blue-600)" /> My Classes &amp; Timetable
                </div>
                <div className="section-subtitle">
                  Manage assigned subjects, configure classroom venues, and set lecture timings
                </div>
              </div>

              {/* Action Buttons: Toggle View & Add Class */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', background: 'var(--gray-100)', padding: 2, borderRadius: 'var(--r-sm)', border: '1px solid var(--gray-200)' }}>
                  <button
                    className={`btn btn-xs ${viewMode === 'LIST' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: '0.6875rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--r-xs)' }}
                    onClick={() => setViewMode('LIST')}
                  >
                    List View
                  </button>
                  <button
                    className={`btn btn-xs ${viewMode === 'SCHEDULE' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ fontSize: '0.6875rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--r-xs)' }}
                    onClick={() => setViewMode('SCHEDULE')}
                  >
                    Weekly Schedule
                  </button>
                </div>

                <button className="btn btn-sm btn-secondary" onClick={() => setIsImportTimetableOpen(true)}>
                  <Upload size={13} /> Import Timetable
                </button>

                <button className="btn btn-sm btn-primary" onClick={handleOpenAddModal}>
                  <Plus size={13} /> Add Class
                </button>
              </div>
            </div>

            {/* Scheduled Extra Classes Banner */}
            {myExtraClasses.length > 0 && (
              <div
                style={{
                  background: 'var(--amber-50)',
                  border: '1px solid var(--amber-200)',
                  borderRadius: 'var(--r-md)',
                  padding: '0.875rem 1rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--amber-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={15} color="var(--amber-700)" /> Upcoming Compensatory / Extra Classes ({myExtraClasses.length})
                  </span>
                  <button className="btn btn-secondary btn-xs" onClick={() => setIsExtraClassModalOpen(true)}>
                    + Schedule Another
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {myExtraClasses.map((ex) => {
                    const cls = classes.find((c) => c.id === ex.class_id);
                    const sub = subjects.find((s) => s.id === cls?.subject_id);
                    const d = new Date(ex.date + 'T00:00:00');
                    return (
                      <div
                        key={ex.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--white)',
                          border: '1px solid var(--amber-200)',
                          borderRadius: 'var(--r-sm)',
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.8125rem',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div>
                          <strong>{sub?.name}</strong> (Sem {cls?.semester}-{cls?.division}) ·{' '}
                          <span style={{ color: 'var(--gray-600)' }}>
                            {d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} at {ex.start_time}–{ex.end_time} in {ex.room}
                          </span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--blue-700)', marginTop: 2 }}>
                            Topic: {ex.topic} <em>({ex.reason})</em>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button
                            className="btn btn-primary btn-xs"
                            onClick={() => {
                              if (cls) {
                                setSelectedClassForAttendance(cls);
                                setIsQuickAttendanceOpen(true);
                              }
                            }}
                          >
                            <CheckCheck size={12} /> Roll Call
                          </button>
                          <button
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--red-600)' }}
                            onClick={() => {
                              if (window.confirm('Cancel this extra class?')) {
                                cancelExtraClass(ex.id);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {myClasses.length === 0 ? (
              <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <Calendar size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                <p style={{ fontWeight: 600, color: 'var(--gray-700)' }}>No classes in your schedule yet</p>
                <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>Click "+ Add Class" to set up your subjects and lecture hours.</p>
                <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={handleOpenAddModal}>
                  <Plus size={13} /> Add Class Now
                </button>
              </div>
            ) : viewMode === 'LIST' ? (
              /* ── LIST VIEW ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {myClasses.map((cls) => {
                  const sub = subjects.find((s) => s.id === cls.subject_id);
                  const stats = getClassStats(cls.id);
                  const isActive = activeSession?.class_id === cls.id;
                  const isExp = expandedClassId === cls.id;

                  return (
                    <div
                      key={cls.id}
                      style={{
                        border: `1px solid ${isActive ? 'var(--blue-500)' : 'var(--gray-200)'}`,
                        borderRadius: 'var(--r-md)',
                        overflow: 'hidden',
                        background: 'var(--white)',
                      }}
                    >
                      {/* Row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.875rem 1rem',
                          gap: '1rem',
                          background: isActive ? 'var(--blue-50)' : 'var(--gray-50)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)' }}>
                              {sub?.name}
                            </span>
                            <span className="badge badge-neutral">{sub?.code}</span>
                            <span style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--r-sm)', background: 'var(--blue-50)', color: 'var(--blue-600)', fontWeight: 600 }}>
                              {cls.day_of_week || 'Today'}
                            </span>
                            {isActive && <span className="badge badge-success">● Live</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 4, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Layers size={11} /> Sem {cls.semester} · Div {cls.division}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <MapPin size={11} /> {cls.room}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={11} /> {cls.schedule_time}
                            </span>
                          </div>
                        </div>

                        {/* Attendance Rate */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: '1.125rem',
                              color: stats.rate >= 75 ? 'var(--green-600)' : stats.rate > 0 ? 'var(--amber-600)' : 'var(--gray-300)',
                            }}
                          >
                            {stats.rate > 0 ? `${stats.rate}%` : '—'}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>{stats.total} students</div>
                        </div>

                        {/* Actions: Start Session, Edit Schedule, Remove Class, Expand Roster */}
                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0 }}>
                          {!isActive && !activeSession && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleStartSession(cls.id)}>
                              <Play size={12} /> Start
                            </button>
                          )}

                          <button
                            className="btn btn-primary btn-sm"
                            style={{
                              background: 'linear-gradient(135deg, #2563eb, #0284c7)',
                              border: 'none',
                              color: '#fff',
                            }}
                            title="AI Facial Recognition Attendance with Auto-Zoom"
                            onClick={() => {
                              setFaceScannerClass(cls);
                              setIsFaceScannerOpen(true);
                            }}
                          >
                            <Scan size={12} /> Face Scan
                          </button>

                          <button
                            className="btn btn-secondary btn-sm"
                            title="Fast Roll Call Sheet"
                            onClick={() => {
                              setSelectedClassForAttendance(cls);
                              setIsQuickAttendanceOpen(true);
                            }}
                          >
                            <CheckCheck size={12} /> Roll Call
                          </button>

                          <button
                            className="btn btn-ghost btn-sm"
                            title="Export Course Attendance Sheet (.csv)"
                            onClick={() => {
                              const enrolled = students.filter((s) => s.semester === cls.semester && s.division === cls.division);
                              const recs = records.filter((r) => r.class_id === cls.id);
                              const sub = subjects.find((s) => s.id === cls.subject_id);
                              exportClassMatrixCSV(sub?.name || 'Class', sub?.code || 'CRS', enrolled, recs);
                            }}
                          >
                            <Download size={13} />
                          </button>

                          <button
                            className="btn btn-ghost btn-sm"
                            title="Edit Schedule & Classroom"
                            onClick={() => handleOpenEditModal(cls)}
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            className="btn btn-ghost btn-sm"
                            title="Remove Class from Schedule"
                            style={{ color: 'var(--red-600)' }}
                            onClick={() => handleConfirmRemove(cls)}
                          >
                            <Trash2 size={13} />
                          </button>

                          <button
                            className="btn btn-ghost btn-sm"
                            title={isExp ? 'Collapse Roster' : 'View Roster'}
                            onClick={() => setExpandedClassId(isExp ? null : cls.id)}
                          >
                            {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded roster */}
                      {isExp && (
                        <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid var(--gray-200)', background: 'var(--white)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                            <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray-400)', fontWeight: 700 }}>
                              Class Enrolled Students ({stats.total})
                            </div>
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => handleOpenEditModal(cls)}
                            >
                              <Edit2 size={11} /> Edit Class Details
                            </button>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            {students
                              .filter((s) => s.division === cls.division && s.semester === cls.semester)
                              .map((stu) => {
                                const rec = records.find(
                                  (r) => r.class_id === cls.id && r.student_id === stu.id && activeSession?.id === r.session_id
                                );
                                return (
                                  <div key={stu.id} className={`roster-row${rec?.status === 'PRESENT' ? ' is-present' : ''}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                      <div style={{ width: 28, height: 28, borderRadius: 'var(--r-full)', background: 'var(--blue-100)', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 800 }}>
                                        {stu.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 600, color: 'var(--gray-900)', fontSize: '0.8125rem' }}>{stu.name}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>{stu.roll_number}</div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                                      {rec ? (
                                        <>
                                          <Badge status={rec.status} />
                                          {activeSession && (
                                            <button
                                              className="btn btn-ghost btn-xs"
                                              onClick={() => manualUpdateAttendance(activeSession!.id, stu.id, cls.id, rec.status === 'PRESENT' ? 'ABSENT' : 'PRESENT')}
                                            >
                                              <Edit3 size={11} />
                                            </button>
                                          )}
                                        </>
                                      ) : (
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--gray-300)' }}>Not marked</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── WEEKLY SCHEDULE VIEW ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.keys(classesByDay).length === 0 ? (
                  <p style={{ color: 'var(--gray-400)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem' }}>
                    No scheduled days configured.
                  </p>
                ) : (
                  Object.entries(classesByDay).map(([day, dayClasses]) => (
                    <div key={day} style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                      <div style={{ background: 'var(--gray-100)', padding: '0.5rem 0.875rem', fontWeight: 700, fontSize: '0.8125rem', color: 'var(--gray-800)', borderBottom: '1px solid var(--gray-200)' }}>
                        {day}
                      </div>
                      <div style={{ padding: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--white)' }}>
                        {dayClasses.map((cls) => {
                          const sub = subjects.find((s) => s.id === cls.subject_id);
                          return (
                            <div
                              key={cls.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.625rem 0.75rem',
                                borderRadius: 'var(--r-sm)',
                                border: '1px solid var(--gray-200)',
                                background: 'var(--gray-50)',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--gray-900)' }}>
                                  {sub?.name} <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: '0.75rem' }}>({sub?.code})</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', display: 'flex', gap: '0.75rem', marginTop: 2 }}>
                                  <span><Clock size={11} style={{ display: 'inline', marginRight: 3 }} />{cls.schedule_time}</span>
                                  <span><MapPin size={11} style={{ display: 'inline', marginRight: 3 }} />{cls.room}</span>
                                  <span>Sem {cls.semester} (Div {cls.division})</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button className="btn btn-ghost btn-xs" title="Edit Schedule" onClick={() => handleOpenEditModal(cls)}>
                                  <Edit2 size={12} />
                                </button>
                                <button className="btn btn-ghost btn-xs" title="Remove" style={{ color: 'var(--red-600)' }} onClick={() => handleConfirmRemove(cls)}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* SECTION 2.5 — CONDUCTED LECTURES LEDGER */}
          <div className="section">
            <div className="section-head" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div className="section-title">
                  <Calendar size={16} color="var(--blue-600)" /> Conducted Lectures Ledger
                </div>
                <div className="section-subtitle">
                  Audit trail of past lecture sessions with 1-click retroactive roll call corrections
                </div>
              </div>

              {myClasses.length > 1 && (
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={ledgerClassFilter}
                  onChange={(e) => setLedgerClassFilter(e.target.value)}
                >
                  <option value="ALL">All Assigned Classes ({conductedLectures.length} sessions)</option>
                  {myClasses.map((c) => {
                    const sub = subjects.find((s) => s.id === c.subject_id);
                    return (
                      <option key={c.id} value={c.id}>
                        {sub?.code || 'CRS'} · Sem {c.semester}-{c.division}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <div className="table-wrap" style={{ maxHeight: 250, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course &amp; Cohort</th>
                    <th>Venue</th>
                    <th>Turnout</th>
                    <th>Rate</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--gray-400)' }}>
                        No past conducted lectures found.
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((lec, idx) => {
                      const cls = classes.find((c) => c.id === lec.classId);
                      const sub = subjects.find((s) => s.id === cls?.subject_id);
                      const d = new Date(lec.dateStr + 'T00:00:00');
                      const rate = lec.total > 0 ? Math.round(((lec.present + lec.late) / lec.total) * 100) : 0;

                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: 'var(--gray-800)', whiteSpace: 'nowrap' }}>
                            {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--gray-900)' }}>{sub?.name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginLeft: 6 }}>
                              Sem {cls?.semester}-{cls?.division}
                            </span>
                          </td>
                          <td style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>{cls?.room || 'Room'}</td>
                          <td style={{ fontSize: '0.8125rem' }}>
                            <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>{lec.present + lec.late}</span> / {lec.total}
                          </td>
                          <td>
                            <strong style={{ color: rate >= 75 ? 'var(--green-600)' : 'var(--amber-600)' }}>
                              {rate}%
                            </strong>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-secondary btn-xs"
                              title="Review or Modify Attendance Sheet"
                              onClick={() => {
                                if (cls) {
                                  setSelectedClassForAttendance(cls);
                                  setIsQuickAttendanceOpen(true);
                                }
                              }}
                            >
                              <Edit3 size={11} /> Edit Roll Call
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right column ───────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* SECTION 3 — CORRECTION REQUESTS */}
          <div className="section" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="section-head" style={{ marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div className="section-title"><Clock size={16} color="var(--blue-600)" /> Correction Requests</div>
                <div className="section-subtitle">Student disputes &amp; OD applications</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {pendingRequests.length > 0 && (
                  <span className="badge badge-warning">{pendingRequests.length} pending</span>
                )}
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray-500)', background: 'var(--gray-100)', padding: '0.15rem 0.5rem', borderRadius: 'var(--r-sm)' }}>
                  {sortedCorrectionRequests.length} Requests
                </span>
              </div>
            </div>

            {sortedCorrectionRequests.length === 0 ? (
              <div style={{ padding: '1.25rem 0', textAlign: 'center', color: 'var(--gray-300)', fontSize: '0.875rem' }}>
                No requests received yet.
              </div>
            ) : (
              <div
                className="custom-scrollbar"
                style={{
                  maxHeight: 285,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem',
                  paddingRight: '0.35rem',
                }}
              >
                {sortedCorrectionRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      border: `1px solid ${req.status === 'PENDING' ? 'var(--amber-200)' : 'var(--gray-200)'}`,
                      borderRadius: 'var(--r-md)',
                      padding: '0.75rem 0.875rem',
                      background: req.status === 'PENDING' ? 'var(--white)' : 'var(--gray-50)',
                      boxShadow: req.status === 'PENDING' ? 'var(--shadow-xs)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--gray-900)' }}>{req.student_name}</span>
                      <Badge status={req.status} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                      {req.subject_name} · {req.date}
                    </div>
                    <p
                      style={{
                        fontSize: '0.8125rem',
                        color: 'var(--gray-600)',
                        margin: 0,
                        lineHeight: 1.35,
                      }}
                    >
                      "{req.reason}"
                    </p>

                    {req.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.25rem' }}>
                        <button
                          className="btn btn-success btn-sm"
                          style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => reviewCorrectionRequest(req.id, 'APPROVED', 'Approved by faculty.')}
                        >
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ flex: 1, color: 'var(--red-600)', padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => reviewCorrectionRequest(req.id, 'REJECTED', 'Insufficient proof.')}
                        >
                          <XIcon size={12} /> Reject
                        </button>
                      </div>
                    )}
                    {req.faculty_comment && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid var(--gray-200)' }}>
                        → {req.faculty_comment}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 4 — CLASS SUMMARY */}
          <div className="section">
            <div className="section-head">
              <div className="section-title" style={{ fontSize: '0.875rem' }}><Users size={15} color="var(--blue-600)" /> Class Summary</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {myClasses.map((cls) => {
                const sub   = subjects.find((s) => s.id === cls.subject_id);
                const stats = getClassStats(cls.id);
                return (
                  <div key={cls.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-800)' }}>{sub?.name}</span>
                      <span style={{ fontWeight: 800, fontSize: '0.875rem', color: stats.rate >= 75 ? 'var(--green-600)' : 'var(--amber-600)' }}>{stats.rate}%</span>
                    </div>
                    <ProgressBar value={stats.rate} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Class Schedule / Add / Edit */}
      <ClassScheduleModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        initialClass={selectedClassForEdit}
      />

      {/* Modal: Import Timetable from CSV / Excel */}
      <ImportTimetableModal
        isOpen={isImportTimetableOpen}
        onClose={() => setIsImportTimetableOpen(false)}
      />

      {/* Modal: Quick Attendance Sheet / Fast Roll Call */}
      <QuickAttendanceModal
        isOpen={isQuickAttendanceOpen}
        onClose={() => setIsQuickAttendanceOpen(false)}
        initialClass={selectedClassForAttendance}
      />

      {/* Modal: Active Live QR Session */}
      <ActiveSessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        onStart={handleStartSession}
      />

      {/* Modal: Duty & Medical Leave Review Inbox */}
      <LeaveApplicationsInboxModal
        isOpen={isLeaveInboxOpen}
        onClose={() => setIsLeaveInboxOpen(false)}
      />

      {/* Modal: Academic Calendar & Holidays */}
      <AcademicCalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
      />

      {/* Modal: Schedule Extra / Compensatory Class */}
      <ScheduleExtraClassModal
        isOpen={isExtraClassModalOpen}
        onClose={() => setIsExtraClassModalOpen(false)}
      />

      {/* Modal: AI Facial Recognition Camera Scanner with Classroom Auto-Zoom */}
      <FaceAttendanceScannerModal
        isOpen={isFaceScannerOpen}
        onClose={() => setIsFaceScannerOpen(false)}
        targetClass={faceScannerClass}
      />
    </div>
  );
};
