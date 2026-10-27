import React, { useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { AcademicEventType } from '../../types';
import {
  Calendar, X, Plus, Trash2, Printer, Search,
  AlertCircle, Sparkles, GraduationCap, PartyPopper, CheckCircle2,
  Clock, } from 'lucide-react';

interface AcademicCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AcademicCalendarModal: React.FC<AcademicCalendarModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentRole,
    academicEvents,
    addAcademicEvent,
    removeAcademicEvent,
    extraClasses,
    classes,
    subjects,
  } = useAttendance();

  const [activeFilter, setActiveFilter] = useState<'ALL' | AcademicEventType | 'EXTRA'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // Form state for adding new academic event
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<AcademicEventType>('HOLIDAY');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAffectsAttendance, setNewAffectsAttendance] = useState(true);
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const isAdmin = currentRole === 'ADMIN';

  // Sort events chronologically
  const sortedEvents = [...academicEvents].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  const filteredEvents = sortedEvents.filter((ev) => {
    const matchesType = activeFilter === 'ALL' || ev.type === activeFilter;
    const matchesSearch =
      ev.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ev.description && ev.description.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newTitle.trim()) {
      setFormError('Please provide an event title.');
      return;
    }
    if (!newStartDate) {
      setFormError('Please choose a start date.');
      return;
    }

    await addAcademicEvent({
      title: newTitle.trim(),
      type: newType,
      start_date: newStartDate,
      end_date: newEndDate || newStartDate,
      description: newDescription.trim() || undefined,
      affects_attendance: newAffectsAttendance,
      created_by: isAdmin ? 'Office of the Principal' : 'Academic Department',
    });

    setNewTitle('');
    setNewStartDate('');
    setNewEndDate('');
    setNewDescription('');
    setNewAffectsAttendance(true);
    setIsAddFormOpen(false);
  };

  const getTypeBadge = (type: AcademicEventType) => {
    switch (type) {
      case 'HOLIDAY':
        return {
          label: 'Public Holiday',
          bg: 'var(--red-50)',
          color: 'var(--red-600)',
          border: 'var(--red-200)',
          icon: <AlertCircle size={12} />,
        };
      case 'EXAM_WEEK':
        return {
          label: 'Exam Period',
          bg: 'var(--blue-50)',
          color: 'var(--blue-600)',
          border: 'var(--blue-200)',
          icon: <GraduationCap size={12} />,
        };
      case 'VACATION':
        return {
          label: 'Semester Break',
          bg: 'var(--green-50)',
          color: 'var(--green-600)',
          border: 'var(--green-200)',
          icon: <PartyPopper size={12} />,
        };
      case 'FESTIVAL':
        return {
          label: 'College Fest',
          bg: 'var(--purple-50, #f3e8ff)',
          color: 'var(--purple-700, #7e22ce)',
          border: 'var(--purple-200, #e9d5ff)',
          icon: <Sparkles size={12} />,
        };
      case 'ACADEMIC_DEADLINE':
        return {
          label: 'Important Deadline',
          bg: 'var(--amber-50)',
          color: 'var(--amber-700)',
          border: 'var(--amber-200)',
          icon: <Clock size={12} />,
        };
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--gray-200)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--r-md)',
                background: 'var(--blue-50)',
                border: '1px solid var(--blue-200)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--blue-600)',
              }}
            >
              <Calendar size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--gray-900)' }}>
                Academic Calendar &amp; Holidays
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: 2 }}>
                Academic Year 2025–26 · Official Schedule of Examinations, Holidays &amp; Semester Breaks
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint} title="Print Calendar Schedule">
              <Printer size={13} /> Print
            </button>
            {isAdmin && (
              <button
                className={`btn btn-sm ${isAddFormOpen ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              >
                {isAddFormOpen ? <X size={13} /> : <Plus size={13} />}
                {isAddFormOpen ? 'Cancel' : 'Add Event / Holiday'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Summary Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Public Holidays</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--red-600)', marginTop: 2 }}>
              {academicEvents.filter((e) => e.type === 'HOLIDAY').length}
            </div>
          </div>
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Exam Weeks</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--blue-600)', marginTop: 2 }}>
              {academicEvents.filter((e) => e.type === 'EXAM_WEEK').length}
            </div>
          </div>
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Fests &amp; Breaks</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--purple-700, #7e22ce)', marginTop: 2 }}>
              {academicEvents.filter((e) => e.type === 'VACATION' || e.type === 'FESTIVAL').length}
            </div>
          </div>
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--r-md)', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Extra Classes</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--amber-600)', marginTop: 2 }}>
              {extraClasses.length}
            </div>
          </div>
        </div>

        {/* Admin Inline Form to Add Event */}
        {isAdmin && isAddFormOpen && (
          <form
            onSubmit={handleCreateEvent}
            style={{
              background: 'var(--gray-50)',
              border: '1px solid var(--blue-200)',
              borderRadius: 'var(--r-md)',
              padding: '1.25rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--blue-700)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Add New Academic Event or Holiday
            </div>

            {formError && (
              <div className="alert alert-danger" style={{ padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.8125rem' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Event Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Sardar Patel Jayanti or End-Term Lab Exams"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Event Category</label>
                <select
                  className="form-select"
                  value={newType}
                  onChange={(e) => {
                    const t = e.target.value as AcademicEventType;
                    setNewType(t);
                    setNewAffectsAttendance(t === 'HOLIDAY' || t === 'VACATION');
                  }}
                >
                  <option value="HOLIDAY">Public Holiday (Classes Closed)</option>
                  <option value="EXAM_WEEK">Examination Period</option>
                  <option value="VACATION">Vacation / Semester Break</option>
                  <option value="FESTIVAL">College Fest / Cultural Event</option>
                  <option value="ACADEMIC_DEADLINE">Academic Deadline</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={newStartDate}
                  onChange={(e) => {
                    setNewStartDate(e.target.value);
                    if (!newEndDate) setNewEndDate(e.target.value);
                  }}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">End Date (Optional for single day)</label>
                <input
                  type="date"
                  className="form-input"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--gray-800)', marginTop: '1.25rem' }}>
                  <input
                    type="checkbox"
                    checked={newAffectsAttendance}
                    onChange={(e) => setNewAffectsAttendance(e.target.checked)}
                  />
                  <span>Suspend Classes &amp; Attendance</span>
                </label>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '0.875rem' }}>
              <label className="form-label">Description / Official Circular Notes</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Details or university notification circular reference..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsAddFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                <CheckCircle2 size={13} /> Save Event to Calendar
              </button>
            </div>
          </form>
        )}

        {/* Filter and Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All Events' },
              { id: 'HOLIDAY', label: 'Holidays' },
              { id: 'EXAM_WEEK', label: 'Exam Weeks' },
              { id: 'VACATION', label: 'Breaks' },
              { id: 'FESTIVAL', label: 'Fests' },
              { id: 'EXTRA', label: 'Extra Classes' },
            ].map((f) => (
              <button
                key={f.id}
                className={`btn btn-xs ${activeFilter === f.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveFilter(f.id as any)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', width: 220 }}>
            <Search size={13} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
            <input
              type="text"
              className="form-input form-input-sm"
              style={{ paddingLeft: '1.75rem' }}
              placeholder="Search schedule..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Extra Classes Section if Filtered or ALL */}
        {(activeFilter === 'ALL' || activeFilter === 'EXTRA') && extraClasses.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--amber-700)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Scheduled Compensatory &amp; Extra Lectures ({extraClasses.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {extraClasses.map((ex) => {
                const cls = classes.find((c) => c.id === ex.class_id);
                const sub = subjects.find((s) => s.id === cls?.subject_id);
                const d = new Date(ex.date + 'T00:00:00');
                return (
                  <div
                    key={ex.id}
                    style={{
                      border: '1px solid var(--amber-200)',
                      background: 'var(--amber-50)',
                      borderRadius: 'var(--r-md)',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--gray-900)' }}>
                          {sub?.name || 'Class'}
                        </span>
                        <span style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--r-sm)', background: 'var(--white)', border: '1px solid var(--amber-300)', color: 'var(--amber-800)', fontWeight: 700 }}>
                          EXTRA CLASS
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                          Sem {cls?.semester} Div {cls?.division}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: 3 }}>
                        <strong>{d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong> · {ex.start_time}–{ex.end_time} · {ex.room}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--blue-700)', marginTop: 2 }}>
                        📖 Topic: {ex.topic} <em>({ex.reason})</em>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Academic Calendar Events List */}
        {activeFilter !== 'EXTRA' && (
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gray-700)', marginBottom: '0.625rem' }}>
              Institutional Calendar Schedule ({filteredEvents.length})
            </div>

            {filteredEvents.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--gray-400)', fontSize: '0.875rem', background: 'var(--gray-50)', borderRadius: 'var(--r-md)' }}>
                No events found matching current filter.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {filteredEvents.map((ev) => {
                  const badge = getTypeBadge(ev.type);
                  const startD = new Date(ev.start_date + 'T00:00:00');
                  const endD = new Date(ev.end_date + 'T00:00:00');
                  const isMultiDay = ev.start_date !== ev.end_date;

                  return (
                    <div
                      key={ev.id}
                      style={{
                        border: `1px solid ${ev.affects_attendance ? 'var(--red-200)' : 'var(--gray-200)'}`,
                        borderRadius: 'var(--r-md)',
                        padding: '0.875rem 1rem',
                        background: ev.affects_attendance ? 'var(--red-50)' : 'var(--white)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                        {/* Date Block */}
                        <div
                          style={{
                            minWidth: 64,
                            textAlign: 'center',
                            background: 'var(--white)',
                            border: '1px solid var(--gray-200)',
                            borderRadius: 'var(--r-md)',
                            padding: '0.375rem 0.5rem',
                          }}
                        >
                          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--blue-600)', textTransform: 'uppercase' }}>
                            {startD.toLocaleDateString('en-IN', { month: 'short' })}
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--gray-900)', lineHeight: 1.1 }}>
                            {startD.getDate()}
                          </div>
                          {isMultiDay && (
                            <div style={{ fontSize: '0.625rem', color: 'var(--gray-400)', marginTop: 2 }}>
                              to {endD.getDate()} {endD.toLocaleDateString('en-IN', { month: 'short' })}
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.9375rem', color: 'var(--gray-900)' }}>
                              {ev.title}
                            </span>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.6875rem',
                                fontWeight: 700,
                                padding: '0.125rem 0.45rem',
                                borderRadius: 'var(--r-sm)',
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                            {ev.affects_attendance && (
                              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--red-700)', background: 'var(--red-100)', padding: '0.1rem 0.4rem', borderRadius: 'var(--r-xs)' }}>
                                Classes Suspended
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 3 }}>
                            {isMultiDay ? (
                              <span>
                                {startD.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} – {endD.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            ) : (
                              <span>
                                {startD.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                            <span style={{ margin: '0 6px' }}>·</span>
                            <span>Issued by: {ev.created_by}</span>
                          </div>

                          {ev.description && (
                            <p style={{ fontSize: '0.8125rem', color: 'var(--gray-600)', margin: '0.375rem 0 0', lineHeight: 1.4 }}>
                              {ev.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Admin Delete Action */}
                      {isAdmin && (
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ color: 'var(--red-600)' }}
                          title="Delete from calendar"
                          onClick={() => {
                            if (window.confirm(`Remove "${ev.title}" from the academic calendar?`)) {
                              removeAcademicEvent(ev.id);
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--gray-200)' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
