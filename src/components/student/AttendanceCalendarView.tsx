import React, { useState } from 'react';
import { AttendanceRecord, CollegeClass, Subject } from '../../types';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Badge } from '../common/Badge';

interface AttendanceCalendarViewProps {
  records: AttendanceRecord[];
  classes: CollegeClass[];
  subjects: Subject[];
}

export const AttendanceCalendarView: React.FC<AttendanceCalendarViewProps> = ({
  records,
  classes,
  subjects,
}) => {
  // Current view month (default September 2026 based on seed data)
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(8); // 8 is September (0-indexed)
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>('2026-09-15');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Days in current month
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Map records by date string: "YYYY-MM-DD"
  const recordsByDate: Record<string, AttendanceRecord[]> = {};
  records.forEach((r) => {
    const dStr = (r.lecture_at ?? r.marked_at).slice(0, 10);
    if (!recordsByDate[dStr]) recordsByDate[dStr] = [];
    recordsByDate[dStr].push(r);
  });

  // Selected date details
  const selectedRecords = selectedDateStr ? recordsByDate[selectedDateStr] || [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Month navigation header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--gray-900)' }}>
            {monthNames[currentMonth]} {currentYear}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
            Select any day to review lecture attendance
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={handlePrevMonth} title="Previous Month">
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleNextMonth} title="Next Month">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.375rem',
          background: 'var(--gray-50)',
          padding: '0.75rem',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--gray-200)',
        }}
      >
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
          <div
            key={day}
            style={{
              textAlign: 'center',
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: i === 0 ? 'var(--red-400)' : 'var(--gray-500)',
              paddingBottom: '0.375rem',
            }}
          >
            {day}
          </div>
        ))}

        {/* Empty cells before month start */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} style={{ minHeight: 64, opacity: 0.2 }} />
        ))}

        {/* Month Day Cells */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const dayNum = i + 1;
          const monthStr = String(currentMonth + 1).padStart(2, '0');
          const dayStr = String(dayNum).padStart(2, '0');
          const dateKey = `${currentYear}-${monthStr}-${dayStr}`;

          const dayRecords = recordsByDate[dateKey] || [];
          const isSelected = selectedDateStr === dateKey;
          const isSunday = new Date(currentYear, currentMonth, dayNum).getDay() === 0;

          const totalLectures = dayRecords.length;
          const presentCount = dayRecords.filter(
            (r) => r.status === 'PRESENT' || r.status === 'LATE'
          ).length;
          const absentCount = dayRecords.filter((r) => r.status === 'ABSENT').length;

          let cellBg = 'var(--white)';
          let cellBorder = isSelected ? '2px solid var(--blue-600)' : '1px solid var(--gray-200)';
          let badgeColor = 'var(--gray-400)';

          if (totalLectures > 0) {
            if (absentCount === 0) {
              badgeColor = 'var(--green-600)';
              if (isSelected) cellBg = 'var(--green-50)';
            } else if (presentCount === 0) {
              badgeColor = 'var(--red-600)';
              if (isSelected) cellBg = 'var(--red-50)';
            } else {
              badgeColor = 'var(--amber-600)';
              if (isSelected) cellBg = 'var(--amber-50)';
            }
          }

          return (
            <div
              key={dateKey}
              onClick={() => setSelectedDateStr(dateKey)}
              style={{
                minHeight: 66,
                padding: '0.375rem',
                borderRadius: 'var(--r-sm)',
                background: cellBg,
                border: cellBorder,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 800 : 600,
                    color: isSunday ? 'var(--red-400)' : 'var(--gray-800)',
                  }}
                >
                  {dayNum}
                </span>
                {totalLectures > 0 && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: badgeColor,
                    }}
                  />
                )}
              </div>

              {totalLectures > 0 ? (
                <div style={{ marginTop: 'auto' }}>
                  <div
                    style={{
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      color: badgeColor,
                      lineHeight: 1.2,
                    }}
                  >
                    {presentCount}/{totalLectures} Pres
                  </div>
                  {absentCount > 0 && (
                    <div style={{ fontSize: '0.5625rem', color: 'var(--red-600)', fontWeight: 600 }}>
                      {absentCount} missed
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: '0.625rem', color: 'var(--gray-300)', marginTop: 'auto' }}>
                  {isSunday ? 'Holiday' : 'No class'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Date Breakdown Panel */}
      {selectedDateStr && (
        <div
          style={{
            padding: '1rem',
            background: 'var(--white)',
            border: '1px solid var(--gray-200)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={15} color="var(--blue-600)" />
              <strong style={{ fontSize: '0.875rem', color: 'var(--gray-900)' }}>
                Lectures on {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
              {selectedRecords.length} {selectedRecords.length === 1 ? 'class recorded' : 'classes recorded'}
            </span>
          </div>

          {selectedRecords.length === 0 ? (
            <div style={{ fontSize: '0.8125rem', color: 'var(--gray-400)', padding: '0.5rem 0' }}>
              No official attendance records logged on this date.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {selectedRecords.map((rec) => {
                const cls = classes.find((c) => c.id === rec.class_id);
                const sub = subjects.find((s) => s.id === cls?.subject_id);
                const isPres = rec.status === 'PRESENT' || rec.status === 'LATE';

                return (
                  <div
                    key={rec.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--r-sm)',
                      background: isPres ? 'var(--gray-50)' : 'var(--red-50)',
                      border: `1px solid ${isPres ? 'var(--gray-200)' : 'var(--red-200)'}`,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--gray-900)' }}>
                        {sub?.name || 'Class Lecture'}{' '}
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', fontWeight: 400 }}>
                          ({sub?.code})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>
                        Room: {cls?.room || 'Lecture Hall'} · Time: {cls?.schedule_time || 'Regular Schedule'} · Method: {rec.method}
                      </div>
                    </div>
                    <div>
                      <Badge status={rec.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
