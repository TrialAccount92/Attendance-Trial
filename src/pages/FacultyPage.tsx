import React, { useState } from 'react';
import { useAttendance } from '../context/AttendanceContext';
import { Navbar } from '../components/layout/Navbar';
import { FacultyDashboard } from '../components/faculty/FacultyDashboard';
import { ActiveSessionModal } from '../components/faculty/ActiveSessionModal';
import { AppRoute } from '../utils/router';

interface FacultyPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const FacultyPage: React.FC<FacultyPageProps> = ({ onNavigate }) => {
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const { startAttendanceSession } = useAttendance();

  return (
    <div className="app-container">
      <Navbar
        currentRoute="FACULTY"
        onNavigate={onNavigate}
        onOpenLiveSession={() => setIsLiveModalOpen(true)}
      />

      <main className="main-content">
        <FacultyDashboard />
      </main>

      <ActiveSessionModal
        isOpen={isLiveModalOpen}
        onClose={() => setIsLiveModalOpen(false)}
        onStart={async (classId, topic, options) => {
          await startAttendanceSession(classId, topic, options);
        }}
      />

      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '1rem 1.5rem',
          background: 'var(--bg-white)',
        }}
      >
        <div
          style={{
            maxWidth: 1360,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>AttendPulse Faculty Console</strong> — Face Recognition &amp; Rotating QR Sessions
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-disabled)' }}>
            <span>Leave &amp; Correction Review</span>
            <span>Dispute Workflow</span>
            <span>CSV Ledger Export</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
