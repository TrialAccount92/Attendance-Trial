import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { Student } from '../../types';
import { X, UserCheck, CheckSquare, Square, Sparkles, Check } from 'lucide-react';

interface ManageStudentEnrollmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  onSuccess?: (msg: string) => void;
}

export const ManageStudentEnrollmentsModal: React.FC<ManageStudentEnrollmentsModalProps> = ({
  isOpen,
  onClose,
  student,
  onSuccess,
}) => {
  const { classes, subjects, facultyList, getStudentEnrolledClassIds, updateStudentEnrollments } = useAttendance();

  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [filterView, setFilterView] = useState<'all' | 'cohort' | 'enrolled'>('all');

  useEffect(() => {
    if (student && isOpen) {
      const currentEnrolled = getStudentEnrolledClassIds(student.id);
      setSelectedClassIds(currentEnrolled);
    }
  }, [student, isOpen, getStudentEnrolledClassIds]);

  if (!isOpen || !student) return null;

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const selectAllCohort = () => {
    const cohortClassIds = classes
      .filter((c) => c.semester === student.semester && c.division === student.division)
      .map((c) => c.id);
    setSelectedClassIds((prev) => Array.from(new Set([...prev, ...cohortClassIds])));
  };

  const clearAll = () => {
    setSelectedClassIds([]);
  };

  const handleSave = async () => {
    await updateStudentEnrollments(student.id, selectedClassIds);
    onSuccess?.(`Updated class allotments for ${student.name} (${selectedClassIds.length} classes).`);
    onClose();
  };

  const cohortClasses = classes.filter(
    (c) => c.semester === student.semester && c.division === student.division
  );

  const displayedClasses = classes.filter((c) => {
    if (filterView === 'cohort') {
      return c.semester === student.semester && c.division === student.division;
    }
    if (filterView === 'enrolled') {
      return selectedClassIds.includes(c.id);
    }
    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-md)',
                background: 'var(--blue-50)',
                color: 'var(--blue-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserCheck size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                Manage Class Allotments
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Allot subjects and classes for <strong style={{ color: 'var(--gray-800)' }}>{student.name}</strong> (Roll: {student.roll_number})
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Student Cohort Tag & Quick Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', background: 'var(--gray-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--gray-200)', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <span className="badge badge-neutral">Sem {student.semester} · Div {student.division}</span>
            <span style={{ fontWeight: 600, color: 'var(--blue-600)' }}>{selectedClassIds.length} classes allotted</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={selectAllCohort}
              style={{ color: 'var(--blue-600)', borderColor: 'var(--blue-200)', background: 'var(--blue-50)' }}
            >
              <Sparkles size={12} /> Select All Cohort ({cohortClasses.length})
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={clearAll}
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--gray-200)', marginBottom: '0.75rem', fontSize: '0.8125rem', fontWeight: 600 }}>
          <button
            type="button"
            onClick={() => setFilterView('all')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: filterView === 'all' ? '2px solid var(--blue-600)' : '2px solid transparent',
              color: filterView === 'all' ? 'var(--blue-600)' : 'var(--gray-500)',
              padding: '0.35rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            All Classes ({classes.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterView('cohort')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: filterView === 'cohort' ? '2px solid var(--blue-600)' : '2px solid transparent',
              color: filterView === 'cohort' ? 'var(--blue-600)' : 'var(--gray-500)',
              padding: '0.35rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            Student's Cohort ({cohortClasses.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterView('enrolled')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: filterView === 'enrolled' ? '2px solid var(--blue-600)' : '2px solid transparent',
              color: filterView === 'enrolled' ? 'var(--blue-600)' : 'var(--gray-500)',
              padding: '0.35rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            Allotted Only ({selectedClassIds.length})
          </button>
        </div>

        {/* Class Selection List */}
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem', marginBottom: '1rem' }}>
          {displayedClasses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--gray-400)', fontSize: '0.8125rem' }}>
              No classes found in this view.
            </div>
          ) : (
            displayedClasses.map((cls) => {
              const subj = subjects.find((s) => s.id === cls.subject_id);
              const fac = facultyList.find((f) => f.id === cls.faculty_id);
              const isEnrolled = selectedClassIds.includes(cls.id);
              const isCohortMatch = cls.semester === student.semester && cls.division === student.division;

              return (
                <div
                  key={cls.id}
                  onClick={() => toggleClass(cls.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--r-md)',
                    border: isEnrolled ? '1px solid var(--blue-300)' : '1px solid var(--gray-200)',
                    background: isEnrolled ? 'var(--blue-50)' : 'var(--white)',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div style={{ color: isEnrolled ? 'var(--blue-600)' : 'var(--gray-300)', display: 'flex' }}>
                      {isEnrolled ? <CheckSquare size={17} /> : <Square size={17} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--gray-900)' }}>
                          {subj?.name || 'Class'}
                        </span>
                        <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gray-500)', background: 'var(--gray-100)', padding: '0.1rem 0.35rem', borderRadius: 4 }}>
                          {subj?.code}
                        </span>
                        {isCohortMatch && (
                          <span className="badge badge-success" style={{ fontSize: '0.625rem' }}>
                            Cohort Match
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--gray-500)', marginTop: 2 }}>
                        Sem {cls.semester}-{cls.division} · {cls.day_of_week}, {cls.schedule_time} · {cls.room}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                    <div style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{fac?.name || 'Unassigned'}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--gray-400)' }}>{subj?.credits || 4} credits</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
            {selectedClassIds.length} of {classes.length} selected
          </span>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              <Check size={14} /> Save Allotments
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
