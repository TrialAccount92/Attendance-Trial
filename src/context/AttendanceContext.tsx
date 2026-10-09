import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  UserRole,
  Student,
  Faculty,
  Department,
  Subject,
  CollegeClass,
  Enrollment,
  AttendanceSession,
  AttendanceRecord,
  CorrectionRequest,
  Announcement,
  SubjectAttendanceStat,
  OverallAttendanceSummary,
  AttendanceStatus,
  LeaveType,
  LeaveApplication,
  AcademicEventType,
  AcademicEvent,
  ExtraClassSchedule,
} from '../types';
import {
  initialUsers,
  initialDepartments,
  initialSubjects,
  initialFaculty,
  initialStudents,
  initialClasses,
  initialEnrollments,
  initialSessions,
  initialRecords,
  initialCorrectionRequests,
  initialAnnouncements,
} from '../data/initialData';
import { calculateAttendanceMetrics } from '../utils/attendanceCalc';
import { generateDynamicSessionToken, decodeQRPayload, encodeQRPayload, QRPayload } from '../utils/qrSecurity';

interface AttendanceContextType {
  // Current user / Persona
  currentUser: User;
  currentRole: UserRole;
  currentStudent: Student | null;
  currentFaculty: Faculty | null;
  switchUser: (role: UserRole, userId?: string) => void;
  isAuthenticated: boolean;
  login: (role: UserRole, userId?: string) => void;
  logout: () => void;

  // Collections
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

