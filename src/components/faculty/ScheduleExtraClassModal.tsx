import React, { useState, useEffect } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import {
  Calendar, X, Clock, MapPin, BookOpen, CheckCircle2, Users, } from 'lucide-react';
import { localDateString } from '../../utils/date';

interface ScheduleExtraClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassId?: string;
}

export const ScheduleExtraClassModal: React.FC<ScheduleExtraClassModalProps> = ({
  isOpen,
  onClose,
  initialClassId,
}) => {
  const { currentFaculty, classes, subjects, getClassEnrolledStudents, scheduleExtraClass } = useAttendance();

  const myClasses = currentFaculty
    ? classes.filter((c) => c.faculty_id === currentFaculty.id)
    : [];

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('10:00 AM');
  const [endTime, setEndTime] = useState<string>('11:30 AM');
  const [room, setRoom] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [reason, setReason] = useState<string>('Compensatory lecture for holiday syllabus catch-up');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Helper to calculate upcoming Saturday
  const getNextSaturday = (weeksAhead = 0) => {
    const d = new Date();
    const day = d.getDay(); // 0 is Sunday, 6 is Saturday
    const diff = (6 - day + 7) % 7 || 7; // days until next Saturday
    d.setDate(d.getDate() + diff + weeksAhead * 7);
    return localDateString(d);
  };

  useEffect(() => {
    if (initialClassId) {
      setSelectedClassId(initialClassId);
    } else if (myClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(myClasses[0].id);
    }
  }, [initialClassId, myClasses, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setDate(getNextSaturday(0));
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen]);

  const activeClass = classes.find((c) => c.id === selectedClassId) || myClasses[0];
  const activeSubject = activeClass ? subjects.find((s) => s.id === activeClass.subject_id) : null;

  useEffect(() => {
    if (activeClass?.room && !room) {
      setRoom(activeClass.room);
    }
  }, [activeClass]);

  const enrolledStudents = activeClass ? getClassEnrolledStudents(activeClass.id) : [];

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedClassId) {
      setErrorMsg('Please select a class.');
      return;
    }
    if (!date) {
      setErrorMsg('Please select a date.');
      return;
    }
    if (!topic.trim()) {
      setErrorMsg('Please enter the syllabus topic to be covered.');
      return;
    }

    if (!currentFaculty) return;

    try {
      await scheduleExtraClass({
        class_id: selectedClassId,
        date,
        start_time: startTime,
        end_time: endTime,
        room: room.trim() || activeClass?.room || 'Classroom',
        topic: topic.trim(),
        reason: reason.trim() || 'Compensatory lecture',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not schedule the class.');
      return;
    }

    setSuccessMsg('Extra lecture successfully scheduled! Students have been notified.');
    setTimeout(() => {
      setSuccessMsg('');
      onClose();
    }, 1200);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--gray-200)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 'var(--r-md)',
                background: 'var(--amber-50)',
                border: '1px solid var(--amber-200)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--amber-600)',
              }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--gray-900)' }}>
                Schedule Extra / Compensatory Class
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>
                Schedule Saturday or special lectures to cover syllabus and compensate missed hours
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={16} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Class / Subject Selection */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Subject &amp; Division</label>
            <select
              className="form-select"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                const cls = classes.find((c) => c.id === e.target.value);
                if (cls?.room) setRoom(cls.room);
              }}
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

          {/* Enrolled Students Info Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.625rem 0.875rem',
              background: 'var(--blue-50)',
              border: '1px solid var(--blue-200)',
              borderRadius: 'var(--r-md)',
              marginBottom: '1rem',
              fontSize: '0.8125rem',
              color: 'var(--blue-900)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} color="var(--blue-600)" />
              <span>
                <strong>{enrolledStudents.length} Students</strong> enrolled in Sem {activeClass?.semester}-{activeClass?.division}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--blue-600)', fontWeight: 600 }}>
              Will receive instant alert
            </span>
          </div>

          {/* Date with Weekend Shortcuts */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Lecture Date</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={() => setDate(getNextSaturday(0))}
                >
                  This Saturday
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={() => setDate(getNextSaturday(1))}
                >
                  Next Saturday
                </button>
              </div>
            </div>
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Time & Room Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} /> Start Time
              </label>
              <select className="form-select" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                <option value="08:30 AM">08:30 AM</option>
                <option value="09:30 AM">09:30 AM</option>
                <option value="10:00 AM">10:00 AM</option>
                <option value="11:30 AM">11:30 AM</option>
                <option value="01:30 PM">01:30 PM</option>
                <option value="02:00 PM">02:00 PM</option>
                <option value="03:30 PM">03:30 PM</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} /> End Time
              </label>
              <select className="form-select" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                <option value="10:00 AM">10:00 AM</option>
                <option value="11:00 AM">11:00 AM</option>
                <option value="11:30 AM">11:30 AM</option>
                <option value="01:00 PM">01:00 PM</option>
                <option value="03:00 PM">03:00 PM</option>
                <option value="03:30 PM">03:30 PM</option>
                <option value="05:00 PM">05:00 PM</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> Classroom
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Lab 301"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Syllabus Topic Input */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <BookOpen size={12} color="var(--blue-600)" /> Syllabus Topic to be Covered
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Advanced Graph Traversals & Shortest Path (Dijkstra)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
            />
          </div>

          {/* Reason Input */}
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Reason / Academic Purpose</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Compensatory lecture for missed session on Sept 12"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* Modal Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <CheckCircle2 size={14} /> Schedule Extra Class
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
