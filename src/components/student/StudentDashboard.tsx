import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import {
  AlertTriangle, Calendar, Clock, MapPin,
  TrendingUp, FileSpreadsheet, HelpCircle, CheckCircle2,
  BookOpen, User as UserIcon, FileText, Award, X, Scan,
  QrCode,
} from 'lucide-react';
import { CircularProgress, ProgressBar } from '../common/ProgressBar';
import { Badge } from '../common/Badge';
import { CorrectionRequestModal } from './CorrectionRequestModal';
import { OfficialReportModal } from './OfficialReportModal';
import { AttendanceCalendarView } from './AttendanceCalendarView';
import { HallTicketModal } from './HallTicketModal';
import { ApplyLeaveModal } from './ApplyLeaveModal';
import { AcademicCalendarModal } from '../common/AcademicCalendarModal';
import { FaceEnrollmentModal } from './FaceEnrollmentModal';
import { QRScannerModal } from './QRScannerModal';
import { AttendanceCalculatorCard } from './AttendanceCalculatorCard';

export const StudentDashboard: React.FC = () => {
  const {
    currentStudent,
    classes,
    subjects,
    facultyList,
    records,
    sessions,
    getStudentStats,
    activeSession,
    minAttendanceThreshold,
    academicEvents,
    extraClasses,
    getStudentEnrolledClassIds,
  } = useAttendance();

  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isHallTicketOpen, setIsHallTicketOpen] = useState(false);
  const [isApplyLeaveOpen, setIsApplyLeaveOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isFaceEnrollOpen, setIsFaceEnrollOpen] = useState(false);
  const [leaveToastMsg, setLeaveToastMsg] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CALENDAR'>('TABLE');

  if (!currentStudent) {
    return (
      <div className="empty-state">
        <p>No student profile found.</p>
      </div>
    );
  }

  const { subjectStats, overall } = getStudentStats(currentStudent.id);
  const myClassIds = new Set(getStudentEnrolledClassIds(currentStudent.id));

  const studentRecords = records
    .filter((r) => r.student_id === currentStudent.id)
    .filter((r) => {
      if (historyFilter === 'ALL') return true;
      if (historyFilter === 'PRESENT') return r.status === 'PRESENT' || r.status === 'LATE';
      return r.status === 'ABSENT';
    });

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Hi, {currentStudent.name.split(' ')[0]} 👋</h1>
          <p>
            Roll {currentStudent.roll_number} · Semester {currentStudent.semester} · Division {currentStudent.division} · {currentStudent.enrollment_number}
          </p>
        </div>
        <div className="page-header-actions" style={{ flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              background: activeSession ? 'linear-gradient(135deg, #16a34a, #059669)' : undefined,
              boxShadow: activeSession ? '0 0 12px rgba(22, 163, 74, 0.35)' : undefined,
            }}
            onClick={() => setIsQRScannerOpen(true)}
          >
            <QrCode size={14} />
            {activeSession ? 'Live Lecture: Scan QR Now' : 'Scan Attendance QR'}
          </button>
          <button
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              borderColor: currentStudent.face_registered ? 'var(--green-200)' : 'var(--blue-200)',
              background: currentStudent.face_registered ? 'var(--green-50)' : 'var(--blue-50)',
              color: currentStudent.face_registered ? 'var(--green-700)' : 'var(--blue-700)',
            }}
            onClick={() => setIsFaceEnrollOpen(true)}
          >
            <Scan size={14} />
            {currentStudent.face_registered ? 'Face enrolled ✓ (re-enroll)' : 'Enroll your face'}
          </button>
          <button className="btn btn-secondary" onClick={() => setIsCalendarOpen(true)}>
            <Calendar size={14} /> Academic Calendar
          </button>
          <button className="btn btn-secondary" onClick={() => setIsApplyLeaveOpen(true)}>
            <FileText size={14} /> Apply for Leave / OD
          </button>
          <button className="btn btn-secondary" onClick={() => setIsCorrectionOpen(true)}>
            <HelpCircle size={14} /> Request Correction
          </button>
          <button className="btn btn-primary" onClick={() => setIsReportModalOpen(true)}>
            <Award size={14} /> Attendance Slip
          </button>
        </div>
      </div>

      {/* ── Active Lecture QR Attendance Banner ─────────── */}
      {activeSession && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.875rem 1.25rem',
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(16, 185, 129, 0.08))',
            border: '1px solid var(--blue-300)',
            borderRadius: 'var(--r-lg)',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="pulse-indicator" style={{ width: 10, height: 10 }} />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--blue-900)' }}>
                Live Attendance Session Open:{' '}
                {classes.find((c) => c.id === activeSession.class_id)?.subject_id
                  ? subjects.find((s) => s.id === classes.find((c) => c.id === activeSession.class_id)?.subject_id)?.name
                  : 'Current Lecture'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: 2 }}>
                Room {classes.find((c) => c.id === activeSession.class_id)?.room || '301'} · Scan the rolling QR code or use face verification to mark presence.
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              boxShadow: '0 0 12px rgba(37, 99, 235, 0.35)',
            }}
            onClick={() => setIsQRScannerOpen(true)}
          >
            <QrCode size={14} /> Scan QR &amp; Mark Present
          </button>
        </div>
      )}

      {/* Leave Notification Banner */}
      {leaveToastMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--green-50)',
          border: '1px solid var(--green-200)',
          borderRadius: 'var(--r-md)',
          color: 'var(--green-800)',
          fontSize: '0.8125rem',
          fontWeight: 500,
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={16} color="var(--green-600)" />
            <span>{leaveToastMsg}</span>
          </div>
          <button
            onClick={() => setLeaveToastMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-600)', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Scheduled Extra Classes Notification for this Student */}
      {extraClasses.some((ex) => myClassIds.has(ex.class_id)) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: 'var(--amber-50)',
            border: '1px solid var(--amber-200)',
            borderRadius: 'var(--r-md)',
            color: 'var(--amber-900)',
            fontSize: '0.8125rem',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} color="var(--amber-700)" />
            <span>
              <strong>Special Compensatory Class Scheduled:</strong> Check your academic calendar for upcoming weekend lectures.
            </span>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={() => setIsCalendarOpen(true)}>
            View Calendar Details
          </button>
        </div>
      )}

      {/* ── Warning Banner (if low attendance) ───────────── */}
      {overall.is_low_attendance && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Attendance below {Math.round(minAttendanceThreshold * 100)}% — exam eligibility at risk.</strong>{' '}
            Attend the next <strong>{overall.required_attend}</strong> consecutive classes to meet the mandatory threshold.
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 1 — KPI SUMMARY BOXES
      ══════════════════════════════════════════════════ */}
      <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
        {[
          {
            label: 'Overall Attendance',
            value: `${overall.percentage}%`,
            sub: `${overall.total_present} of ${overall.total_conducted} classes`,
            accent: overall.is_low_attendance ? 'var(--red-600)' : 'var(--green-600)',
            bg: overall.is_low_attendance ? 'var(--red-50)' : 'var(--green-50)',
            bdr: overall.is_low_attendance ? 'var(--red-200)' : 'var(--green-200)',
          },
          {
            label: 'Attended',
            value: overall.total_present,
            sub: 'classes present',
            accent: 'var(--blue-600)',
            bg: 'var(--blue-50)',
            bdr: 'var(--blue-100)',
          },
          {
            label: 'Missed',
            value: overall.total_absent,
            sub: 'classes missed',
            accent: 'var(--red-600)',
            bg: 'var(--red-50)',
            bdr: 'var(--red-200)',
          },
          {
            label: overall.is_low_attendance ? 'Classes Needed' : 'Safe to Skip',
            value: overall.is_low_attendance ? overall.required_attend : overall.safe_misses,
            sub: overall.is_low_attendance ? 'attend consecutively' : 'more classes buffer',
            accent: overall.is_low_attendance ? 'var(--amber-600)' : 'var(--green-600)',
            bg: overall.is_low_attendance ? 'var(--amber-50)' : 'var(--green-50)',
            bdr: overall.is_low_attendance ? 'var(--amber-200)' : 'var(--green-200)',
          },
        ].map((kpi, i) => (
          <div
            key={i}
            style={{
              background: kpi.bg,
              border: `1px solid ${kpi.bdr}`,
              borderRadius: 'var(--r-lg)',
              padding: '1.125rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: kpi.accent,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {kpi.label}
            </span>
            <span
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                color: kpi.accent,
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}
            >
              {kpi.value}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 2 — SEMESTER OVERVIEW & TODAY'S SCHEDULE
      ══════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '310px 1fr',
          gap: '1.25rem',
          marginBottom: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* Left column — Donut overview */}
        <div
          className="section"
          style={{
            padding: '1.25rem 1.375rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          {/* Header */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--gray-200)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={15} color="var(--blue-600)" />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--gray-900)' }}>
                Semester Standing
              </span>
            </div>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--gray-500)',
                background: 'var(--gray-100)',
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--r-sm)',
              }}
            >
              Sem {currentStudent.semester}-{currentStudent.division}
            </span>
          </div>

          {/* Progress Ring & Status */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem', padding: '0.375rem 0' }}>
            <CircularProgress
              value={overall.percentage}
              size={128}
              strokeWidth={11}
              threshold={minAttendanceThreshold * 100}
            />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.25rem 0.75rem',
                borderRadius: 'var(--r-full)',
                background: overall.is_low_attendance ? 'var(--red-50)' : 'var(--green-50)',
                color: overall.is_low_attendance ? 'var(--red-600)' : 'var(--green-600)',
                border: `1px solid ${overall.is_low_attendance ? 'var(--red-200)' : 'var(--green-200)'}`,
              }}
            >
              {overall.is_low_attendance ? '⚠ Exam Eligibility at Risk' : '✓ Eligible for Exams'}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
              Mandatory minimum: {Math.round(minAttendanceThreshold * 100)}%
            </span>
          </div>

          {/* Key Metrics Breakdown Card */}
          <div
            style={{
              width: '100%',
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 'var(--r-md)',
              padding: '0.75rem 0.875rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            {[
              { l: 'Attended Classes', v: overall.total_present, c: 'var(--green-600)' },
              { l: 'Missed Classes', v: overall.total_absent, c: 'var(--red-600)' },
              { l: 'Total Conducted', v: overall.total_conducted, c: 'var(--blue-600)' },
            ].map((r, idx, arr) => (
              <div
                key={r.l}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8125rem',
                  padding: '0.25rem 0',
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--gray-200)' : 'none',
                }}
              >
                <span style={{ color: 'var(--gray-600)', fontWeight: 500 }}>{r.l}</span>
                <strong style={{ color: r.c, fontWeight: 700 }}>{r.v}</strong>
              </div>
            ))}
          </div>

          <button
            type="button"
            className={`btn btn-sm ${overall.is_low_attendance ? 'btn-secondary' : 'btn-primary'}`}
            style={{ width: '100%', marginTop: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
            onClick={() => setIsHallTicketOpen(true)}
          >
            <Award size={14} /> {overall.is_low_attendance ? 'Check Detention Status' : 'Official Exam Hall Ticket'}
          </button>

          {/* Interactive What-If Simulation Card */}
          <div style={{ marginTop: '0.875rem' }}>
            <AttendanceCalculatorCard
              present={overall.total_present}
              conducted={overall.total_conducted}
              defaultThreshold={minAttendanceThreshold}
            />
          </div>
        </div>

        {/* Right — Today's Schedule Timetable */}
        <div className="section" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-head" style={{ marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div className="section-title">
                <Calendar size={16} color="var(--blue-600)" /> Today's Lecture Timetable
              </div>
              <div className="section-subtitle">
                Semester {currentStudent.semester} · Division {currentStudent.division} · Room schedules
              </div>
            </div>
            <span
              style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--gray-500)',
                background: 'var(--gray-100)',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {classes.length} Lectures Total
            </span>
          </div>

          <div
            className="custom-scrollbar"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxHeight: 382,
              overflowY: 'auto',
              paddingRight: '0.375rem',
            }}
          >
            {classes.map((cls) => {
              const subject = subjects.find((s) => s.id === cls.subject_id);
              const faculty = facultyList.find((f) => f.id === cls.faculty_id);
              const isActive = activeSession?.class_id === cls.id;
              const alreadyMarked = records.some(
                (r) =>
                  r.class_id === cls.id &&
                  r.student_id === currentStudent.id &&
                  (r.status === 'PRESENT' || r.status === 'LATE')
              );
              const classSessions = sessions.filter((s) => s.class_id === cls.id && s.topic);
              const latestTopic = classSessions.length > 0 ? classSessions[0].topic : undefined;

              return (
                <div
                  key={cls.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '0.875rem 1rem',
                    borderRadius: 'var(--r-md)',
                    border: `1px solid ${isActive ? 'var(--blue-500)' : 'var(--gray-200)'}`,
                    background: isActive ? 'var(--blue-50)' : 'var(--gray-50)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 'var(--r-sm)',
                        flexShrink: 0,
                        background: isActive ? 'var(--blue-600)' : 'var(--white)',
                        border: `1px solid ${isActive ? 'var(--blue-600)' : 'var(--gray-200)'}`,
                        color: isActive ? '#fff' : 'var(--gray-700)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.6875rem',
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {subject?.code?.replace(/[A-Z]{2}/g, '') || 'LEC'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          color: 'var(--gray-900)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {subject?.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', display: 'flex', gap: '0.875rem', marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={11} />
                          {cls.schedule_time}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <MapPin size={11} />
                          {cls.room}
                        </span>
                        {faculty && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--gray-400)' }}>
                            <UserIcon size={11} />
                            {faculty.name}
                          </span>
                        )}
                      </div>
                      {latestTopic && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--blue-700)', background: 'var(--blue-50)', border: '1px solid var(--blue-100)', padding: '0.15rem 0.4rem', borderRadius: 'var(--r-sm)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <BookOpen size={11} />
                          <span>Topic: <strong>{latestTopic}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Clean Timetable Status Badge */}
                  <div>
                    {alreadyMarked ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: 'var(--green-600)',
                          background: 'var(--green-50)',
                          padding: '0.3rem 0.625rem',
                          borderRadius: 'var(--r-full)',
                          border: '1px solid var(--green-200)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <CheckCircle2 size={13} /> Present
                      </span>
                    ) : isActive ? (
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.35rem 0.65rem',
                          borderRadius: 'var(--r-full)',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 0 10px rgba(37, 99, 235, 0.3)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setIsQRScannerOpen(true)}
                        title="Scan attendance QR for this active lecture"
                      >
                        <span className="pulse-indicator" style={{ width: 6, height: 6 }} />
                        <QrCode size={12} /> Scan QR Now
                      </button>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--gray-500)',
                          background: 'var(--white)',
                          padding: '0.3rem 0.625rem',
                          borderRadius: 'var(--r-full)',
                          border: '1px solid var(--gray-200)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Clock size={12} />
                        Scheduled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 3 — SUBJECT-WISE ATTENDANCE
      ══════════════════════════════════════════════════ */}
      <div className="section" style={{ marginBottom: '1.25rem' }}>
        <div className="section-head">
          <div>
            <div className="section-title">
              <TrendingUp size={16} color="var(--blue-600)" /> Subject-wise Attendance Breakdown
            </div>
            <div className="section-subtitle">Individual course thresholds and safe-miss allowances</div>
          </div>
        </div>

        <div className="grid-2">
          {subjectStats.map((stat) => {
            const ok = stat.percentage >= minAttendanceThreshold * 100;
            return (
              <div
                key={stat.subject_id}
                style={{
                  padding: '1.125rem',
                  border: `1px solid ${ok ? 'var(--gray-200)' : 'var(--red-200)'}`,
                  borderRadius: 'var(--r-md)',
                  background: ok ? 'var(--white)' : 'var(--red-50)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                  <div>
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--gray-400)',
                      }}
                    >
                      {stat.subject_code}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--gray-900)', marginTop: 2 }}>
                      {stat.subject_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 1 }}>
                      {stat.faculty_name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 800,
                        color: ok ? 'var(--green-600)' : 'var(--red-600)',
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {stat.percentage}%
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>
                      {stat.present} / {stat.conducted} lectures
                    </div>
                  </div>
                </div>
                <ProgressBar value={stat.percentage} threshold={minAttendanceThreshold * 100} />
                <div
                  style={{
                    marginTop: '0.625rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: ok ? 'var(--green-600)' : 'var(--red-600)',
                  }}
                >
                  {ok
                    ? `✓ Safe to miss ${stat.safe_misses} more ${stat.safe_misses === 1 ? 'class' : 'classes'}`
                    : `⚠ Must attend next ${stat.required_attend} consecutive ${stat.required_attend === 1 ? 'class' : 'classes'}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 4 — ATTENDANCE LOG & CALENDAR VIEW
      ══════════════════════════════════════════════════ */}
      <div className="section" style={{ marginBottom: '1.25rem' }}>
        <div className="section-head" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div className="section-title">
              <FileSpreadsheet size={16} color="var(--blue-600)" /> Attendance History &amp; Monthly Calendar
            </div>
            <div className="section-subtitle">Chronological record and visual monthly breakdown of verified lecture attendance</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            {/* View Mode Switcher */}
            <div style={{ display: 'flex', background: 'var(--gray-100)', padding: 2, borderRadius: 'var(--r-sm)', border: '1px solid var(--gray-200)' }}>
              <button
                className={`btn btn-xs ${viewMode === 'TABLE' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.6875rem', padding: '0.2rem 0.55rem', borderRadius: 'var(--r-xs)' }}
                onClick={() => setViewMode('TABLE')}
              >
                Table Log
              </button>
              <button
                className={`btn btn-xs ${viewMode === 'CALENDAR' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.6875rem', padding: '0.2rem 0.55rem', borderRadius: 'var(--r-xs)' }}
                onClick={() => setViewMode('CALENDAR')}
              >
                Monthly Calendar
              </button>
            </div>

            {/* Filter buttons (only active for Table Log) */}
            {viewMode === 'TABLE' && (
              <div className="section-actions" style={{ gap: '0.25rem' }}>
                {(['ALL', 'PRESENT', 'ABSENT'] as const).map((f) => (
                  <button
                    key={f}
                    className={`btn btn-xs ${historyFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem' }}
                    onClick={() => setHistoryFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {viewMode === 'CALENDAR' ? (
          <AttendanceCalendarView
            records={records.filter((r) => r.student_id === currentStudent.id)}
            classes={classes}
            subjects={subjects}
          />
        ) : (
          /* Scrollable table displaying 6 to 8 items then vertical scroll with sticky headers */
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Subject Course</th>
                <th>Status</th>
                <th>Session Type</th>
              </tr>
            </thead>
            <tbody>
              {studentRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-400)' }}>
                    No attendance records found for this filter.
                  </td>
                </tr>
              ) : (
                studentRecords.map((rec) => {
                  const cls = classes.find((c) => c.id === rec.class_id);
                  const sub = subjects.find((s) => s.id === cls?.subject_id);
                  const d = new Date(rec.lecture_at ?? rec.marked_at);

                  return (
                    <tr key={rec.id}>
                      <td style={{ color: 'var(--gray-500)', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                        {isNaN(d.getTime())
                          ? rec.marked_at
                          : d.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>
                        {sub?.name ?? 'Lecture'}
                        <span style={{ fontSize: '0.6875rem', color: 'var(--gray-400)', marginLeft: 6, fontWeight: 400 }}>
                          ({sub?.code})
                        </span>
                      </td>
                      <td>
                        <Badge status={rec.status} />
                      </td>
                      <td style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>
                        {rec.method === 'FACE' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', fontWeight: 600, fontSize: '0.75rem' }}>
                            <Scan size={11} /> Face Recognition
                          </span>
                        ) : rec.method === 'QR' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontWeight: 600, fontSize: '0.75rem' }}>
                            Rolling QR
                          </span>
                        ) : (
                          'Manual Roll Call'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Modal for submitting correction / OD requests */}
      <CorrectionRequestModal isOpen={isCorrectionOpen} onClose={() => setIsCorrectionOpen(false)} />

      {/* Modal for Official Printable Report */}
      <OfficialReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />

      {/* Modal for Official Examination Admit Card / Hall Ticket & Detention Warning */}
      <HallTicketModal
        isOpen={isHallTicketOpen}
        onClose={() => setIsHallTicketOpen(false)}
        student={currentStudent}
      />

      {/* Modal for Applying for Medical / Duty Leave */}
      <ApplyLeaveModal
        isOpen={isApplyLeaveOpen}
        onClose={() => setIsApplyLeaveOpen(false)}
        onSuccess={(msg) => {
          setLeaveToastMsg(msg);
          setTimeout(() => setLeaveToastMsg(null), 6000);
        }}
      />

      {/* Modal: Academic Calendar & Holidays */}
      <AcademicCalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
      />

      {/* Modal: Student Biometric Face Enrollment */}
      <FaceEnrollmentModal
        isOpen={isFaceEnrollOpen}
        onClose={() => setIsFaceEnrollOpen(false)}
      />

      {/* Modal: Live Lecture QR Scanner */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
      />
    </div>
  );
};