  // Core actions
  startAttendanceSession: (classId: string, topic?: string) => AttendanceSession;
  rotateSessionToken: (sessionId: string) => void;
  closeAttendanceSession: (sessionId: string) => void;
  markAttendanceViaQR: (qrString: string) => { success: boolean; message: string; subject?: string };
  markAttendanceViaFace: (
    classId: string,
    studentId: string,
    confidence: number,
    sessionId?: string
  ) => { success: boolean; message: string; studentName?: string; alreadyMarked?: boolean };
  registerStudentFace: (studentId: string, photoUrl: string, descriptor?: number[]) => void;
  manualUpdateAttendance: (sessionId: string, studentId: string, classId: string, status: AttendanceStatus) => void;
  submitCorrectionRequest: (classId: string, subjectName: string, date: string, reason: string) => void;
  reviewCorrectionRequest: (requestId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => void;
  applyLeave: (data: {
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    reason: string;
    document_name?: string;
  }) => LeaveApplication;
  reviewLeave: (leaveId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => void;
  addAnnouncement: (title: string, content: string, category: 'GENERAL' | 'ACADEMIC' | 'ATTENDANCE' | 'ALERT') => void;
  
  // Class & schedule management
  addClass: (newClass: Omit<CollegeClass, 'id'>) => CollegeClass;
  updateClass: (classId: string, updates: Partial<Omit<CollegeClass, 'id'>>) => void;
  removeClass: (classId: string) => void;
  bulkImportClasses: (
    facultyId: string,
    newClassesList: Array<Omit<CollegeClass, 'id'>>,
    replaceExisting?: boolean
  ) => { count: number };
  markBatchAttendance: (
    classId: string,
    date: string,
    topic: string,
    roster: Array<{ studentId: string; status: AttendanceStatus }>
  ) => { recordedCount: number };

  // Student management
  addStudent: (newStudentData: {
    name: string;
    roll_number: string;
    enrollment_number?: string;
    email?: string;
    semester?: number;
    division?: string;
    department_id?: string;
    seedAttendance?: boolean;
  }) => Student;
  importStudents: (newStudentsList: Array<{
    name: string;
    roll_number: string;
    enrollment_number?: string;
    email?: string;
    semester?: number;
    division?: string;
    department_id?: string;
  }>) => { added: number; updated: number };
  removeStudent: (studentId: string) => void;

  // Faculty management
  addFaculty: (facultyData: {
    name: string;
    email: string;
    department_id: string;
    designation?: string;
    employee_id?: string;
  }) => Faculty;
  removeFaculty: (facultyId: string) => void;
  updateFaculty: (facultyId: string, updates: Partial<Omit<Faculty, 'id'>>) => void;

  // Subject management
  addSubject: (subjectData: {
    name: string;
    code: string;
    credits: number;
    department_id: string;
    semester?: number;
  }) => Subject;
  updateSubject: (subjectId: string, updates: Partial<Omit<Subject, 'id'>>) => void;
  removeSubject: (subjectId: string) => void;

  // Student class enrollment / allotment
  getStudentEnrolledClassIds: (studentId: string) => string[];
  updateStudentEnrollments: (studentId: string, classIds: string[]) => void;
  allotFacultyToClass: (classId: string, facultyId: string) => void;

  // Academic Calendar & Extra Classes
  addAcademicEvent: (event: Omit<AcademicEvent, 'id'>) => void;
  removeAcademicEvent: (id: string) => void;
  scheduleExtraClass: (extra: Omit<ExtraClassSchedule, 'id' | 'is_conducted'>) => void;
  cancelExtraClass: (id: string) => void;
  markExtraClassConducted: (id: string) => void;

  // Analytics helpers
  getStudentStats: (studentId: string) => {
    subjectStats: SubjectAttendanceStat[];
    overall: OverallAttendanceSummary;
  };
  getClassEnrolledStudents: (classId: string) => Student[];
  getSessionAttendanceMap: (sessionId: string) => Record<string, AttendanceRecord>;
  resetToDefaultData: () => void;
  getActiveSessionQRPayload: () => string;
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

const STORAGE_PREFIX = 'attendpulse_v3_';

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(STORAGE_PREFIX + key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to save ${key} to localStorage`, err);
  }
}

const initialLeaveApplications: LeaveApplication[] = [
  {
    id: 'leave-1',
    student_id: 'stu-1',
    student_name: 'Aarav Patel',
    roll_number: '01',
    leave_type: 'ON_DUTY_EVENT',
    start_date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    end_date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    reason: 'Representing college at Inter-Collegiate Smart India Hackathon finals.',
    status: 'APPROVED',
    faculty_comment: 'Official duty approved. Attendance credit granted.',
    applied_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'leave-2',
    student_id: 'stu-2',
    student_name: 'Priya Sharma',
    roll_number: '02',
    leave_type: 'MEDICAL',
    start_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    end_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    reason: 'Viral fever and medical rest advised by physician.',
    document_name: 'medical_certificate.pdf',
    status: 'PENDING',
    applied_at: new Date().toISOString(),
  },
  {
    id: 'leave-3',
    student_id: 'stu-7',
    student_name: 'Rohan Verma',
    roll_number: '07',
    leave_type: 'SPORTS',
    start_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    end_date: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
    reason: 'State University Cricket Tournament representational team squad.',
    status: 'PENDING',
    applied_at: new Date().toISOString(),
  },
];

const initialAcademicEvents: AcademicEvent[] = [
  {
    id: 'ev-1',
    title: 'Gandhi Jayanti (National Holiday)',
    description: 'National holiday in commemoration of the birth anniversary of Mahatma Gandhi. College and labs remain closed.',
    start_date: '2026-10-02',
    end_date: '2026-10-02',
    type: 'HOLIDAY',
    affects_attendance: true,
    created_by: 'Academic Dean Office',
  },
  {
    id: 'ev-2',
    title: 'Mid-Term Examination Week (Odd Sem)',
    description: 'Official centralized mid-semester assessment examinations across all engineering departments.',
    start_date: '2026-10-12',
    end_date: '2026-10-17',
    type: 'EXAM_WEEK',
    affects_attendance: false,
    created_by: 'Controller of Examinations',
  },
  {
    id: 'ev-3',
    title: 'Diwali & Autumn Semester Break',
    description: 'Festival vacation for students and faculty. Regular lectures resume post-break.',
    start_date: '2026-11-01',
    end_date: '2026-11-06',
    type: 'VACATION',
    affects_attendance: true,
    created_by: 'Academic Dean Office',
  },
  {
    id: 'ev-4',
    title: 'PULSE 2026 — Annual Tech & Cultural Fest',
    description: 'Three-day annual inter-collegiate technical symposium and cultural festival. All regular classes suspended for events.',
    start_date: '2026-11-19',
    end_date: '2026-11-21',
    type: 'FESTIVAL',
    affects_attendance: true,
    created_by: 'Student Affairs Council',
  },
  {
    id: 'ev-5',
    title: 'End-Semester Exam Form & Hall Ticket Verification',
    description: 'Mandatory portal deadline for student hall ticket verification and detention clearance.',
    start_date: '2026-11-30',
    end_date: '2026-11-30',
    type: 'ACADEMIC_DEADLINE',
    affects_attendance: false,
    created_by: 'Controller of Examinations',
  },
];

const initialExtraClasses: ExtraClassSchedule[] = [
  {
    id: 'extra-1',
    class_id: 'cls-1',
    faculty_id: 'fac-1',
    date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    start_time: '10:00 AM',
    end_time: '11:30 AM',
    room: 'Lab 301',
    topic: 'Red-Black Trees & Advanced Balancing',
    reason: 'Compensatory lecture for missed session on Sept 12 holiday',
    is_conducted: false,
  },
  {
    id: 'extra-2',
    class_id: 'cls-2',
    faculty_id: 'fac-2',
    date: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
    start_time: '02:00 PM',
    end_time: '03:30 PM',
    room: 'Room 204',
    topic: 'Normalization (BCNF & 4NF) Practice Problems',
    reason: 'Syllabus catch-up prior to Mid-Term assessments',
    is_conducted: false,
  },
];

export const AttendanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State
  const [users, setUsers] = useState<User[]>(() => loadStorage('users', initialUsers));
  const [departments] = useState<Department[]>(() => loadStorage('depts', initialDepartments));
  const [subjects, setSubjects] = useState<Subject[]>(() => loadStorage('subjects', initialSubjects));
  const [facultyList, setFacultyList] = useState<Faculty[]>(() => loadStorage('faculty', initialFaculty));
  const [students, setStudents] = useState<Student[]>(() => loadStorage('students', initialStudents));
  const [classes, setClasses] = useState<CollegeClass[]>(() => loadStorage('classes', initialClasses));
  const [enrollments, setEnrollments] = useState<Enrollment[]>(() => loadStorage('enrollments', initialEnrollments));
  const [sessions, setSessions] = useState<AttendanceSession[]>(() => loadStorage('sessions', initialSessions));
  const [records, setRecords] = useState<AttendanceRecord[]>(() => loadStorage('records', initialRecords));
  const [correctionRequests, setCorrectionRequests] = useState<CorrectionRequest[]>(() =>
    loadStorage('requests', initialCorrectionRequests)
  );
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>(() =>
    loadStorage('leave_apps', initialLeaveApplications)
  );
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>(() =>
    loadStorage('academic_events', initialAcademicEvents)
  );
  const [extraClasses, setExtraClasses] = useState<ExtraClassSchedule[]>(() =>
    loadStorage('extra_classes', initialExtraClasses)
  );
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    loadStorage('announcements', initialAnnouncements)
  );
  const [minAttendanceThreshold, setMinAttendanceThreshold] = useState<number>(0.75);

  // Active persona & authentication
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const saved = localStorage.getItem('attendpulse_v3_role');
    if (saved === 'STUDENT' || saved === 'FACULTY' || saved === 'ADMIN') return saved;
    return 'STUDENT';
  });
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem('attendpulse_v3_user_id') || 'usr-stu-1';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const saved = localStorage.getItem('attendpulse_v3_auth');
    return saved !== null ? saved === 'true' : false;
  });

  // Active session tracking
  const activeSession = sessions.find((s) => s.status === 'ACTIVE') || null;

  // Persist modified states
  useEffect(() => {
    saveStorage('records', records);
  }, [records]);

  useEffect(() => {
    saveStorage('sessions', sessions);
  }, [sessions]);

  useEffect(() => {
    saveStorage('requests', correctionRequests);
  }, [correctionRequests]);

  useEffect(() => {
    saveStorage('leave_apps', leaveApplications);
  }, [leaveApplications]);

  useEffect(() => {
    saveStorage('academic_events', academicEvents);
  }, [academicEvents]);

  useEffect(() => {
    saveStorage('extra_classes', extraClasses);
  }, [extraClasses]);

  useEffect(() => {
    saveStorage('announcements', announcements);
  }, [announcements]);

  useEffect(() => {
    saveStorage('classes', classes);
  }, [classes]);

  useEffect(() => {
    saveStorage('students', students);
  }, [students]);

  useEffect(() => {
    saveStorage('users', users);
  }, [users]);

  useEffect(() => {
    saveStorage('enrollments', enrollments);
  }, [enrollments]);

  useEffect(() => {
    saveStorage('subjects', subjects);
  }, [subjects]);

  useEffect(() => {
    saveStorage('faculty', facultyList);
  }, [facultyList]);

  // Derived user helpers
  const currentUser = users.find((u) => u.id === currentUserId) || users[0];
  const currentStudent = students.find((s) => s.user_id === currentUser.id) || null;
  const currentFaculty = facultyList.find((f) => f.user_id === currentUser.id) || null;

  const switchUser = useCallback((role: UserRole, userId?: string) => {
    setCurrentRole(role);
    localStorage.setItem('attendpulse_v3_role', role);
    if (userId) {
      setCurrentUserId(userId);
      localStorage.setItem('attendpulse_v3_user_id', userId);
    } else {
      let defaultId = 'usr-stu-1';
      if (role === 'STUDENT') defaultId = 'usr-stu-1';
      else if (role === 'FACULTY') defaultId = 'usr-fac-1';
      else defaultId = 'usr-admin';
      setCurrentUserId(defaultId);
      localStorage.setItem('attendpulse_v3_user_id', defaultId);
    }
  }, []);

  const login = useCallback((role: UserRole, userId?: string) => {
    switchUser(role, userId);
    setIsAuthenticated(true);
    localStorage.setItem('attendpulse_v3_auth', 'true');
  }, [switchUser]);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    localStorage.setItem('attendpulse_v3_auth', 'false');
  }, []);

  // Start attendance session (Faculty creates dynamic session)
  const startAttendanceSession = useCallback((classId: string, topic?: string): AttendanceSession => {
    const targetClass = classes.find((c) => c.id === classId);
    const facultyId = targetClass ? targetClass.faculty_id : 'fac-1';
    const sessionId = `sess-${Date.now()}`;
    const tokenInfo = generateDynamicSessionToken(sessionId);

    const newSession: AttendanceSession = {
      id: sessionId,
      class_id: classId,
      faculty_id: facultyId,
      start_time: new Date().toISOString(),
      status: 'ACTIVE',
      qr_token: tokenInfo.token,
      token_generated_at: tokenInfo.generatedAt,
      expires_at: tokenInfo.expiresAt,
      token_refresh_interval_sec: 30,
      topic: topic?.trim() || undefined,
    };

    // Close any other active sessions first
    setSessions((prev) => [
      newSession,
      ...prev.map((s) => (s.status === 'ACTIVE' ? { ...s, status: 'CLOSED' as const, end_time: new Date().toISOString() } : s)),
    ]);

    return newSession;
  }, [classes]);

  // Rotate QR token every 30s
  const rotateSessionToken = useCallback((sessionId: string) => {
    const tokenInfo = generateDynamicSessionToken(sessionId);
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessionId && s.status === 'ACTIVE') {
          return {
            ...s,
            qr_token: tokenInfo.token,
            token_generated_at: tokenInfo.generatedAt,
            expires_at: tokenInfo.expiresAt,
          };
        }
        return s;
      })
    );
  }, []);

  // Close session & mark missing enrolled students as ABSENT
  const closeAttendanceSession = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'CLOSED' as const, end_time: new Date().toISOString() } : s
      )
    );

    // Auto-mark remaining students as absent for audit trail
    setRecords((prev) => {
      const targetSession = sessions.find((s) => s.id === sessionId);
      if (!targetSession) return prev;

      const enrolledStudentIds = enrollments
        .filter((e) => e.class_id === targetSession.class_id)
        .map((e) => e.student_id);

      const existingRecordStudentIds = new Set(
        prev.filter((r) => r.session_id === sessionId).map((r) => r.student_id)
      );

      const absentRecords: AttendanceRecord[] = enrolledStudentIds
        .filter((studentId) => !existingRecordStudentIds.has(studentId))
        .map((studentId, idx) => ({
          id: `rec-absent-${sessionId}-${studentId}-${idx}`,
          session_id: sessionId,
          student_id: studentId,
          class_id: targetSession.class_id,
          status: 'ABSENT' as const,
          marked_at: new Date().toISOString(),
          method: 'MANUAL' as const,
        }));

      return [...absentRecords, ...prev];
    });
  }, [sessions, enrollments]);

  // Dynamic QR validation & Student Attendance Marking
  const markAttendanceViaQR = useCallback((qrString: string): { success: boolean; message: string; subject?: string } => {
    if (!currentStudent) {
      return { success: false, message: 'Only enrolled students can scan attendance QR codes.' };
    }

    const payload = decodeQRPayload(qrString);
    if (!payload) {
      return { success: false, message: 'Invalid QR Code format or corrupt token.' };
    }

    const session = sessions.find((s) => s.id === payload.sessionId);
    if (!session) {
      return { success: false, message: 'Attendance session not found or closed.' };
    }

    if (session.status !== 'ACTIVE') {
      return { success: false, message: 'This attendance session has already ended.' };
    }

    // Check token freshness (allow 5-second grace period for network jitter)
    const now = Date.now();
    if (now > payload.expiresAt + 5000) {
      return { success: false, message: 'QR Code has expired! Please scan the latest dynamic code on the screen.' };
    }

    if (session.qr_token !== payload.token) {
      return { success: false, message: 'Security token mismatch. Please scan the newly refreshed QR code.' };
    }

    const targetClass = classes.find((c) => c.id === session.class_id);
    const targetSubject = subjects.find((s) => s.id === targetClass?.subject_id);

    // Check enrollment: explicit enrollment record OR cohort match (same semester & division)
    const isEnrolled =
      enrollments.some((e) => e.student_id === currentStudent.id && e.class_id === session.class_id) ||
      (targetClass && targetClass.semester === currentStudent.semester && targetClass.division === currentStudent.division);

    if (!isEnrolled) {
      return { success: false, message: 'You are not enrolled in this subject class.' };
    }

    // Check duplicate attendance constraint: UNIQUE(session_id, student_id)
    const alreadyMarked = records.some(
      (r) => r.session_id === session.id && r.student_id === currentStudent.id
    );
    if (alreadyMarked) {
      return { success: false, message: 'Attendance already recorded for this session!' };
    }

    const newRecord: AttendanceRecord = {
      id: `rec-qr-${Date.now()}`,
      session_id: session.id,
      student_id: currentStudent.id,
      class_id: session.class_id,
      status: 'PRESENT',
      marked_at: new Date().toISOString(),
      method: 'QR',
    };

    setRecords((prev) => [newRecord, ...prev]);

    return {
      success: true,
      message: `Attendance recorded as PRESENT for ${targetSubject?.name || 'Class'}!`,
      subject: targetSubject?.name,
    };
  }, [currentStudent, sessions, enrollments, records, classes, subjects]);

  // AI Facial Recognition Attendance Marking
  const markAttendanceViaFace = useCallback(
    (
      classId: string,
      studentId: string,
      confidence: number,
      sessionId?: string
    ): { success: boolean; message: string; studentName?: string; alreadyMarked?: boolean } => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        return { success: false, message: 'Student not recognized in system.' };
      }

      const targetClass = classes.find((c) => c.id === classId);
      if (!targetClass) {
        return { success: false, message: 'Class not found.' };
      }

      let effectiveSessionId = sessionId;
      if (!effectiveSessionId) {
        if (activeSession && activeSession.class_id === classId) {
          effectiveSessionId = activeSession.id;
        } else {
          effectiveSessionId = `sess-face-${Date.now()}`;
          const newSession: AttendanceSession = {
            id: effectiveSessionId,
            class_id: classId,
            faculty_id: targetClass.faculty_id,
            start_time: new Date().toISOString(),
            status: 'ACTIVE',
            qr_token: `face-${Date.now()}`,
            token_generated_at: Date.now(),
            expires_at: Date.now() + 60 * 60 * 1000,
            token_refresh_interval_sec: 30,
            topic: 'AI Face Recognition Lecture',
          };
          setSessions((prev) => [newSession, ...prev]);
        }
      }

      // Check if student is already marked present for this session
      const isAlreadyPresent = records.some(
        (r) => r.session_id === effectiveSessionId && r.student_id === studentId && (r.status === 'PRESENT' || r.status === 'LATE')
      );

      if (isAlreadyPresent) {
        return {
          success: true,
          alreadyMarked: true,
          message: `${student.name} is already marked PRESENT.`,
          studentName: student.name,
        };
      }

      const newRecord: AttendanceRecord = {
        id: `rec-face-${Date.now()}-${studentId}`,
        session_id: effectiveSessionId,
        student_id: studentId,
        class_id: classId,
        status: 'PRESENT',
        marked_at: new Date().toISOString(),
        method: 'FACE',
      };

      setRecords((prev) => [newRecord, ...prev]);

      return {
        success: true,
        alreadyMarked: false,
        message: `${student.name} marked PRESENT (${Math.round(confidence * 100)}% match)!`,
        studentName: student.name,
      };
    },
    [students, classes, activeSession, records]
  );

  // Biometric Face Profile Registration
  const registerStudentFace = useCallback((studentId: string, photoUrl: string, descriptor?: number[]) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            face_registered: true,
            face_photo: photoUrl,
            avatar: photoUrl || s.avatar,
            face_profile: {
              student_id: studentId,
              enrolled_at: new Date().toISOString(),
              photo_url: photoUrl,
              descriptor: descriptor || s.face_profile?.descriptor,
            },
          };
        }
        return s;
      })
    );
  }, []);

  // Manual attendance override by Faculty
  const manualUpdateAttendance = useCallback(
    (sessionId: string, studentId: string, classId: string, status: AttendanceStatus) => {
      setRecords((prev) => {
        const existingIdx = prev.findIndex((r) => r.session_id === sessionId && r.student_id === studentId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            status,
            marked_at: new Date().toISOString(),
            method: 'MANUAL',
          };
          return updated;
        } else {
          const newRec: AttendanceRecord = {
            id: `rec-manual-${Date.now()}`,
            session_id: sessionId,
            student_id: studentId,
            class_id: classId,
            status,
            marked_at: new Date().toISOString(),
            method: 'MANUAL',
          };
          return [newRec, ...prev];
        }
      });
    },
    []
  );

  // Submit correction request
  const submitCorrectionRequest = useCallback(
    (classId: string, subjectName: string, date: string, reason: string) => {
      if (!currentStudent) return;
      const newRequest: CorrectionRequest = {
        id: `req-${Date.now()}`,
        student_id: currentStudent.id,
        student_name: currentStudent.name,
        roll_number: currentStudent.roll_number,
        class_id: classId,
        subject_name: subjectName,
        date,
        reason,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      };
      setCorrectionRequests((prev) => [newRequest, ...prev]);
    },
    [currentStudent]
  );

  // Faculty approves or rejects correction request
  const reviewCorrectionRequest = useCallback(
    (requestId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => {
      setCorrectionRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, status, faculty_comment: comment } : req))
      );

      // If approved, update student record
      if (status === 'APPROVED') {
        const targetReq = correctionRequests.find((r) => r.id === requestId);
        if (targetReq) {
          setRecords((prev) => {
            // Find existing record or add new present record
            const recIdx = prev.findIndex(
              (r) => r.student_id === targetReq.student_id && r.class_id === targetReq.class_id
            );
            if (recIdx >= 0) {
              const copy = [...prev];
              copy[recIdx] = { ...copy[recIdx], status: 'PRESENT', method: 'MANUAL' };
              return copy;
            } else {
              const newRec: AttendanceRecord = {
                id: `rec-corr-${Date.now()}`,
                session_id: targetReq.session_id || `corr-sess-${Date.now()}`,
                student_id: targetReq.student_id,
                class_id: targetReq.class_id,
                status: 'PRESENT',
                marked_at: new Date().toISOString(),
                method: 'MANUAL',
              };
              return [newRec, ...prev];
            }
          });
        }
      }
    },
    [correctionRequests]
  );

  // Student applies for Medical or Duty leave
  const applyLeave = useCallback(
    (data: {
      leave_type: LeaveType;
      start_date: string;
      end_date: string;
      reason: string;
      document_name?: string;
    }): LeaveApplication => {
      const student = currentStudent || students[0];
      const newLeave: LeaveApplication = {
        id: `leave-${Date.now()}`,
        student_id: student.id,
        student_name: student.name,
        roll_number: student.roll_number,
        leave_type: data.leave_type,
        start_date: data.start_date,
        end_date: data.end_date,
        reason: data.reason.trim(),
        document_name: data.document_name,
        status: 'PENDING',
        applied_at: new Date().toISOString(),
      };
      setLeaveApplications((prev) => [newLeave, ...prev]);
      return newLeave;
    },
    [currentStudent, students]
  );

  // Faculty or Admin reviews leave application
  const reviewLeave = useCallback(
    (leaveId: string, status: 'APPROVED' | 'REJECTED', comment?: string) => {
      setLeaveApplications((prev) =>
        prev.map((l) => (l.id === leaveId ? { ...l, status, faculty_comment: comment?.trim() } : l))
      );

      // If approved, mark student records as EXCUSED for enrolled classes on dates
      if (status === 'APPROVED') {
        const targetLeave = leaveApplications.find((l) => l.id === leaveId);
        if (targetLeave) {
          const studentClasses = enrollments
            .filter((e) => e.student_id === targetLeave.student_id)
            .map((e) => e.class_id);

          setRecords((prev) => {
            const next = [...prev];
            // Update existing records within the leave dates
            let updatedAny = false;
            const updated = next.map((rec) => {
              if (rec.student_id === targetLeave.student_id && studentClasses.includes(rec.class_id)) {
                const recDate = rec.marked_at.split('T')[0];
                if (recDate >= targetLeave.start_date && recDate <= targetLeave.end_date) {
                  updatedAny = true;
                  return { ...rec, status: 'EXCUSED' as AttendanceStatus };
                }
              }
              return rec;
            });

            // If no sessions were yet recorded on those dates, seed an EXCUSED record for active classes
            if (!updatedAny && studentClasses.length > 0) {
              studentClasses.forEach((cId, idx) => {
                updated.unshift({
                  id: `rec-excused-${Date.now()}-${idx}`,
                  session_id: `sess-leave-${targetLeave.id}`,
                  student_id: targetLeave.student_id,
                  class_id: cId,
                  status: 'EXCUSED',
                  marked_at: `${targetLeave.start_date}T10:00:00.000Z`,
                  method: 'MANUAL',
                });
              });
            }

            return updated;
          });
        }
      }
    },
    [leaveApplications, enrollments]
  );

  // Admin announcement
  const addAnnouncement = useCallback(
    (title: string, content: string, category: 'GENERAL' | 'ACADEMIC' | 'ATTENDANCE' | 'ALERT') => {
      const newAnn: Announcement = {
        id: `ann-${Date.now()}`,
        title,
        content,
        date: new Date().toISOString().split('T')[0],
        category,
        author: currentUser.name,
      };
      setAnnouncements((prev) => [newAnn, ...prev]);
    },
    [currentUser]
  );

  // Analytics calculator for a given student
  const getStudentStats = useCallback(
    (studentId: string) => {
      const enrolledClassIds = enrollments
        .filter((e) => e.student_id === studentId)
        .map((e) => e.class_id);

      let totalConducted = 0;
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalExcused = 0;

      const subjectStats: SubjectAttendanceStat[] = enrolledClassIds.map((classId) => {
        const collegeClass = classes.find((c) => c.id === classId);
        const subject = subjects.find((s) => s.id === collegeClass?.subject_id);
        const faculty = facultyList.find((f) => f.id === collegeClass?.faculty_id);

        // Student's records for this class
        const classRecords = records.filter(
          (r) => r.student_id === studentId && r.class_id === classId
        );

        const conducted = classRecords.length;
        const present = classRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
        const absent = classRecords.filter((r) => r.status === 'ABSENT').length;
        const excused = classRecords.filter((r) => r.status === 'EXCUSED').length;

        totalConducted += conducted;
        totalPresent += present;
        totalAbsent += absent;
        totalExcused += excused;

        // Approved EXCUSED classes count as valid attendance credit
        const effectivePresent = present + excused;
        const metrics = calculateAttendanceMetrics(effectivePresent, conducted, minAttendanceThreshold);

        return {
          subject_id: subject?.id || classId,
          subject_name: subject?.name || 'Subject',
          subject_code: subject?.code || 'CS000',
          conducted,
          present,
          absent,
          excused,
          percentage: metrics.percentage,
          safe_misses: metrics.safeMisses,
          required_attend: metrics.requiredAttend,
          faculty_name: faculty?.name || 'Faculty',
        };
      });

      const effectiveTotalPresent = totalPresent + totalExcused;
      const overallMetrics = calculateAttendanceMetrics(effectiveTotalPresent, totalConducted, minAttendanceThreshold);

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
    (classId: string): Student[] => {
      const studentIds = enrollments.filter((e) => e.class_id === classId).map((e) => e.student_id);
      return students.filter((s) => studentIds.includes(s.id));
    },
    [enrollments, students]
  );

  const getSessionAttendanceMap = useCallback(
    (sessionId: string): Record<string, AttendanceRecord> => {
      const map: Record<string, AttendanceRecord> = {};
      records
        .filter((r) => r.session_id === sessionId)
        .forEach((r) => {
          map[r.student_id] = r;
        });
      return map;
    },
    [records]
  );

  // Active session QR payload
  const getActiveSessionQRPayload = useCallback((): string => {
    if (!activeSession) return '';
    const payload: QRPayload = {
      sessionId: activeSession.id,
      classId: activeSession.class_id,
      token: activeSession.qr_token,
      generatedAt: activeSession.token_generated_at,
      expiresAt: activeSession.expires_at,
    };
    return encodeQRPayload(payload);
  }, [activeSession]);

  const addClass = useCallback((data: Omit<CollegeClass, 'id'>): CollegeClass => {
    const id = `cls-${Date.now()}`;
    const newClass: CollegeClass = { id, ...data };
    setClasses((prev) => [...prev, newClass]);
    return newClass;
  }, []);

  const updateClass = useCallback((classId: string, updates: Partial<Omit<CollegeClass, 'id'>>) => {
    setClasses((prev) =>
      prev.map((c) => (c.id === classId ? { ...c, ...updates } : c))
    );
  }, []);

  const removeClass = useCallback((classId: string) => {
    setClasses((prev) => prev.filter((c) => c.id !== classId));
  }, []);

  const bulkImportClasses = useCallback(
    (
      facultyId: string,
      newClassesList: Array<Omit<CollegeClass, 'id'>>,
      replaceExisting = false
    ) => {
      let count = 0;
      setClasses((prev) => {
        const base = replaceExisting ? prev.filter((c) => c.faculty_id !== facultyId) : [...prev];
        const added: CollegeClass[] = newClassesList.map((item, idx) => ({
          id: `cls-${Date.now()}-${idx}`,
          ...item,
          faculty_id: facultyId,
        }));
        count = added.length;
        return [...base, ...added];
      });
      return { count };
    },
    []
  );

  const markBatchAttendance = useCallback(
    (
      classId: string,
      date: string,
      topic: string,
      roster: Array<{ studentId: string; status: AttendanceStatus }>
    ) => {
      const sessionId = `sess-rollcall-${Date.now()}`;
      const targetClass = classes.find((c) => c.id === classId);
      const facultyId = targetClass ? targetClass.faculty_id : 'fac-1';
      const timestamp = date ? new Date(date).toISOString() : new Date().toISOString();

      const newSession: AttendanceSession = {
        id: sessionId,
        class_id: classId,
        faculty_id: facultyId,
        start_time: timestamp,
        end_time: timestamp,
        status: 'CLOSED',
        qr_token: 'ROLL-CALL-DIRECT',
        token_generated_at: Date.now(),
        expires_at: Date.now(),
        token_refresh_interval_sec: 0,
        topic: topic?.trim() || undefined,
      };

      const newRecords: AttendanceRecord[] = roster.map((item, idx) => ({
        id: `rec-batch-${Date.now()}-${idx}`,
        session_id: sessionId,
        class_id: classId,
        student_id: item.studentId,
        status: item.status,
        marked_at: timestamp,
        method: 'MANUAL',
      }));

      setSessions((prev) => [newSession, ...prev]);
      setRecords((prev) => [...newRecords, ...prev]);

      return { recordedCount: roster.length };
    },
    [classes]
  );

  const importStudents = useCallback(
    (newStudents: Array<{
      name: string;
      roll_number: string;
      enrollment_number?: string;
      email?: string;
      semester?: number;
      division?: string;
      department_id?: string;
    }>) => {
      let added = 0;
      let updated = 0;

      setStudents((prev) => {
        const next = [...prev];
        newStudents.forEach((stu, idx) => {
          const cleanRoll = String(stu.roll_number || '').trim();
          const cleanEnroll = String(stu.enrollment_number || '').trim();
          const existingIndex = next.findIndex(
            (s) =>
              (cleanRoll && s.roll_number.toLowerCase() === cleanRoll.toLowerCase()) ||
              (cleanEnroll && s.enrollment_number.toLowerCase() === cleanEnroll.toLowerCase())
          );

          if (existingIndex >= 0) {
            next[existingIndex] = {
              ...next[existingIndex],
              name: stu.name || next[existingIndex].name,
              email: stu.email || next[existingIndex].email,
              semester: Number(stu.semester) || next[existingIndex].semester,
              division: String(stu.division || next[existingIndex].division).toUpperCase(),
              department_id: stu.department_id || next[existingIndex].department_id,
            };
            updated++;
          } else {
            const id = `stu-${Date.now()}-${idx}`;
            const user_id = `usr-${id}`;
            const rollFormatted = cleanRoll || String(next.length + 1).padStart(2, '0');
            next.push({
              id,
              user_id,
              name: stu.name,
              roll_number: rollFormatted,
              enrollment_number: cleanEnroll || `EN2024${rollFormatted.padStart(2, '0')}`,
              email: stu.email || `${stu.name.toLowerCase().replace(/\s+/g, '.')}@student.college.edu`,
              semester: Number(stu.semester) || 3,
              division: String(stu.division || 'A').toUpperCase(),
              department_id: stu.department_id || 'dept-ce',
            });
            added++;
          }
        });
        return next;
      });

      return { added, updated };
    },
    []
  );

  const addStudent = useCallback(
    (newStudentData: {
      name: string;
      roll_number: string;
      enrollment_number?: string;
      email?: string;
      semester?: number;
      division?: string;
      department_id?: string;
      seedAttendance?: boolean;
    }): Student => {
      const studentId = `stu-${Date.now()}`;
      const userId = `usr-${studentId}`;
      const cleanRoll = newStudentData.roll_number.trim();
      const sem = Number(newStudentData.semester) || 3;
      const div = (newStudentData.division || 'A').toUpperCase().trim();
      const deptId = newStudentData.department_id || 'dept-ce';

      const newStudent: Student = {
        id: studentId,
        user_id: userId,
        name: newStudentData.name.trim(),
        roll_number: cleanRoll,
        enrollment_number: (newStudentData.enrollment_number || `EN2024${cleanRoll.padStart(2, '0')}`).trim(),
        email: (newStudentData.email || `${newStudentData.name.toLowerCase().replace(/\s+/g, '.')}@student.college.edu`).trim(),
        semester: sem,
        division: div,
        department_id: deptId,
      };

      const newUser: User = {
        id: userId,
        name: newStudent.name,
        email: newStudent.email,
        role: 'STUDENT',
        created_at: new Date().toISOString().split('T')[0],
      };

      setStudents((prev) => [newStudent, ...prev]);
      setUsers((prev) => [newUser, ...prev]);

      // Enroll in matching semester/division classes
      const matchingClasses = classes.filter((c) => c.semester === sem && c.division === div);
      if (matchingClasses.length > 0) {
        const newEnrs: Enrollment[] = matchingClasses.map((cls) => ({
          id: `enr-${studentId}-${cls.id}`,
          student_id: studentId,
          class_id: cls.id,
        }));
        setEnrollments((prev) => [...prev, ...newEnrs]);

        // Seed realistic attendance records if requested
        if (newStudentData.seedAttendance !== false) {
          const newRecs: AttendanceRecord[] = [];
          matchingClasses.forEach((cls) => {
            const classSessions = [...new Set(records.filter((r) => r.class_id === cls.id).map((r) => r.session_id))];
            const sessionsToSeed = classSessions.length > 0 ? classSessions : [`sess-${cls.id}-1`, `sess-${cls.id}-2`, `sess-${cls.id}-3`, `sess-${cls.id}-4`];
            sessionsToSeed.forEach((sessId, sIdx) => {
              const isPres = sIdx % 5 !== 0; // ~80% attendance
              newRecs.push({
                id: `rec-${studentId}-${sessId}`,
                session_id: sessId,
                student_id: studentId,
                class_id: cls.id,
                status: isPres ? 'PRESENT' : 'ABSENT',
                marked_at: new Date(Date.now() - (sessionsToSeed.length - sIdx) * 2.2 * 86400000).toISOString(),
                method: 'QR',
              });
            });
          });
          if (newRecs.length > 0) {
            setRecords((prev) => [...prev, ...newRecs]);
          }
        }
      }

      return newStudent;
    },
    [classes, records]
  );

  const removeStudent = useCallback((studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    setEnrollments((prev) => prev.filter((e) => e.student_id !== studentId));
  }, []);

  // Faculty management
  const addFaculty = useCallback(
    (facultyData: {
      name: string;
      email: string;
      department_id: string;
      designation?: string;
      employee_id?: string;
    }): Faculty => {
      const facultyId = `fac-${Date.now()}`;
      const userId = `usr-${facultyId}`;

      const newFaculty: Faculty = {
        id: facultyId,
        user_id: userId,
        name: facultyData.name.trim(),
        email: facultyData.email.trim(),
        employee_id: facultyData.employee_id?.trim() || `EMP${Math.floor(100 + Math.random() * 900)}`,
        designation: facultyData.designation?.trim() || 'Assistant Professor',
        department_id: facultyData.department_id,
      };

      const newUser: User = {
        id: userId,
        name: newFaculty.name,
        email: newFaculty.email,
        role: 'FACULTY',
        created_at: new Date().toISOString(),
      };

      setFacultyList((prev) => [...prev, newFaculty]);
      setUsers((prev) => [...prev, newUser]);
      return newFaculty;
    },
    []
  );

  const removeFaculty = useCallback((facultyId: string) => {
    setFacultyList((prev) => prev.filter((f) => f.id !== facultyId));
    // Unassign classes without deleting the class schedule
    setClasses((prev) =>
      prev.map((c) => (c.faculty_id === facultyId ? { ...c, faculty_id: '' } : c))
    );
  }, []);

  const updateFaculty = useCallback(
    (facultyId: string, updates: Partial<Omit<Faculty, 'id'>>) => {
      setFacultyList((prev) =>
        prev.map((f) => (f.id === facultyId ? { ...f, ...updates } : f))
      );
      if (updates.name || updates.email) {
        setUsers((prev) =>
          prev.map((u) => {
            const fac = facultyList.find((f) => f.id === facultyId);
            if (fac && u.id === fac.user_id) {
              return {
                ...u,
                name: updates.name || u.name,
                email: updates.email || u.email,
              };
            }
            return u;
          })
        );
      }
    },
    [facultyList]
  );

  // Subject management
  const addSubject = useCallback(
    (subjectData: {
      name: string;
      code: string;
      credits: number;
      department_id: string;
      semester?: number;
    }): Subject => {
      const subjectId = `sub-${Date.now()}`;
      const newSubject: Subject = {
        id: subjectId,
        name: subjectData.name.trim(),
        code: subjectData.code.trim().toUpperCase(),
        credits: Number(subjectData.credits) || 4,
        department_id: subjectData.department_id,
        semester: subjectData.semester || 3,
      };
      setSubjects((prev) => [...prev, newSubject]);
      return newSubject;
    },
    []
  );

  const updateSubject = useCallback(
    (subjectId: string, updates: Partial<Omit<Subject, 'id'>>) => {
      setSubjects((prev) =>
        prev.map((s) => (s.id === subjectId ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const removeSubject = useCallback((subjectId: string) => {
    setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
  }, []);

  // Student class enrollment / allotment
  const getStudentEnrolledClassIds = useCallback(
    (studentId: string): string[] => {
      return enrollments.filter((e) => e.student_id === studentId).map((e) => e.class_id);
    },
    [enrollments]
  );

  const updateStudentEnrollments = useCallback(
    (studentId: string, classIds: string[]) => {
      setEnrollments((prev) => {
        const withoutStudent = prev.filter((e) => e.student_id !== studentId);
        const newEnrollments: Enrollment[] = classIds.map((classId) => ({
          id: `enr-${studentId}-${classId}`,
          student_id: studentId,
          class_id: classId,
        }));
        return [...withoutStudent, ...newEnrollments];
      });
    },
    []
  );

  const allotFacultyToClass = useCallback(
    (classId: string, facultyId: string) => {
      setClasses((prev) =>
        prev.map((c) => (c.id === classId ? { ...c, faculty_id: facultyId } : c))
      );
    },
    []
  );

  const addAcademicEvent = useCallback(
    (eventData: Omit<AcademicEvent, 'id'>) => {
      const newEvent: AcademicEvent = {
        ...eventData,
        id: `ev-${Date.now()}`,
      };
      setAcademicEvents((prev) => [newEvent, ...prev]);
      addAnnouncement(
        `Academic Calendar: ${eventData.title}`,
        `Event "${eventData.title}" (${eventData.start_date}${eventData.end_date !== eventData.start_date ? ` to ${eventData.end_date}` : ''}) has been added to the college calendar.${eventData.affects_attendance ? ' Classes are suspended.' : ''}`,
        'ACADEMIC'
      );
    },
    [addAnnouncement]
  );

  const removeAcademicEvent = useCallback((id: string) => {
    setAcademicEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const scheduleExtraClass = useCallback(
    (extraData: Omit<ExtraClassSchedule, 'id' | 'is_conducted'>) => {
      const newExtra: ExtraClassSchedule = {
        ...extraData,
        id: `extra-${Date.now()}`,
        is_conducted: false,
      };
      setExtraClasses((prev) => [newExtra, ...prev]);
      const targetClass = classes.find((c) => c.id === extraData.class_id);
      const targetSub = subjects.find((s) => s.id === targetClass?.subject_id);
      addAnnouncement(
        `Compensatory Extra Class: ${targetSub?.name || 'Class'}`,
        `An extra lecture has been scheduled on ${extraData.date} (${extraData.start_time}–${extraData.end_time}) in ${extraData.room}. Topic: "${extraData.topic}".`,
        'ACADEMIC'
      );
    },
    [classes, subjects, addAnnouncement]
  );

  const cancelExtraClass = useCallback((id: string) => {
    setExtraClasses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const markExtraClassConducted = useCallback((id: string) => {
    setExtraClasses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_conducted: true } : c))
    );
  }, []);

  const resetToDefaultData = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <AttendanceContext.Provider
      value={{
        currentUser,
        currentRole,
        currentStudent,
        currentFaculty,
        switchUser,
        isAuthenticated,
        login,
        logout,
        users,
        departments,
        subjects,
        facultyList,
        students,
        classes,
        enrollments,
        sessions,
        activeSession,
        records,
        correctionRequests,
        leaveApplications,
        academicEvents,
        extraClasses,
        announcements,
        minAttendanceThreshold,
        setMinAttendanceThreshold,
        startAttendanceSession,
        rotateSessionToken,
        closeAttendanceSession,
        markAttendanceViaQR,
        markAttendanceViaFace,
        registerStudentFace,
        manualUpdateAttendance,
        submitCorrectionRequest,
        reviewCorrectionRequest,
        applyLeave,
        reviewLeave,
        addAnnouncement,
        addClass,
        updateClass,
        removeClass,
        bulkImportClasses,
        markBatchAttendance,
        importStudents,
        addStudent,
        removeStudent,
        addFaculty,
        removeFaculty,
        updateFaculty,
        addSubject,
        updateSubject,
        removeSubject,
        getStudentEnrolledClassIds,
        updateStudentEnrollments,
        allotFacultyToClass,
        addAcademicEvent,
        removeAcademicEvent,
        scheduleExtraClass,
        cancelExtraClass,
        markExtraClassConducted,
        getStudentStats,
        getClassEnrolledStudents,
        getSessionAttendanceMap,
        resetToDefaultData,
        getActiveSessionQRPayload,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
};

export const useAttendance = () => {
  const ctx = useContext(AttendanceContext);
  if (!ctx) {
    throw new Error('useAttendance must be used within AttendanceProvider');
  }
  return ctx;
};
