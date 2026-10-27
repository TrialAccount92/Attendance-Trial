import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { CollegeClass } from '../../types';
import { X, Calendar, Clock, MapPin, BookOpen, Layers, Check } from 'lucide-react';

interface ClassScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClass?: CollegeClass | null; // If provided, mode is EDIT. If null, mode is ADD.
}

const TIME_PRESETS = [
  '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:15 AM - 12:15 PM',
  '01:00 PM - 02:00 PM',
  '02:15 PM - 03:15 PM',
  '03:30 PM - 04:30 PM',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Today'];

export const ClassScheduleModal: React.FC<ClassScheduleModalProps> = ({
  isOpen,
  onClose,
  initialClass,
}) => {
  const { currentFaculty, subjects, addClass, updateClass } = useAttendance();

  const isEditMode = !!initialClass;

  const [subjectId, setSubjectId] = useState<string>('');
  const [semester, setSemester] = useState<number>(3);
  const [division, setDivision] = useState<string>('A');
  const [room, setRoom] = useState<string>('Room 402');
  const [dayOfWeek, setDayOfWeek] = useState<string>('Monday');
  const [scheduleTime, setScheduleTime] = useState<string>('10:00 AM - 11:00 AM');

  useEffect(() => {
    if (initialClass) {
      setSubjectId(initialClass.subject_id);
      setSemester(initialClass.semester);
      setDivision(initialClass.division);
      setRoom(initialClass.room);
      setDayOfWeek(initialClass.day_of_week || 'Today');
      setScheduleTime(initialClass.schedule_time);
    } else {
      // Default to first subject
      setSubjectId(subjects[0]?.id || '');
      setSemester(3);
      setDivision('A');
      setRoom('Room 402');
      setDayOfWeek('Monday');
      setScheduleTime('10:00 AM - 11:00 AM');
    }
  }, [initialClass, subjects, isOpen]);

  if (!isOpen || !currentFaculty) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !room.trim() || !scheduleTime.trim()) return;

    if (isEditMode && initialClass) {
      await updateClass(initialClass.id, {
        subject_id: subjectId,
        semester,
        division,
        room: room.trim(),
        day_of_week: dayOfWeek,
        schedule_time: scheduleTime.trim(),
      });
    } else {
      await addClass({
        subject_id: subjectId,
        faculty_id: currentFaculty.id,
        semester,
        division,
        room: room.trim(),
        day_of_week: dayOfWeek,
        schedule_time: scheduleTime.trim(),
      });
    }

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
              {isEditMode ? 'Edit Class & Schedule' : 'Add New Class to Schedule'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>
              {isEditMode ? 'Modify timing, classroom venue, or division' : 'Assign a new lecture slot to your faculty timetable'}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Subject Selection */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <BookOpen size={13} color="var(--blue-600)" /> Subject / Course
            </label>
            <select
              className="form-select"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.code}) · {sub.credits} Credits
                </option>
              ))}
            </select>
          </div>

          {/* Semester & Division */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Layers size={13} color="var(--blue-600)" /> Semester
              </label>
              <select
                className="form-select"
                value={semester}
                onChange={(e) => setSemester(parseInt(e.target.value, 10))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Division / Batch</label>
              <select
                className="form-select"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
              >
                {['A', 'B', 'C', 'D'].map((d) => (
                  <option key={d} value={d}>
                    Division {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Day & Classroom Room */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={13} color="var(--blue-600)" /> Day of Week
              </label>
              <select
                className="form-select"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={13} color="var(--blue-600)" /> Room / Venue
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Room 402, Lab 2"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Schedule Time & Quick Presets */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} color="var(--blue-600)" /> Lecture Timing Slot
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 10:00 AM - 11:00 AM"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              required
            />
            {/* Quick time pills */}
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setScheduleTime(preset)}
                  style={{
                    fontSize: '0.6875rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--gray-200)',
                    background: scheduleTime === preset ? 'var(--blue-50)' : 'var(--gray-50)',
                    color: scheduleTime === preset ? 'var(--blue-600)' : 'var(--gray-600)',
                    fontWeight: scheduleTime === preset ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-100)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} />
              {isEditMode ? 'Save Schedule Changes' : 'Add Class to Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
