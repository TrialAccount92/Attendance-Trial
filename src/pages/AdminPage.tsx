import React from 'react';
import { Navbar } from '../components/layout/Navbar';
import { AdminDashboard } from '../components/admin/AdminDashboard';
import { AppRoute } from '../utils/router';

interface AdminPageProps {
  onNavigate: (route: AppRoute) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate }) => {

  return (
    <div className="app-container">
      <Navbar currentRoute="ADMIN" onNavigate={onNavigate} />

      <main className="main-content">
        <AdminDashboard />
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
            <strong style={{ color: 'var(--text-secondary)' }}>AttendPulse Institutional Control</strong> — Academic Governance &amp; College Analytics
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-disabled)' }}>
            <span>Department Heatmaps</span>
            <span>Allotment Engine</span>
            <span>Curriculum Management</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
