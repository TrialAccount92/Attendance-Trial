import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { CollegeClass } from '../../types';
import { X, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

interface AdminClassTimetableModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClass?: CollegeClass | null;
  preselectedFacultyId?: string;
  onSuccess?: (msg: string) => void;
}

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const TIME_SLOTS = [
  '09:00 - 10:00 AM',
  '10:00 - 11:00 AM',
  '11:15 AM - 12:15 PM',
  '12:15 - 01:15 PM',
  '01:45 - 02:45 PM',
  '02:45 - 03:45 PM',
  '03:45 - 04:45 PM',
];

const ROOM_PRESETS = [
  'Room 301',
  'Room 302',
  'Room 303',
  'Lab 1 (Software Lab)',
  'Lab 2 (Hardware Lab)',
  'Lab 3 (Networks)',
  'Lecture Hall 1 (LH-1)',
  'Lecture Hall 2 (LH-2)',
  'Auditorium',
];

export const AdminClassTimetableModal: React.FC<AdminClassTimetableModalProps> = ({
  isOpen,
  onClose,
  initialClass,
  preselectedFacultyId,
  onSuccess,
}) => {
  const { subjects, facultyList, addClass, updateClass } = useAttendance();

  const [subjectId, setSubjectId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [semester, setSemester] = useState(3);
  const [division, setDivision] = useState('A');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [scheduleTime, setScheduleTime] = useState(TIME_SLOTS[0]);
  const [customTime, setCustomTime] = useState('');
  const [isCustomTime, setIsCustomTime] = useState(false);
  const [room, setRoom] = useState(ROOM_PRESETS[0]);
  const [customRoom, setCustomRoom] = useState('');
  const [isCustomRoom, setIsCustomRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialClass) {
      setSubjectId(initialClass.subject_id);
      setFacultyId(initialClass.faculty_id || '');
      setSemester(initialClass.semester);
      setDivision(initialClass.division);
      setDayOfWeek(initialClass.day_of_week);
      
      if (TIME_SLOTS.includes(initialClass.schedule_time)) {
        setScheduleTime(initialClass.schedule_time);
        setIsCustomTime(false);
        setCustomTime('');
      } else {
        setIsCustomTime(true);
        setCustomTime(initialClass.schedule_time);
      }

      if (ROOM_PRESETS.includes(initialClass.room)) {
        setRoom(initialClass.room);
        setIsCustomRoom(false);
        setCustomRoom('');
      } else {
        setIsCustomRoom(true);
        setCustomRoom(initialClass.room);
      }
    } else {
      if (subjects.length > 0) {
        setSubjectId(subjects[0].id);
      }
      setFacultyId(preselectedFacultyId || (facultyList.length > 0 ? facultyList[0].id : ''));
      setSemester(3);
      setDivision('A');
      setDayOfWeek('Monday');
      setScheduleTime(TIME_SLOTS[0]);
      setIsCustomTime(false);
      setCustomTime('');
      setRoom(ROOM_PRESETS[0]);
      setIsCustomRoom(false);
      setCustomRoom('');
    }
    setError(null);
  }, [initialClass, preselectedFacultyId, subjects, facultyList, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subjectId) {
      setError('Please select a subject.');
      return;
    }

    const finalTime = isCustomTime ? customTime.trim() : scheduleTime.trim();
    if (!finalTime) {
      setError('Please provide a valid schedule time slot.');
      return;
    }

    const finalRoom = isCustomRoom ? customRoom.trim() : room.trim();
    if (!finalRoom) {
      setError('Please specify a classroom or lab location.');
      return;
    }

    const subjectObj = subjects.find((s) => s.id === subjectId);
    const subjectName = subjectObj ? `${subjectObj.name} (${subjectObj.code})` : 'Class';

    if (initialClass) {
      await updateClass(initialClass.id, {
        subject_id: subjectId,
        faculty_id: facultyId,
        semester: Number(semester),
        division: division.toUpperCase(),
        day_of_week: dayOfWeek,
        schedule_time: finalTime,
        room: finalRoom,
      });
      onSuccess?.(`Updated timetable entry for ${subjectName}`);
    } else {
      await addClass({
        subject_id: subjectId,
        faculty_id: facultyId,
        semester: Number(semester),
        division: division.toUpperCase(),
        day_of_week: dayOfWeek,
        schedule_time: finalTime,
        room: finalRoom,
      });
      onSuccess?.(`Scheduled new class session for ${subjectName}`);
    }

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
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
              <Calendar size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                {initialClass ? 'Edit Timetable Entry' : 'Schedule New Class / Lecture'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Configure subject, faculty allotment, timings, and classroom
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {error && (
            <div className="alert alert-danger" style={{ padding: '0.65rem 0.875rem' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Subject & Faculty */}
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Subject *</label>
              <select
                className="form-select form-select-sm"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                required
              >
                <option value="" disabled>Select Subject</option>
                {subjects.map((subj) => (
                  <option key={subj.id} value={subj.id}>
                    {subj.name} ({subj.code}) {subj.semester ? `- Sem ${subj.semester}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Allotted Faculty</label>
              <select
                className="form-select form-select-sm"
                value={facultyId}
                onChange={(e) => setFacultyId(e.target.value)}
              >
                <option value="">-- Unassigned / TBA --</option>
                {facultyList.map((fac) => (
                  <option key={fac.id} value={fac.id}>
                    {fac.name} ({fac.designation})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Semester & Division */}
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Target Semester</label>
              <select
                className="form-select form-select-sm"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Division / Section</label>
              <select
                className="form-select form-select-sm"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
              >
                {['A', 'B', 'C', 'D'].map((div) => (
                  <option key={div} value={div}>Division {div}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Day & Time */}
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Day of Week</label>
              <select
                className="form-select form-select-sm"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Time Slot</label>
                <button
                  type="button"
                  onClick={() => setIsCustomTime(!isCustomTime)}
                  style={{ background: 'none', border: 'none', color: 'var(--blue-600)', fontSize: '0.6875rem', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  {isCustomTime ? 'Preset slots' : 'Custom time'}
                </button>
              </div>
              {isCustomTime ? (
                <input
                  type="text"
                  className="form-input form-input-sm"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  placeholder="e.g. 04:30 - 05:30 PM"
                  required
                />
              ) : (
                <select
                  className="form-select form-select-sm"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Room / Location */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Classroom / Lab Location</label>
              <button
                type="button"
                onClick={() => setIsCustomRoom(!isCustomRoom)}
                style={{ background: 'none', border: 'none', color: 'var(--blue-600)', fontSize: '0.6875rem', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {isCustomRoom ? 'Preset rooms' : 'Custom room'}
              </button>
            </div>
            {isCustomRoom ? (
              <input
                type="text"
                className="form-input form-input-sm"
                value={customRoom}
                onChange={(e) => setCustomRoom(e.target.value)}
                placeholder="e.g. Seminar Hall A, Physics Lab"
                required
              />
            ) : (
              <select
                className="form-select form-select-sm"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
              >
                {ROOM_PRESETS.map((rm) => (
                  <option key={rm} value={rm}>{rm}</option>
                ))}
              </select>
            )}
          </div>

          {/* Info notice */}
          <div style={{ padding: '0.625rem 0.75rem', background: 'var(--blue-50)', border: '1px solid var(--blue-100)', borderRadius: 'var(--r-md)', fontSize: '0.75rem', color: 'var(--blue-800)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <CheckCircle2 size={15} color="var(--blue-600)" style={{ flexShrink: 0 }} />
            <span>Students in Sem {semester} - Div {division} will automatically have this class scheduled on their attendance rosters and timetable.</span>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Calendar size={14} /> {initialClass ? 'Save Changes' : 'Add to Timetable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
