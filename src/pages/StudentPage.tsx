import React from 'react';
import { Navbar } from '../components/layout/Navbar';
import { StudentDashboard } from '../components/student/StudentDashboard';
import { AppRoute } from '../utils/router';

interface StudentPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const StudentPage: React.FC<StudentPageProps> = ({ onNavigate }) => {

  return (
    <div className="app-container">
      <Navbar currentRoute="STUDENT" onNavigate={onNavigate} />

      <main className="main-content">
        <StudentDashboard />
      </main>

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
            <strong style={{ color: 'var(--text-secondary)' }}>AttendPulse Student Portal</strong> — 75% Statutory Compliance &amp; Real-Time Verification
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-disabled)' }}>
            <span>30s Rolling QR</span>
            <span>Hall Ticket Clearance</span>
            <span>Leave Requests</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
