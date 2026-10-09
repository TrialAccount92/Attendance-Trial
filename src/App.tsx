import React from 'react';
import { AttendanceProvider, useAttendance } from './context/AttendanceContext';
import { useAppRouter } from './utils/router';
import { LoginPage } from './pages/LoginPage';
import { StudentPage } from './pages/StudentPage';
import { FacultyPage } from './pages/FacultyPage';
import { AdminPage } from './pages/AdminPage';

const AppContent: React.FC = () => {
  const { currentRoute, navigateTo } = useAppRouter();
  const { isAuthenticated, currentRole } = useAttendance();

  // If not authenticated or on login route, show login page
  if (!isAuthenticated || currentRoute === 'LOGIN') {
    return <LoginPage onNavigate={navigateTo} />;
  }

  switch (currentRoute) {
    case 'STUDENT':
      return <StudentPage onNavigate={navigateTo} />;
    case 'FACULTY':
      return <FacultyPage onNavigate={navigateTo} />;
    case 'ADMIN':
      return <AdminPage onNavigate={navigateTo} />;
    case 'GATEWAY':
    default:
      if (currentRole === 'STUDENT') return <StudentPage onNavigate={navigateTo} />;
      if (currentRole === 'FACULTY') return <FacultyPage onNavigate={navigateTo} />;
      if (currentRole === 'ADMIN') return <AdminPage onNavigate={navigateTo} />;
      return <LoginPage onNavigate={navigateTo} />;
  }
};

export default function App() {
  return (
    <AttendanceProvider>
      <AppContent />
    </AttendanceProvider>
  );
}
