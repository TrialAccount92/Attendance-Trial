import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { CollegeClass, AttendanceStatus } from '../../types';
import {
  X, CheckCheck, BookOpen,
  Check, } from 'lucide-react';
import { localDateString } from '../../utils/date';

interface QuickAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClass?: CollegeClass | null;
}

export const QuickAttendanceModal: React.FC<QuickAttendanceModalProps> = ({
  isOpen,
  onClose,
  initialClass,
}) => {
  const { currentFaculty, classes, subjects, getClassEnrolledStudents, markBatchAttendance } = useAttendance();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const myClasses = currentFaculty ? classes.filter((c) => c.faculty_id === currentFaculty.id) : [];

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [date, setDate] = useState<string>(() => localDateString());
  const [topic, setTopic] = useState<string>('');
  const [rosterMap, setRosterMap] = useState<Record<string, AttendanceStatus>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (initialClass) {
      setSelectedClassId(initialClass.id);
    } else if (myClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(myClasses[0].id);
    }
  }, [initialClass, myClasses, isOpen]);

  const activeClass = classes.find((c) => c.id === selectedClassId) || initialClass || myClasses[0];
  const activeSubject = activeClass ? subjects.find((s) => s.id === activeClass.subject_id) : null;

  const enrolledStudents = activeClass ? getClassEnrolledStudents(activeClass.id) : [];
  const rosterKey = enrolledStudents.map((s) => s.id).join(',');

  // Everyone starts as PRESENT whenever the class (or its roster) changes.
  useEffect(() => {
    const initialMap: Record<string, AttendanceStatus> = {};
    rosterKey.split(',').filter(Boolean).forEach((id) => {
      initialMap[id] = 'PRESENT';
    });
    setRosterMap(initialMap);
  }, [selectedClassId, rosterKey, isOpen]);

  if (!isOpen) return null;

  const handleMarkAll = (status: AttendanceStatus) => {
    const updated: Record<string, AttendanceStatus> = {};
    enrolledStudents.forEach((stu) => {
      updated[stu.id] = status;
    });
    setRosterMap(updated);
  };

  const handleToggleStudent = (studentId: string, status: AttendanceStatus) => {
    setRosterMap((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClass || enrolledStudents.length === 0) return;

    const payload = enrolledStudents.map((stu) => ({
      studentId: stu.id,
      status: rosterMap[stu.id] || 'PRESENT',
    }));

    setSaving(true);
    setSaveError(null);
    try {
      await markBatchAttendance(activeClass.id, date, topic.trim(), payload);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the roll call.');
      return;
    } finally {
      setSaving(false);
    }
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1200);
  };

  const presentCount = Object.values(rosterMap).filter((s) => s === 'PRESENT').length;
  const absentCount = Object.values(rosterMap).filter((s) => s === 'ABSENT').length;
  const lateCount = Object.values(rosterMap).filter((s) => s === 'LATE').length;
  const attendanceRate = enrolledStudents.length > 0 ? Math.round((presentCount / enrolledStudents.length) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
              Take Quick Attendance
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>
              Fast 1-click roll call sheet with bulk status toggles
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--r-full)',
                background: 'var(--green-50)',
                color: 'var(--green-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              <Check size={32} />
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--gray-900)' }}>
              Attendance Recorded!
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: 4 }}>
              Successfully recorded {presentCount} Present and {absentCount} Absent for {activeSubject?.name}.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Class & Date Selector Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '0.875rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Subject &amp; Division</label>
                <select
                  className="form-select"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  required
                >
                  {myClasses.map((cls) => {
                    const sub = subjects.find((s) => s.id === cls.subject_id);
                    return (
                      <option key={cls.id} value={cls.id}>
                        {sub?.name} ({sub?.code}) — Sem {cls.semester} {cls.division}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Date of Lecture</label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Optional Topic Covered Input */}
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <BookOpen size={12} color="var(--blue-600)" /> Topic Covered (Optional)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Relational Algebra, ER Modeling & Queries"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            {/* Bulk Shortcuts Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.875rem',
                background: 'var(--gray-50)',
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--r-md)',
                marginBottom: '0.875rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-700)' }}>
                {enrolledStudents.length} Students Enrolled:
                <span style={{ color: 'var(--green-600)', marginLeft: 6 }}>{presentCount} P</span> ·
                <span style={{ color: 'var(--red-600)', marginLeft: 4 }}>{absentCount} A</span> ·
                <span style={{ color: 'var(--gray-900)', marginLeft: 6, fontWeight: 700 }}>({attendanceRate}%)</span>
              </div>

              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  style={{ color: 'var(--green-700)', fontWeight: 600 }}
                  onClick={() => handleMarkAll('PRESENT')}
                >
                  <CheckCheck size={12} /> All Present
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  style={{ color: 'var(--red-600)' }}
                  onClick={() => handleMarkAll('ABSENT')}
                >
                  All Absent
                </button>
              </div>
            </div>

            {/* Students Roster Checklist */}
            <div className="table-scroll" style={{ maxHeight: 270, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0.375rem' }}>
                {enrolledStudents.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '2rem' }}>
                    No students enrolled in this division.
                  </p>
                ) : (
                  enrolledStudents.map((stu) => {
                    const status = rosterMap[stu.id] || 'PRESENT';

                    return (
                      <div
                        key={stu.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--gray-100)',
                          background:
                            status === 'PRESENT'
                              ? 'var(--white)'
                              : status === 'ABSENT'
                              ? 'var(--red-50)'
                              : 'var(--amber-50)',
                          transition: 'background 0.12s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <span
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 'var(--r-full)',
                              background: 'var(--gray-100)',
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--gray-700)',
                            }}
                          >
                            {stu.roll_number}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--gray-900)' }}>
                              {stu.name}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
                              {stu.enrollment_number}
                            </div>
                          </div>
                        </div>

                        {/* Status Toggle Buttons */}
                        <div style={{ display: 'flex', gap: 2 }}>
                          {(['PRESENT', 'ABSENT', 'LATE'] as const).map((st) => {
                            const isSelected = status === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleToggleStudent(stu.id, st)}
                                style={{
                                  fontSize: '0.6875rem',
                                  fontWeight: isSelected ? 700 : 500,
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: 'var(--r-xs)',
                                  border: `1px solid ${
                                    isSelected
                                      ? st === 'PRESENT'
                                        ? 'var(--green-600)'
                                        : st === 'ABSENT'
                                        ? 'var(--red-600)'
                                        : 'var(--amber-600)'
                                      : 'var(--gray-200)'
                                  }`,
                                  background: isSelected
                                    ? st === 'PRESENT'
                                      ? 'var(--green-600)'
                                      : st === 'ABSENT'
                                      ? 'var(--red-600)'
                                      : 'var(--amber-600)'
                                    : 'var(--white)',
                                  color: isSelected ? '#ffffff' : 'var(--gray-600)',
                                  cursor: 'pointer',
                                }}
                              >
                                {st === 'PRESENT' ? 'P' : st === 'ABSENT' ? 'A' : 'L'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {saveError && (
              <div className="alert alert-danger" style={{ fontSize: '0.8125rem', marginTop: '0.75rem' }}>{saveError}</div>
            )}

            {/* Submit Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} />
                {saving ? 'Saving…' : 'Save Roll Call Attendance'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
