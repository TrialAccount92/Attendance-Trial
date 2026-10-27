import React, { useEffect } from 'react';
import { AttendanceProvider, useAttendance } from './context/AttendanceContext';
import { AppRoute, useAppRouter } from './utils/router';
import { LoginPage } from './pages/LoginPage';
import { StudentPage } from './pages/StudentPage';
import { FacultyPage } from './pages/FacultyPage';
import { AdminPage } from './pages/AdminPage';
import { ChangePasswordModal } from './components/common/ChangePasswordModal';

const AppContent: React.FC = () => {
  const { currentRoute, navigateTo } = useAppRouter();
  const { authStatus, currentRole, currentUser } = useAttendance();

  // Each account only ever sees its own portal: a student typing #/admin lands on #/student.
  useEffect(() => {
    if (authStatus === 'authenticated' && currentRoute !== currentRole) {
      navigateTo(currentRole as AppRoute);
    }
    if (authStatus === 'anonymous' && currentRoute !== 'LOGIN') {
      navigateTo('LOGIN');
    }
  }, [authStatus, currentRole, currentRoute, navigateTo]);

  if (authStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return <LoginPage onNavigate={navigateTo} />;
  }

  return (
    <>
      {currentRole === 'STUDENT' && <StudentPage onNavigate={navigateTo} />}
      {currentRole === 'FACULTY' && <FacultyPage onNavigate={navigateTo} />}
      {currentRole === 'ADMIN' && <AdminPage onNavigate={navigateTo} />}
      {currentUser.must_change_password && <ChangePasswordModal required onClose={() => undefined} />}
    </>
  );
};

export default function App() {
  return (
    <AttendanceProvider>
      <AppContent />
    </AttendanceProvider>
  );
}
