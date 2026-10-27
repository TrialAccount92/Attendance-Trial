import { useState, useEffect, useCallback } from 'react';

export type AppRoute = 'LOGIN' | 'STUDENT' | 'FACULTY' | 'ADMIN';

export function parseCurrentRoute(): AppRoute {
  const hash = (window.location.hash || '').toLowerCase();
  if (hash.startsWith('#/login') || hash === '#login') return 'LOGIN';
  if (hash.startsWith('#/student') || hash === '#student') return 'STUDENT';
  if (hash.startsWith('#/faculty') || hash === '#faculty') return 'FACULTY';
  if (hash.startsWith('#/admin') || hash === '#admin') return 'ADMIN';

  const path = (window.location.pathname || '').toLowerCase();
  if (path.endsWith('/login')) return 'LOGIN';
  if (path.endsWith('/student')) return 'STUDENT';
  if (path.endsWith('/faculty')) return 'FACULTY';
  if (path.endsWith('/admin')) return 'ADMIN';

  return 'LOGIN';
}

export function routeToHash(route: AppRoute): string {
  switch (route) {
    case 'LOGIN':
      return '#/login';
    case 'STUDENT':
      return '#/student';
    case 'FACULTY':
      return '#/faculty';
    case 'ADMIN':
      return '#/admin';
    default:
      return '#/login';
  }
}

export function useAppRouter() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => parseCurrentRoute());

  useEffect(() => {
    const handleLocationChange = () => {
      const parsed = parseCurrentRoute();
      setCurrentRoute(parsed);
      updateDocTitle(parsed);
    };

    updateDocTitle(currentRoute);

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, [currentRoute]);

  const navigateTo = useCallback((route: AppRoute) => {
    const targetHash = routeToHash(route);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
    setCurrentRoute(route);
    updateDocTitle(route);
  }, []);

  return { currentRoute, navigateTo };
}

function updateDocTitle(route: AppRoute) {
  switch (route) {
    case 'STUDENT':
      document.title = 'Student Portal | AttendPulse';
      break;
    case 'FACULTY':
      document.title = 'Faculty Console | AttendPulse';
      break;
    case 'ADMIN':
      document.title = 'Administrative Control | AttendPulse';
      break;
    case 'LOGIN':
      document.title = 'Institutional Portal Login | AttendPulse';
      break;
    default:
      document.title = 'AttendPulse — Multi-Role College Attendance System';
      break;
  }
}
