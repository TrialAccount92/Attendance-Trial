import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import {
  QrCode, RotateCcw, Radio,
  Bell, HelpCircle, Calculator, X, Plus, Clock, CheckCircle2, Users, Check, LogOut, KeyRound,
} from 'lucide-react';
import { ChangePasswordModal } from '../common/ChangePasswordModal';
import { CorrectionRequestModal } from '../student/CorrectionRequestModal';
import { Badge } from '../common/Badge';
import { calculateAttendanceMetrics } from '../../utils/attendanceCalc';
import { ProgressBar } from '../common/ProgressBar';
import { AppRoute } from '../../utils/router';

interface NavbarProps {
  onOpenLiveSession?: () => void;
  currentRoute?: AppRoute;
  onNavigate?: (route: AppRoute) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenLiveSession, currentRoute, onNavigate }) => {
  const {
    currentRole,
    currentUser,
    currentStudent,
    isAuthenticated,
    logout,
    activeSession,
    classes,
    subjects,
    announcements,
    correctionRequests,
    reviewCorrectionRequest,
    minAttendanceThreshold,
    getStudentStats,
    resetToDefaultData,
    students,
  } = useAttendance();

  const [activeDropdown, setActiveDropdown] = useState<'NONE' | 'ANNOUNCEMENTS' | 'REQUESTS' | 'CALCULATOR'>('NONE');
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Calculator simulation state
  const [calcThreshold, setCalcThreshold] = useState<number>(minAttendanceThreshold || 0.75);
  const [calcBonusPresent, setCalcBonusPresent] = useState<number>(0);
  const [calcBonusMissed, setCalcBonusMissed] = useState<number>(0);
  const [calcStudentId, setCalcStudentId] = useState<string>('');

  const activeClass = activeSession ? classes.find((c) => c.id === activeSession.class_id) : null;
  const activeSubject = activeClass ? subjects.find((s) => s.id === activeClass.subject_id) : null;

  // Student specific requests or all pending requests
  const studentRequests = currentStudent
    ? correctionRequests.filter((r) => r.student_id === currentStudent.id)
    : [];

  const pendingRequestsCount = currentRole === 'STUDENT'
    ? studentRequests.filter((r) => r.status === 'PENDING').length
    : correctionRequests.filter((r) => r.status === 'PENDING').length;

  // Overall stats for faculty calculator simulation
  const targetStudent = students.find((s) => s.id === calcStudentId) || (currentStudent || students[0]);
  const studentStats = targetStudent ? getStudentStats(targetStudent.id).overall : null;
  const basePresent = studentStats?.total_present ?? 30;
  const baseConducted = studentStats?.total_conducted ?? 36;

  const simPresent = Math.max(0, basePresent + calcBonusPresent);
  const simConducted = Math.max(simPresent, baseConducted + calcBonusPresent + calcBonusMissed);
  const calcMetrics = calculateAttendanceMetrics(simPresent, simConducted, calcThreshold);

  const toggleDropdown = (type: 'ANNOUNCEMENTS' | 'REQUESTS' | 'CALCULATOR') => {
    setActiveDropdown((prev) => (prev === type ? 'NONE' : type));
  };

  const closeDropdown = () => setActiveDropdown('NONE');

  return (
    <>
      {activeDropdown !== 'NONE' && (
        <div className="nav-popover-backdrop" onClick={closeDropdown} />
      )}

      <header className="navbar">
        <div className="nav-content">
          {/* Brand */}
          <div
            className="brand-section"
            style={{ cursor: onNavigate ? 'pointer' : 'default' }}
            onClick={() => onNavigate && onNavigate(isAuthenticated ? (currentRole as AppRoute) : 'LOGIN')}
            title={isAuthenticated ? `Current: ${currentRole} Portal` : 'Click to go to Login'}
          >
            <div className="brand-icon-wrapper">
              <QrCode size={17} />
            </div>
            <div>
              <div className="brand-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                AttendPulse
                {currentRole === 'STUDENT' && (
                  <span style={{ fontSize: '0.65rem', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bfdbfe', fontWeight: 700 }}>
                    STUDENT
                  </span>
                )}
                {currentRole === 'FACULTY' && (
                  <span style={{ fontSize: '0.65rem', background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bbf7d0', fontWeight: 700 }}>
                    FACULTY
                  </span>
                )}
                {currentRole === 'ADMIN' && (
                  <span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '1px 6px', borderRadius: '4px', border: '1px solid #ddd6fe', fontWeight: 700 }}>
                    ADMIN
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Live session indicator (Faculty & Admin only — students shouldn't see faculty controls) */}
          {activeSession && currentRole !== 'STUDENT' && (
            <button
              onClick={onOpenLiveSession}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.3rem 0.75rem',
                background: 'var(--green-light)',
                border: '1px solid var(--green-border)',
                borderRadius: 'var(--radius-full)',
                color: 'var(--green)', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span className="pulse-indicator" />
              <Radio size={13} />
              <span>Live: {activeSubject?.name || 'Class'} • {activeClass?.division}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 2 }}>View →</span>
            </button>
          )}

          {/* Right side actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {isAuthenticated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    closeDropdown();
                    setIsPasswordModalOpen(true);
                  }}
                  title="Change password"
                  aria-label="Change password"
                >
                  <KeyRound size={14} />
                </button>
                <button
                  onClick={async () => {
                    closeDropdown();
                    await logout();
                    if (onNavigate) onNavigate('LOGIN');
                  }}
                  className="btn btn-ghost btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78125rem',
                    fontWeight: 600,
                    color: '#dc2626',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    padding: '0.3rem 0.65rem',
                    borderRadius: 'var(--r-md)',
                    cursor: 'pointer',
                  }}
                  title="Sign out"
                >
                  <LogOut size={13} color="#dc2626" />
                  <span>Log Out</span>
                </button>
              </div>
            )}

            {/* Attendance Goal Simulator - Available for Students, Faculty & Admin */}
            <div className="nav-icon-group">
              <button
                className={`nav-icon-btn${activeDropdown === 'CALCULATOR' ? ' active' : ''}`}
                onClick={() => toggleDropdown('CALCULATOR')}
                title="Attendance Goal Calculator"
                aria-label="Attendance Goal Calculator"
              >
                <Calculator size={16} />
              </button>

              {activeDropdown === 'CALCULATOR' && (
                <div className="nav-popover" style={{ width: 360 }}>
                  <div className="nav-popover-header">
                    <div className="nav-popover-title">
                      <Calculator size={16} color="var(--blue-600)" />
                      <span>Attendance Goal Calculator</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <select
                        className="form-select form-select-sm"
                        style={{ width: 'auto' }}
                        value={calcThreshold}
                        onChange={(e) => setCalcThreshold(parseFloat(e.target.value))}
                      >
                        <option value={0.70}>70% target</option>
                        <option value={0.75}>75% required</option>
                        <option value={0.80}>80% target</option>
                        <option value={0.85}>85% target</option>
                      </select>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem' }} onClick={closeDropdown}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="nav-popover-body">
                    {/* Faculty / Admin Student Roster Selector */}
                    {currentRole !== 'STUDENT' && students.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label className="form-label" style={{ fontSize: '0.6875rem', marginBottom: '0.25rem', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={12} color="var(--blue-600)" /> Select Student to Simulate
                        </label>
                        <select
                          className="form-select form-select-sm"
                          value={targetStudent?.id || ''}
                          onChange={(e) => {
                            setCalcStudentId(e.target.value);
                            setCalcBonusPresent(0);
                            setCalcBonusMissed(0);
                          }}
                        >
                          {students.map((stu) => {
                            const sStats = getStudentStats(stu.id).overall;
                            return (
                              <option key={stu.id} value={stu.id}>
                                {stu.name} ({stu.roll_number}) — {sStats.percentage}% (Sem {stu.semester}{stu.division})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    {/* Student View Banner */}
                    {currentRole === 'STUDENT' && currentStudent && (
                      <div style={{ marginBottom: '0.75rem', padding: '0.4rem 0.625rem', background: 'var(--gray-50)', borderRadius: 'var(--r-sm)', border: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray-900)' }}>
                          {currentStudent.name} (Roll {currentStudent.roll_number})
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--gray-500)' }}>
                          Sem {currentStudent.semester}·Div {currentStudent.division}
                        </span>
                      </div>
                    )}

                    {/* Metrics Banner */}
                    <div
                      style={{
                        padding: '0.875rem',
                        borderRadius: 'var(--r-md)',
                        background: calcMetrics.isLowAttendance ? 'var(--red-50)' : 'var(--green-50)',
                        border: `1px solid ${calcMetrics.isLowAttendance ? 'var(--red-200)' : 'var(--green-200)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: calcMetrics.isLowAttendance ? 'var(--red-600)' : 'var(--green-600)' }}>
                          {calcMetrics.isLowAttendance ? '⚠ Needs Catch-up' : '✓ Eligible & On Track'}
                        </span>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: calcMetrics.isLowAttendance ? 'var(--red-600)' : 'var(--green-600)' }}>
                          {calcMetrics.percentage}%
                        </span>
                      </div>
                      <ProgressBar value={calcMetrics.percentage} threshold={calcThreshold * 100} />
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)', marginTop: '0.5rem', lineHeight: 1.4 }}>
                        {calcMetrics.message}
                      </div>
                    </div>

                    {/* Stats display */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div style={{ padding: '0.625rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-sm)' }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>Attended / Total</div>
                        <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--gray-900)', marginTop: 2 }}>
                          {simPresent} / {simConducted}
                        </div>
                      </div>
                      <div style={{ padding: '0.625rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-sm)' }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                          {calcMetrics.isLowAttendance ? 'Needed to reach 75%' : 'Safe to Miss'}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '0.9375rem', color: calcMetrics.isLowAttendance ? 'var(--red-600)' : 'var(--green-600)', marginTop: 2 }}>
                          {calcMetrics.isLowAttendance ? `${calcMetrics.requiredAttend} classes` : `${calcMetrics.safeMisses} classes`}
                        </div>
                      </div>
                    </div>

                    {/* What-If Simulator Buttons */}
                    <div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray-400)', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
                        Simulate Upcoming Classes
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ flex: 1, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => setCalcBonusPresent((p) => p + 1)}
                        >
                          +1 Attended
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ flex: 1, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => setCalcBonusMissed((m) => m + 1)}
                        >
                          +1 Missed
                        </button>
                        {(calcBonusPresent > 0 || calcBonusMissed > 0) && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem' }}
                            onClick={() => {
                              setCalcBonusPresent(0);
                              setCalcBonusMissed(0);
                            }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {(calcBonusPresent > 0 || calcBonusMissed > 0) && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--blue-600)', marginTop: '0.375rem', fontWeight: 500 }}>
                          Simulating +{calcBonusPresent} attended and +{calcBonusMissed} missed
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Icon: Correction / Dispute Requests */}
            <div className="nav-icon-group">
              <button
                className={`nav-icon-btn${activeDropdown === 'REQUESTS' ? ' active' : ''}`}
                onClick={() => toggleDropdown('REQUESTS')}
                title="Disputes & Correction Requests"
                aria-label="Disputes & Correction Requests"
              >
                <HelpCircle size={16} />
                {pendingRequestsCount > 0 && (
                  <span className="nav-badge nav-badge-amber">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>

              {activeDropdown === 'REQUESTS' && (
                <div className="nav-popover">
                  <div className="nav-popover-header">
                    <div className="nav-popover-title">
                      <HelpCircle size={16} color="var(--blue-600)" />
                      <span>{currentRole === 'STUDENT' ? 'My Disputes & Requests' : 'Pending Requests'}</span>
                      <span style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--r-full)', background: 'var(--gray-200)', color: 'var(--gray-700)', fontWeight: 600 }}>
                        {currentRole === 'STUDENT' ? studentRequests.length : correctionRequests.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      {currentRole === 'STUDENT' && (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 26 }}
                          onClick={() => {
                            closeDropdown();
                            setIsCorrectionModalOpen(true);
                          }}
                        >
                          <Plus size={12} /> New
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem' }} onClick={closeDropdown}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="nav-popover-body">
                    {currentRole === 'STUDENT' ? (
                      studentRequests.length === 0 ? (
                        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.8125rem' }}>
                          <CheckCircle2 size={24} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                          No requests submitted yet.
                        </div>
                      ) : (
                        studentRequests.map((req) => (
                          <div key={req.id} className="nav-popover-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--gray-900)' }}>
                                {req.subject_name}
                              </span>
                              <Badge status={req.status} />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', lineHeight: 1.4 }}>
                              "{req.reason}"
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem', fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                              <span>Date: {req.date}</span>
                              {req.faculty_comment && (
                                <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                                  → {req.faculty_comment}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      // Faculty / Admin view
                      correctionRequests.length === 0 ? (
                        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.8125rem' }}>
                          All requests reviewed!
                        </div>
                      ) : (
                        correctionRequests.slice(0, 8).map((req) => (
                          <div key={req.id} className="nav-popover-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--gray-900)' }}>
                                {req.student_name}
                              </span>
                              <Badge status={req.status} />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-700)' }}>
                              {req.subject_name} · {req.date}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2, fontStyle: 'italic' }}>
                              "{req.reason}"
                            </div>
                            {req.status === 'PENDING' && (
                              <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-xs btn-secondary"
                                  style={{ padding: '0.2rem 0.5rem', color: 'var(--red-600)', borderColor: 'var(--red-200)', background: 'var(--red-50)' }}
                                  onClick={() => reviewCorrectionRequest(req.id, 'REJECTED', 'Dispute rejected by faculty.')}
                                >
                                  <X size={11} /> Reject
                                </button>
                                <button
                                  className="btn btn-xs btn-primary"
                                  style={{ padding: '0.2rem 0.5rem', background: 'var(--green-600)', borderColor: 'var(--green-600)' }}
                                  onClick={() => reviewCorrectionRequest(req.id, 'APPROVED', 'Approved by faculty.')}
                                >
                                  <Check size={11} /> Approve
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Icon: Announcements */}
            <div className="nav-icon-group">
              <button
                className={`nav-icon-btn${activeDropdown === 'ANNOUNCEMENTS' ? ' active' : ''}`}
                onClick={() => toggleDropdown('ANNOUNCEMENTS')}
                title="Announcements"
                aria-label="Announcements"
              >
                <Bell size={16} />
                {announcements.length > 0 && (
                  <span className="nav-badge">
                    {announcements.length}
                  </span>
                )}
              </button>

              {activeDropdown === 'ANNOUNCEMENTS' && (
                <div className="nav-popover">
                  <div className="nav-popover-header">
                    <div className="nav-popover-title">
                      <Bell size={16} color="var(--blue-600)" />
                      <span>Announcements</span>
                      <span style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--r-full)', background: 'var(--gray-200)', color: 'var(--gray-700)', fontWeight: 600 }}>
                        {announcements.length}
                      </span>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem' }} onClick={closeDropdown}>
                      <X size={14} />
                    </button>
                  </div>

                  <div className="nav-popover-body">
                    {announcements.map((ann) => (
                      <div
                        key={ann.id}
                        className="nav-popover-item"
                        style={{ borderLeft: '3px solid var(--blue-500)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--gray-900)' }}>
                            {ann.title}
                          </span>
                          <span style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem', borderRadius: 'var(--r-sm)', background: 'var(--blue-50)', color: 'var(--blue-600)', fontWeight: 700 }}>
                            {ann.category}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--gray-600)', lineHeight: 1.45, margin: 0 }}>
                          {ann.content}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem', fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={10} /> {ann.date}
                          </span>
                          <span>{ann.author}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile badge */}
            <div className="user-profile-badge">
              <div className="avatar-circle">
                {currentUser.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="user-info">
                <span className="user-name">{currentUser.name}</span>
                <span className="user-role-label">{currentRole.toLowerCase()}</span>
              </div>
            </div>

            {/* Demo data reset (admins only) */}
            {currentRole === 'ADMIN' && (
              <button
                className="btn-reset-demo"
                onClick={async () => {
                  if (!window.confirm('Erase ALL data (students, attendance, faces) and reload the demo data set? This cannot be undone.')) return;
                  await resetToDefaultData();
                  if (onNavigate) onNavigate('LOGIN');
                }}
                title="Erase everything and reload the demo data"
              >
                <RotateCcw size={12} />
                Reset demo
              </button>
            )}
          </div>
        </div>
      </header>

      {isPasswordModalOpen && <ChangePasswordModal onClose={() => setIsPasswordModalOpen(false)} />}

      {/* Modal for new request if triggered from navbar */}
      <CorrectionRequestModal
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
      />
    </>
  );
};
