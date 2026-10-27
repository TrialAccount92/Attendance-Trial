/**
 * App-wide data store backed by the AttendPulse API.
 *
 * GET /api/state returns everything the signed-in user may see (students only
 * get their own records; faculty get their classes; admins get everything).
 * Every action calls the API and then refreshes that snapshot, so the server is
 * the only source of truth. Actions return Promises and throw ApiError on
 * failure; errors nobody catches are shown as a toast.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AcademicEvent,
  Announcement,
  AttendanceRecord,
  AttendanceSession,
  AttendanceStatus,
  CollegeClass,
  CorrectionRequest,
  Department,
  Enrollment,
  ExtraClassSchedule,
  Faculty,
  FaceFrame,
  FaceIdentity,
  LeaveApplication,
  LeaveType,
  OverallAttendanceSummary,
  SessionQR,
  Student,
  Subject,
  SubjectAttendanceStat,
  User,
  UserRole,
} from '../types';
import { api, ApiError, errorMessage } from '../api/client';
import { calculateAttendanceMetrics } from '../utils/attendanceCalc';

interface ServerState {
  me: { user: User; student_id: string | null; faculty_id: string | null };
  users: User[];
  departments: Department[];
  subjects: Subject[];
  faculty: Faculty[];
  students: Student[];
  classes: CollegeClass[];
  enrollments: Enrollment[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  correction_requests: CorrectionRequest[];
  leave_applications: LeaveApplication[];
  academic_events: AcademicEvent[];
  extra_classes: ExtraClassSchedule[];
  announcements: Announcement[];
  settings: { min_attendance_threshold: number };
}

export interface NewStudentInput {
  name: string;
  roll_number: string;
  enrollment_number?: string;
  email?: string;
  semester?: number;
  division?: string;
  department_id?: string;
}

export interface IssuedCredential {
  name: string;
  enrollment_number: string;
  email: string;
  temp_password: string;
}

export interface StartSessionOptions {
  mode?: 'QR' | 'FACE';
  requireLocation?: boolean;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
}

export interface IdentifyResult {
  enrolled_faces: number;
  enrolled_students: number;
  matches: Array<FaceIdentity | null>;
}

export interface FaceMarkResult {
  status: 'MARKED' | 'ALREADY_MARKED' | 'NEED_LIVENESS' | 'NEED_FRONTAL';
  message: string;
  student_name?: string;
  confidence?: number;
  yaw_range?: number;
}

export interface Coords {
  latitude: number;
  longitude: number;
}

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AttendanceContextType {
  // Auth
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  currentUser: User;
  currentRole: UserRole;
  currentStudent: Student | null;
  currentFaculty: Faculty | null;
  login: (identifier: string, password: string, role?: UserRole) => Promise<UserRole>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;

  // Collections (already scoped to what this user may see)
  users: User[];
  departments: Department[];
  subjects: Subject[];
  facultyList: Faculty[];
  students: Student[];
  classes: CollegeClass[];
  enrollments: Enrollment[];
  sessions: AttendanceSession[];
  activeSession: AttendanceSession | null;
  records: AttendanceRecord[];
  correctionRequests: CorrectionRequest[];
  leaveApplications: LeaveApplication[];
  academicEvents: AcademicEvent[];
  extraClasses: ExtraClassSchedule[];
  announcements: Announcement[];

  // Settings
  minAttendanceThreshold: number;
  setMinAttendanceThreshold: (val: number) => void;

  // Sessions & marking
  startAttendanceSession: (classId: string, topic?: string, options?: StartSessionOptions) => Promise<AttendanceSession>;
  closeAttendanceSession: (sessionId: string) => Promise<{ present: number; marked_absent: number }>;
  getSessionQR: (sessionId: string) => Promise<SessionQR>;
  markAttendanceViaQR: (qrString: string, coords?: Coords | null) => Promise<{ success: boolean; message: string; subject?: string }>;
  /** Ask the server who these (front-facing) face descriptors belong to. */
  identifyFaces: (classId: string, descriptors: number[][]) => Promise<IdentifyResult>;
  /** Send a student's recent face frames; the server verifies identity + liveness before marking. */
  markAttendanceViaFace: (sessionId: string, studentId: string, frames: FaceFrame[]) => Promise<FaceMarkResult>;
  registerStudentFace: (studentId: string, frames: FaceFrame[], photoDataUrl?: string) => Promise<number>;
  removeStudentFace: (studentId: string) => Promise<void>;
  manualUpdateAttendance: (sessionId: string, studentId: string, classId: string, status: AttendanceStatus) => Promise<void>;
  markBatchAttendance: (
    classId: string,
    date: string,
    topic: string,
    roster: Array<{ studentId: string; status: AttendanceStatus }>
  ) => Promise<{ recordedCount: number }>;

  // Requests
  submitCorrectionRequest: (sessionId: string, reason: string) => Promise<void>;
  reviewCorrectionRequest: (requestId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => Promise<void>;
  applyLeave: (data: {
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason: string;
    document_name?: string;
  }) => Promise<LeaveApplication>;
  reviewLeave: (leaveId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => Promise<void>;
  addAnnouncement: (title: string, content: string, category: Announcement['category']) => Promise<void>;
  dispatchNotices: (
    studentIds: string[],
    subject: string,
    message: string
  ) => Promise<{ sent: number; queued: number; failed: number; email_configured: boolean }>;

  // Classes & timetable
  addClass: (newClass: Omit<CollegeClass, 'id'>) => Promise<CollegeClass>;
  updateClass: (classId: string, updates: Partial<Omit<CollegeClass, 'id'>>) => Promise<void>;
  removeClass: (classId: string) => Promise<void>;
  bulkImportClasses: (
    facultyId: string,
    newClassesList: Array<Omit<CollegeClass, 'id'>>,
    replaceExisting?: boolean
  ) => Promise<{ count: number }>;
  allotFacultyToClass: (classId: string, facultyId: string) => Promise<void>;

  // Students
  addStudent: (data: NewStudentInput) => Promise<{ student: Student; tempPassword: string }>;
  importStudents: (list: NewStudentInput[]) => Promise<{ added: number; updated: number; credentials: IssuedCredential[] }>;
  removeStudent: (studentId: string) => Promise<void>;
  resetStudentPassword: (studentId: string) => Promise<string>;
  getStudentEnrolledClassIds: (studentId: string) => string[];
  updateStudentEnrollments: (studentId: string, classIds: string[]) => Promise<void>;

  // Faculty
  addFaculty: (data: {
    name: string;
    email: string;
    department_id: string;
    designation?: string;
    employee_id?: string;
  }) => Promise<{ faculty: Faculty; tempPassword: string }>;
  removeFaculty: (facultyId: string) => Promise<void>;
  updateFaculty: (facultyId: string, updates: Partial<Omit<Faculty, 'id' | 'user_id'>>) => Promise<void>;

  // Subjects
  addSubject: (data: { name: string; code: string; credits: number; department_id: string; semester?: number }) => Promise<Subject>;
  updateSubject: (subjectId: string, updates: Partial<Omit<Subject, 'id'>>) => Promise<void>;
  removeSubject: (subjectId: string) => Promise<void>;

  // Calendar & extra classes
  addAcademicEvent: (event: Omit<AcademicEvent, 'id'>) => Promise<void>;
  removeAcademicEvent: (id: string) => Promise<void>;
  scheduleExtraClass: (extra: Omit<ExtraClassSchedule, 'id' | 'is_conducted' | 'faculty_id'> & { faculty_id?: string }) => Promise<void>;
  cancelExtraClass: (id: string) => Promise<void>;
  markExtraClassConducted: (id: string) => Promise<void>;

  // Derived helpers
  getStudentStats: (studentId: string) => { subjectStats: SubjectAttendanceStat[]; overall: OverallAttendanceSummary };
  getClassEnrolledStudents: (classId: string) => Student[];
  getSessionAttendanceMap: (sessionId: string) => Record<string, AttendanceRecord>;
  resetToDefaultData: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const EMPTY_USER: User = { id: '', name: '', email: '', role: 'STUDENT', created_at: '' };

const sortByStartDesc = (a: AttendanceSession, b: AttendanceSession) => b.start_time.localeCompare(a.start_time);

// ── Toasts for errors nobody handled ─────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
}

const ToastHost: React.FC<{ toasts: Toast[]; dismiss: (id: number) => void }> = ({ toasts, dismiss }) => (
  <div
    aria-live="assertive"
    style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      left: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 8,
      zIndex: 10000,
      pointerEvents: 'none',
    }}
  >
    {toasts.map((t) => (
      <div
        key={t.id}
        role="alert"
        onClick={() => dismiss(t.id)}
        style={{
          pointerEvents: 'auto',
          maxWidth: 420,
          background: '#1e293b',
          color: '#fff',
          borderLeft: '4px solid #ef4444',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          fontSize: '0.875rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          cursor: 'pointer',
        }}
      >
        {t.message}
      </div>
    ))}
  </div>
);

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [data, setData] = useState<ServerState | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const thresholdTimer = useRef<number | undefined>(undefined);
  const authStatusRef = useRef(authStatus);
  useEffect(() => {
    authStatusRef.current = authStatus;
  }, [authStatus]);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  // Any rejected API promise that a component didn't catch becomes a toast.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof ApiError) {
        event.preventDefault();
        showToast(event.reason.message);
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, [showToast]);

  const refresh = useCallback(async () => {
    try {
      const next = await api<ServerState>('GET', '/api/state');
      next.sessions.sort(sortByStartDesc);
      setData(next);
      setAuthStatus('authenticated');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setData(null);
        setAuthStatus('anonymous');
        return;
      }
      if (authStatusRef.current === 'loading') setAuthStatus('anonymous');
      throw err;
    }
  }, []);

  // Restore an existing session on load.
  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const activeSession = useMemo(
    () => data?.sessions.find((s) => s.status === 'ACTIVE') ?? null,
    [data]
  );

  // Keep data fresh: fast while a lecture is live (QR scans arrive), slow otherwise.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const interval = activeSession ? 4000 : 30000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh().catch(() => undefined);
    }, interval);
    return () => window.clearInterval(timer);
  }, [authStatus, activeSession, refresh]);

  /** Call the API, then reload state. */
  const mutate = useCallback(
    async <T,>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> => {
      const result = await api<T>(method, path, body);
      await refresh().catch(() => undefined);
      return result;
    },
    [refresh]
  );

  // ── Auth ──────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (identifier: string, password: string, role?: UserRole): Promise<UserRole> => {
      const res = await api<{ user: User }>('POST', '/api/auth/login', { identifier, password, role });
      await refresh();
      return res.user.role;
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await api('POST', '/api/auth/logout');
    } finally {
      setData(null);
      setAuthStatus('anonymous');
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await mutate('POST', '/api/auth/change-password', { current_password: currentPassword, new_password: newPassword });
    },
    [mutate]
  );

  // ── Derived identity ──────────────────────────────────────────────────────

  const currentUser = data?.me.user ?? EMPTY_USER;
  const currentRole: UserRole = currentUser.role;
  const students = useMemo(() => data?.students ?? [], [data]);
  const facultyList = useMemo(() => data?.faculty ?? [], [data]);
  const currentStudent = useMemo(
    () => (data?.me.student_id ? students.find((s) => s.id === data.me.student_id) ?? null : null),
    [data, students]
  );
  const currentFaculty = useMemo(
    () => (data?.me.faculty_id ? facultyList.find((f) => f.id === data.me.faculty_id) ?? null : null),
    [data, facultyList]
  );

  const enrollments = useMemo(() => data?.enrollments ?? [], [data]);
  const records = useMemo(() => data?.records ?? [], [data]);
  const classes = useMemo(() => data?.classes ?? [], [data]);
  const subjects = useMemo(() => data?.subjects ?? [], [data]);
  const minAttendanceThreshold = thresholdDraft ?? data?.settings.min_attendance_threshold ?? 0.75;

  // ── Sessions & marking ────────────────────────────────────────────────────

  const startAttendanceSession = useCallback(
    (classId: string, topic?: string, options?: StartSessionOptions) =>
      mutate<AttendanceSession>('POST', '/api/sessions', {
        class_id: classId,
        topic: topic?.trim() || null,
        mode: options?.mode ?? 'QR',
        require_location: options?.requireLocation ?? false,
        latitude: options?.latitude ?? null,
        longitude: options?.longitude ?? null,
        radius_m: options?.radiusM ?? null,
      }),
    [mutate]
  );

  const closeAttendanceSession = useCallback(
    (sessionId: string) => mutate<{ present: number; marked_absent: number }>('POST', `/api/sessions/${sessionId}/close`),
    [mutate]
  );

  const getSessionQR = useCallback((sessionId: string) => api<SessionQR>('GET', `/api/sessions/${sessionId}/qr`), []);

  const markAttendanceViaQR = useCallback(
    async (qrString: string, coords?: Coords | null) => {
      try {
        const res = await mutate<{ success: boolean; message: string; subject?: string }>('POST', '/api/attendance/qr', {
          payload: qrString,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
        });
        return res;
      } catch (err) {
        return { success: false, message: errorMessage(err) };
      }
    },
    [mutate]
  );

  const identifyFaces = useCallback(
    (classId: string, descriptors: number[][]) =>
      api<IdentifyResult>('POST', `/api/classes/${classId}/identify`, { descriptors }),
    []
  );

  const markAttendanceViaFace = useCallback(
    async (sessionId: string, studentId: string, frames: FaceFrame[]) => {
      const res = await api<FaceMarkResult>('POST', `/api/sessions/${sessionId}/face-mark`, {
        student_id: studentId,
        frames,
      });
      if (res.status === 'MARKED') refresh().catch(() => undefined);
      return res;
    },
    [refresh]
  );

  const registerStudentFace = useCallback(
    async (studentId: string, frames: FaceFrame[], photoDataUrl?: string) => {
      const res = await mutate<{ sample_count: number }>('PUT', `/api/students/${studentId}/face`, {
        frames,
        photo: photoDataUrl ?? null,
      });
      return res.sample_count;
    },
    [mutate]
  );

  const removeStudentFace = useCallback(
    async (studentId: string) => {
      await mutate('DELETE', `/api/students/${studentId}/face`);
    },
    [mutate]
  );

  const manualUpdateAttendance = useCallback(
    async (sessionId: string, studentId: string, _classId: string, status: AttendanceStatus) => {
      await mutate('PUT', '/api/records', { session_id: sessionId, student_id: studentId, status });
    },
    [mutate]
  );

  const markBatchAttendance = useCallback(
    async (classId: string, date: string, topic: string, roster: Array<{ studentId: string; status: AttendanceStatus }>) => {
      const res = await mutate<{ recorded_count: number }>('POST', '/api/roll-call', {
        class_id: classId,
        date,
        topic,
        roster: roster.map((r) => ({ student_id: r.studentId, status: r.status })),
      });
      return { recordedCount: res.recorded_count };
    },
    [mutate]
  );

  // ── Requests ──────────────────────────────────────────────────────────────

  const submitCorrectionRequest = useCallback(
    async (sessionId: string, reason: string) => {
      await mutate('POST', '/api/corrections', { session_id: sessionId, reason });
    },
    [mutate]
  );

  const reviewCorrectionRequest = useCallback(
    async (requestId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => {
      await mutate('POST', `/api/corrections/${requestId}/review`, { status, comment: comment ?? null });
    },
    [mutate]
  );

  const applyLeave = useCallback(
    (leave: { leave_type: LeaveType; start_date: string; end_date: string; reason: string; document_name?: string }) =>
      mutate<LeaveApplication>('POST', '/api/leaves', leave),
    [mutate]
  );

  const reviewLeave = useCallback(
    async (leaveId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => {
      await mutate('POST', `/api/leaves/${leaveId}/review`, { status, comment: comment ?? null });
    },
    [mutate]
  );

  const addAnnouncement = useCallback(
    async (title: string, content: string, category: Announcement['category']) => {
      await mutate('POST', '/api/announcements', { title, content, category });
    },
    [mutate]
  );

  const dispatchNotices = useCallback(
    (studentIds: string[], subject: string, message: string) =>
      mutate<{ sent: number; queued: number; failed: number; email_configured: boolean }>('POST', '/api/notices/dispatch', {
        student_ids: studentIds,
        subject,
        message,
      }),
    [mutate]
  );

  // ── Classes ───────────────────────────────────────────────────────────────

  const addClass = useCallback((c: Omit<CollegeClass, 'id'>) => mutate<CollegeClass>('POST', '/api/classes', c), [mutate]);

  const updateClass = useCallback(
    async (classId: string, updates: Partial<Omit<CollegeClass, 'id'>>) => {
      await mutate('PATCH', `/api/classes/${classId}`, updates);
    },
    [mutate]
  );

  const removeClass = useCallback(
    async (classId: string) => {
      await mutate('DELETE', `/api/classes/${classId}`);
    },
    [mutate]
  );

  const bulkImportClasses = useCallback(
    (facultyId: string, list: Array<Omit<CollegeClass, 'id'>>, replaceExisting = false) =>
      mutate<{ count: number }>('POST', '/api/classes/bulk', {
        faculty_id: facultyId,
        classes: list.map((c) => ({ ...c, faculty_id: facultyId })),
        replace_existing: replaceExisting,
      }),
    [mutate]
  );

  const allotFacultyToClass = useCallback(
    (classId: string, facultyId: string) => updateClass(classId, { faculty_id: facultyId }),
    [updateClass]
  );

  // ── Students ──────────────────────────────────────────────────────────────

  const addStudent = useCallback(
    async (input: NewStudentInput) => {
      const res = await mutate<{ student: Student; temp_password: string }>('POST', '/api/students', {
        ...input,
        email: input.email?.trim() || null,
        enrollment_number: input.enrollment_number?.trim() || null,
      });
      return { student: res.student, tempPassword: res.temp_password };
    },
    [mutate]
  );

  const importStudents = useCallback(
    (list: NewStudentInput[]) =>
      mutate<{ added: number; updated: number; credentials: IssuedCredential[] }>('POST', '/api/students/import', {
        students: list.map((s) => ({
          ...s,
          email: s.email?.trim() || null,
          enrollment_number: s.enrollment_number?.trim() || null,
          semester: Number(s.semester) || 3,
          division: String(s.division || 'A'),
        })),
      }),
    [mutate]
  );

  const removeStudent = useCallback(
    async (studentId: string) => {
      await mutate('DELETE', `/api/students/${studentId}`);
    },
    [mutate]
  );

  const resetStudentPassword = useCallback(
    async (studentId: string) =>
      (await mutate<{ temp_password: string }>('POST', `/api/students/${studentId}/reset-password`)).temp_password,
    [mutate]
  );

  const getStudentEnrolledClassIds = useCallback(
    (studentId: string) => enrollments.filter((e) => e.student_id === studentId).map((e) => e.class_id),
    [enrollments]
  );

  const updateStudentEnrollments = useCallback(
    async (studentId: string, classIds: string[]) => {
      await mutate('PUT', `/api/students/${studentId}/enrollments`, { class_ids: classIds });
    },
    [mutate]
  );

  // ── Faculty ───────────────────────────────────────────────────────────────

  const addFaculty = useCallback(
    async (input: { name: string; email: string; department_id: string; designation?: string; employee_id?: string }) => {
      const res = await mutate<{ faculty: Faculty; temp_password: string }>('POST', '/api/faculty', {
        ...input,
        employee_id: input.employee_id?.trim() || null,
      });
      return { faculty: res.faculty, tempPassword: res.temp_password };
    },
    [mutate]
  );

  const removeFaculty = useCallback(
    async (facultyId: string) => {
      await mutate('DELETE', `/api/faculty/${facultyId}`);
    },
    [mutate]
  );

  const updateFaculty = useCallback(
    async (facultyId: string, updates: Partial<Omit<Faculty, 'id' | 'user_id'>>) => {
      await mutate('PATCH', `/api/faculty/${facultyId}`, updates);
    },
    [mutate]
  );

  // ── Subjects ──────────────────────────────────────────────────────────────

  const addSubject = useCallback(
    (s: { name: string; code: string; credits: number; department_id: string; semester?: number }) =>
      mutate<Subject>('POST', '/api/subjects', s),
    [mutate]
  );

  const updateSubject = useCallback(
    async (subjectId: string, updates: Partial<Omit<Subject, 'id'>>) => {
      await mutate('PATCH', `/api/subjects/${subjectId}`, updates);
    },
    [mutate]
  );

  const removeSubject = useCallback(
    async (subjectId: string) => {
      await mutate('DELETE', `/api/subjects/${subjectId}`);
    },
    [mutate]
  );

  // ── Calendar & extra classes ──────────────────────────────────────────────

  const addAcademicEvent = useCallback(
    async (ev: Omit<AcademicEvent, 'id'>) => {
      await mutate('POST', '/api/events', ev);
    },
    [mutate]
  );

  const removeAcademicEvent = useCallback(
    async (id: string) => {
      await mutate('DELETE', `/api/events/${id}`);
    },
    [mutate]
  );

  const scheduleExtraClass = useCallback(
    async (extra: Omit<ExtraClassSchedule, 'id' | 'is_conducted' | 'faculty_id'> & { faculty_id?: string }) => {
      const { faculty_id: _ignored, ...body } = extra;
      await mutate('POST', '/api/extra-classes', body);
    },
    [mutate]
  );

  const cancelExtraClass = useCallback(
    async (id: string) => {
      await mutate('DELETE', `/api/extra-classes/${id}`);
    },
    [mutate]
  );

  const markExtraClassConducted = useCallback(
    async (id: string) => {
      await mutate('POST', `/api/extra-classes/${id}/conducted`);
    },
    [mutate]
  );

  // ── Settings ──────────────────────────────────────────────────────────────

  // The admin slider fires on every step; apply locally at once and save after a pause.
  const setMinAttendanceThreshold = useCallback(
    (val: number) => {
      setThresholdDraft(val);
      window.clearTimeout(thresholdTimer.current);
      thresholdTimer.current = window.setTimeout(() => {
        mutate('PUT', '/api/settings', { min_attendance_threshold: val })
          .catch((err) => showToast(errorMessage(err)))
          .finally(() => setThresholdDraft(null));
      }, 600);
    },
    [mutate, showToast]
  );

  const resetToDefaultData = useCallback(async () => {
    await api('POST', '/api/admin/reset-demo');
    setData(null);
    setAuthStatus('anonymous');
  }, []);

  // ── Derived analytics ─────────────────────────────────────────────────────

  const getStudentStats = useCallback(
    (studentId: string) => {
      const enrolledClassIds = enrollments.filter((e) => e.student_id === studentId).map((e) => e.class_id);
      const studentRecords = records.filter((r) => r.student_id === studentId);

      let totalConducted = 0;
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalExcused = 0;

      const subjectStats: SubjectAttendanceStat[] = enrolledClassIds.map((classId) => {
        const collegeClass = classes.find((c) => c.id === classId);
        const subject = subjects.find((s) => s.id === collegeClass?.subject_id);
        const faculty = facultyList.find((f) => f.id === collegeClass?.faculty_id);

        // Every lecture produces one record per enrolled student when it closes
        // (absentees included), so records are the conducted count.
        const classRecords = studentRecords.filter((r) => r.class_id === classId);
        const conducted = classRecords.length;
        const present = classRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
        const absent = classRecords.filter((r) => r.status === 'ABSENT').length;
        const excused = classRecords.filter((r) => r.status === 'EXCUSED').length;

        totalConducted += conducted;
        totalPresent += present;
        totalAbsent += absent;
        totalExcused += excused;

        // Approved leave counts as attendance credit.
        const metrics = calculateAttendanceMetrics(present + excused, conducted, minAttendanceThreshold);
        return {
          subject_id: subject?.id || classId,
          subject_name: subject?.name || 'Subject',
          subject_code: subject?.code || '—',
          conducted,
          present,
          absent,
          excused,
          percentage: metrics.percentage,
          safe_misses: metrics.safeMisses,
          required_attend: metrics.requiredAttend,
          faculty_name: faculty?.name || 'Unassigned',
        };
      });

      const overallMetrics = calculateAttendanceMetrics(totalPresent + totalExcused, totalConducted, minAttendanceThreshold);
      const overall: OverallAttendanceSummary = {
        total_conducted: totalConducted,
        total_present: totalPresent,
        total_absent: totalAbsent,
        total_excused: totalExcused,
        percentage: overallMetrics.percentage,
        safe_misses: overallMetrics.safeMisses,
        required_attend: overallMetrics.requiredAttend,
        is_low_attendance: overallMetrics.isLowAttendance,
      };
      return { subjectStats, overall };
    },
    [enrollments, records, classes, subjects, facultyList, minAttendanceThreshold]
  );

  const getClassEnrolledStudents = useCallback(
    (classId: string) => {
      const ids = new Set(enrollments.filter((e) => e.class_id === classId).map((e) => e.student_id));
      return students.filter((s) => ids.has(s.id));
    },
    [enrollments, students]
  );

  const getSessionAttendanceMap = useCallback(
    (sessionId: string) => {
      const map: Record<string, AttendanceRecord> = {};
      for (const r of records) if (r.session_id === sessionId) map[r.student_id] = r;
      return map;
    },
    [records]
  );

  const value: AttendanceContextType = {
    authStatus,
    isAuthenticated: authStatus === 'authenticated',
    currentUser,
    currentRole,
    currentStudent,
    currentFaculty,
    login,
    logout,
    changePassword,
    refresh,
    users: data?.users ?? [],
    departments: data?.departments ?? [],
    subjects,
    facultyList,
    students,
    classes,
    enrollments,
    sessions: data?.sessions ?? [],
    activeSession,
    records,
    correctionRequests: data?.correction_requests ?? [],
    leaveApplications: data?.leave_applications ?? [],
    academicEvents: data?.academic_events ?? [],
    extraClasses: data?.extra_classes ?? [],
    announcements: data?.announcements ?? [],
    minAttendanceThreshold,
    setMinAttendanceThreshold,
    startAttendanceSession,
    closeAttendanceSession,
    getSessionQR,
    markAttendanceViaQR,
    identifyFaces,
    markAttendanceViaFace,
    registerStudentFace,
    removeStudentFace,
    manualUpdateAttendance,
    markBatchAttendance,
    submitCorrectionRequest,
    reviewCorrectionRequest,
    applyLeave,
    reviewLeave,
    addAnnouncement,
    dispatchNotices,
    addClass,
    updateClass,
    removeClass,
    bulkImportClasses,
    allotFacultyToClass,
    addStudent,
    importStudents,
    removeStudent,
    resetStudentPassword,
    getStudentEnrolledClassIds,
    updateStudentEnrollments,
    addFaculty,
    removeFaculty,
    updateFaculty,
    addSubject,
    updateSubject,
    removeSubject,
    addAcademicEvent,
    removeAcademicEvent,
    scheduleExtraClass,
    cancelExtraClass,
    markExtraClassConducted,
    getStudentStats,
    getClassEnrolledStudents,
    getSessionAttendanceMap,
    resetToDefaultData,
  };

  return (
    <AttendanceContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} dismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error('useAttendance must be used within AttendanceProvider');
  return ctx;
};
