import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Camera, Play, Pause, RotateCw, Sparkles, CheckCircle2,
  Users, Radio, Layers, Volume2, VolumeX, Eye, Compass,
  Activity, ShieldCheck, UserCheck, RefreshCw, AlertTriangle
} from 'lucide-react';
import { useAttendance } from '../../context/AttendanceContext';
import { CollegeClass, Student } from '../../types';
import { soundEffects } from '../../utils/cameraZoomController';
import confetti from 'canvas-confetti';

interface VirtualClassroomEnvironmentProps {
  targetClass: CollegeClass;
  onClose?: () => void;
}

interface VirtualSeat {
  id: string;
  studentId: string;
  name: string;
  rollNumber: string;
  avatar: string;
  row: 'FRONT' | 'MID' | 'BACK' | 'WING';
  distance: number; // in meters from central camera
  angle: number; // 0 to 360 degrees around camera
  x: number; // percentage in arena
  y: number; // percentage in arena
}

export const VirtualClassroomEnvironment: React.FC<VirtualClassroomEnvironmentProps> = ({
  targetClass,
  onClose,
}) => {
  const {
    students,
    activeSession,
    startAttendanceSession,
    records,
    markAttendanceViaFace,
  } = useAttendance();

  // Camera State
  const [isSweeping, setIsSweeping] = useState<boolean>(true);
  const [cameraAngle, setCameraAngle] = useState<number>(0); // 0 to 360 degrees
  const [sweepSpeed, setSweepSpeed] = useState<number>(1); // 1x, 2x, 4x
  const [fovWidth, setFovWidth] = useState<number>(65); // degrees field of view
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);

  // Verification logs
  const [verificationLog, setVerificationLog] = useState<Array<{
    name: string;
    roll: string;
    distance: number;
    time: string;
    confidence: number;
    row: string;
  }>>([]);

  // Students enrolled in this class
  const classStudents = useMemo(() => {
    return students.filter(
      (s) => s.semester === targetClass.semester && s.division === targetClass.division
    );
  }, [students, targetClass]);

  // Ensure active attendance session exists
  useEffect(() => {
    if (!activeSession || activeSession.class_id !== targetClass.id) {
      startAttendanceSession(targetClass.id, '360° Smart Classroom AI Attendance');
    }
  }, [activeSession, targetClass, startAttendanceSession]);

  // Compute present students
  const presentStudentIds = useMemo(() => {
    if (!activeSession) return new Set<string>();
    return new Set(
      records
        .filter((r) => r.class_id === targetClass.id && (r.status === 'PRESENT' || r.status === 'LATE'))
        .map((r) => r.student_id)
    );
  }, [records, targetClass, activeSession]);

  // Seat layout around central camera
  const seats: VirtualSeat[] = useMemo(() => {
    const list: VirtualSeat[] = [];
    const pool = classStudents.length > 0 ? classStudents : students;

    // Define positions around the camera (center at x=50, y=45)
    const positions = [
      // FRONT ROW (Curved around front of camera, 1.8m - 2.2m)
      { row: 'FRONT' as const, distance: 1.8, angle: 160, x: 28, y: 38 },
      { row: 'FRONT' as const, distance: 1.9, angle: 180, x: 50, y: 40 },
      { row: 'FRONT' as const, distance: 2.1, angle: 200, x: 72, y: 38 },

      // MIDDLE ROW (Wider arc, 3.8m - 4.4m)
      { row: 'MID' as const, distance: 4.0, angle: 140, x: 18, y: 58 },
      { row: 'MID' as const, distance: 4.2, angle: 165, x: 38, y: 62 },
      { row: 'MID' as const, distance: 4.1, angle: 195, x: 62, y: 62 },
      { row: 'MID' as const, distance: 4.3, angle: 220, x: 82, y: 58 },

      // BACK ROW (Elevated tier, 6.8m - 7.5m)
      { row: 'BACK' as const, distance: 7.0, angle: 135, x: 12, y: 82 },
      { row: 'BACK' as const, distance: 7.2, angle: 155, x: 32, y: 85 },
      { row: 'BACK' as const, distance: 7.4, angle: 180, x: 50, y: 87 },
      { row: 'BACK' as const, distance: 7.3, angle: 205, x: 68, y: 85 },
      { row: 'BACK' as const, distance: 7.1, angle: 225, x: 88, y: 82 },

      // SIDE WINGS (Surrounding camera sides and lecture perimeter)
      { row: 'WING' as const, distance: 5.2, angle: 90, x: 14, y: 22 },
      { row: 'WING' as const, distance: 5.5, angle: 270, x: 86, y: 22 },
    ];

    positions.forEach((pos, idx) => {
      const stu = pool[idx % pool.length];
      list.push({
        id: `seat-${idx}`,
        studentId: stu.id,
        name: stu.name,
        rollNumber: stu.roll_number,
        avatar: stu.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        row: pos.row,
        distance: pos.distance,
        angle: pos.angle,
        x: pos.x,
        y: pos.y,
      });
    });

    return list;
  }, [classStudents, students]);

  // Mark attendance helper
  const verifyStudent = useCallback((seat: VirtualSeat) => {
    if (presentStudentIds.has(seat.studentId)) return;

    const conf = 0.94 + Math.round((Math.random() * 0.05) * 100) / 100;
    const res = markAttendanceViaFace(targetClass.id, seat.studentId, conf, activeSession?.id);

    if (res.success && !res.alreadyMarked) {
      if (soundEnabled) soundEffects.playSuccessChime();
      confetti({
        particleCount: 35,
        spread: 45,
        origin: { x: seat.x / 100, y: seat.y / 100 },
        colors: ['#10b981', '#38bdf8', '#6366f1'],
      });

      setVerificationLog((prev) => [
        {
          name: seat.name,
          roll: seat.rollNumber,
          distance: seat.distance,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          confidence: Math.round(conf * 100),
          row: seat.row,
        },
        ...prev.slice(0, 9),
      ]);
    }
  }, [presentStudentIds, markAttendanceViaFace, targetClass, activeSession, soundEnabled]);

  // Instant 360° Panoramic Scan (Identifies ALL students in the room simultaneously)
  const handleScanAllInstantly = useCallback(() => {
    seats.forEach((seat, index) => {
      setTimeout(() => {
        verifyStudent(seat);
      }, index * 140);
    });
  }, [seats, verifyStudent]);

  // 360° Camera Sweep Animation Loop
  useEffect(() => {
    if (!isSweeping) return;

    const interval = setInterval(() => {
      setCameraAngle((prev) => {
        const next = (prev + 1.2 * sweepSpeed) % 360;

        // Check if camera cone is currently intersecting any unmarked seat
        seats.forEach((seat) => {
          if (!presentStudentIds.has(seat.studentId)) {
            // Angle difference with wrapping
            let diff = Math.abs(next - seat.angle);
            if (diff > 180) diff = 360 - diff;

            // If within camera's cone of view, lock and verify
            if (diff <= fovWidth / 2) {
              verifyStudent(seat);
            }
          }
        });

        return next;
      });
    }, 45);

    return () => clearInterval(interval);
  }, [isSweeping, sweepSpeed, seats, presentStudentIds, fovWidth, verifyStudent]);

  const presentCount = seats.filter((s) => presentStudentIds.has(s.studentId)).length;
  const attendanceRate = seats.length > 0 ? Math.round((presentCount / seats.length) * 100) : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 640,
        background: '#090d16',
        color: '#f8fafc',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top Telemetry & Control Banner */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(37,99,235,0.4)',
            }}
          >
            <Camera size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              Smart Classroom 360° AI Camera
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  background: isSweeping ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: isSweeping ? '#34d399' : '#f87171',
                  border: `1px solid ${isSweeping ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  padding: '1px 8px',
                  borderRadius: '9999px',
                }}
              >
                {isSweeping ? '● LIVE SWEEPING' : '❚❚ SWEEP PAUSED'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Multi-Person Optical Biometrics · Class {targetClass.division} · Room {targetClass.room}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Play / Pause Sweep */}
          <button
            onClick={() => setIsSweeping(!isSweeping)}
            className="btn btn-sm"
            style={{
              background: isSweeping ? '#e11d48' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: '8px',
              padding: '0.4rem 0.85rem',
              cursor: 'pointer',
            }}
          >
            {isSweeping ? <Pause size={14} /> : <Play size={14} />}
            <span>{isSweeping ? 'Pause Sweep' : 'Resume Sweep'}</span>
          </button>

          {/* Instant 360° Panoramic Scan All */}
          <button
            onClick={handleScanAllInstantly}
            className="btn btn-sm"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: '8px',
              padding: '0.4rem 0.85rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
            }}
            title="Scan and mark all people in the room simultaneously"
          >
            <Sparkles size={14} />
            <span>Scan All People Instantly</span>
          </button>

          {/* Sweep Speed Selector */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}
          >
            {[1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setSweepSpeed(spd)}
                style={{
                  background: sweepSpeed === spd ? '#3b82f6' : 'transparent',
                  color: sweepSpeed === spd ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.35rem 0.6rem',
                  cursor: 'pointer',
                }}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: soundEnabled ? '#38bdf8' : '#64748b',
              padding: '0.4rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title={soundEnabled ? 'Mute Audio Chimes' : 'Enable Audio Feedback'}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {/* Main Dual Split Layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', minHeight: 0 }}>
        {/* Left Arena: The 360° Virtual Classroom Studio */}
        <div
          style={{
            position: 'relative',
            background: 'radial-gradient(circle at 50% 45%, #131d33 0%, #090e1a 100%)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 520,
          }}
        >
          {/* Spatial Grid Pattern Background */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.15,
              backgroundImage: 'radial-gradient(rgba(56, 189, 248, 0.3) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Concentric Distance Rings (Range Markers from Camera at x=50, y=45) */}
          {[
            { label: 'Front Row · 2.0m', radius: '28%', color: 'rgba(56, 189, 248, 0.25)' },
            { label: 'Middle Row · 4.2m', radius: '55%', color: 'rgba(99, 102, 241, 0.2)' },
            { label: 'Back Row · 7.2m', radius: '85%', color: 'rgba(168, 85, 247, 0.15)' },
          ].map((ring, idx) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: '50%',
                top: '45%',
                width: ring.radius,
                height: ring.radius,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                border: `1px dashed ${ring.color}`,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -9,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#090e1a',
                  padding: '1px 8px',
                  borderRadius: '9999px',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.04em',
                }}
              >
                {ring.label}
              </span>
            </div>
          ))}

          {/* Central AI Camera (Focal Center at 50%, 45%) */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '45%',
              transform: 'translate(-50%, -50%)',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {/* The Rotating Light Scan Cone (FOV Beam) */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 480,
                height: 480,
                transform: `translate(-50%, -50%) rotate(${cameraAngle}deg)`,
                pointerEvents: 'none',
                transition: 'transform 0.05s linear',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'conic-gradient(from -32.5deg at 50% 50%, rgba(56, 189, 248, 0.35) 0deg, rgba(56, 189, 248, 0) 65deg, transparent 65deg)',
                  filter: 'blur(3px)',
                }}
              />
            </div>

            {/* Central Camera Base */}
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                border: '3px solid #38bdf8',
                boxShadow: '0 0 25px rgba(56, 189, 248, 0.6), inset 0 0 10px rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {/* Internal camera lens rotating with camera angle */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, #0284c7 0%, #0369a1 70%, #075985 100%)',
                  boxShadow: '0 0 12px #38bdf8',
                  transform: `rotate(${cameraAngle}deg)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Optical lens pointer aperture */}
                <div
                  style={{
                    width: 6,
                    height: 14,
                    background: '#ffffff',
                    borderRadius: '2px',
                    boxShadow: '0 0 6px #ffffff',
                    transform: 'translateY(-6px)',
                  }}
                />
              </div>

              {/* Pulsing surround ping */}
              <div
                style={{
                  position: 'absolute',
                  inset: -6,
                  borderRadius: '50%',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  animation: 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                }}
              />
            </div>

            {/* Camera Label Banner */}
            <div
              style={{
                marginTop: 8,
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '2px 10px',
                borderRadius: '9999px',
                fontSize: '0.6875rem',
                fontWeight: 800,
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              <Compass size={11} />
              <span>360° AI Camera: {Math.round(cameraAngle)}°</span>
            </div>
          </div>

          {/* Virtual Students Seated in the Room Around the Camera */}
          {seats.map((seat) => {
            const isPresent = presentStudentIds.has(seat.studentId);
            const isSelected = selectedSeatId === seat.id;

            // Calculate if currently in the camera's FOV cone
            let angleDiff = Math.abs(cameraAngle - seat.angle);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;
            const isInBeam = angleDiff <= fovWidth / 2;

            return (
              <div
                key={seat.id}
                onClick={() => {
                  setSelectedSeatId(seat.id);
                  verifyStudent(seat);
                }}
                style={{
                  position: 'absolute',
                  left: `${seat.x}%`,
                  top: `${seat.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isSelected ? 15 : 10,
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
                title={`Click to focus on ${seat.name}`}
              >
                {/* Optical HUD Target Brackets when scanned or in beam */}
                {(isInBeam || isSelected) && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: -14,
                      border: `2px solid ${isPresent ? '#10b981' : '#38bdf8'}`,
                      borderRadius: '10px',
                      pointerEvents: 'none',
                      animation: 'pulse 1.2s infinite',
                      boxShadow: `0 0 16px ${isPresent ? 'rgba(16, 185, 129, 0.6)' : 'rgba(56, 189, 248, 0.5)'}`,
                    }}
                  >
                    {/* Corner Reticle Marks */}
                    <div style={{ position: 'absolute', top: -3, left: -3, width: 8, height: 8, borderTop: '2px solid #ffffff', borderLeft: '2px solid #ffffff' }} />
                    <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderTop: '2px solid #ffffff', borderRight: '2px solid #ffffff' }} />
                    <div style={{ position: 'absolute', bottom: -3, left: -3, width: 8, height: 8, borderBottom: '2px solid #ffffff', borderLeft: '2px solid #ffffff' }} />
                    <div style={{ position: 'absolute', bottom: -3, right: -3, width: 8, height: 8, borderBottom: '2px solid #ffffff', borderRight: '2px solid #ffffff' }} />
                  </div>
                )}

                {/* Student Avatar Pod */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: seat.row === 'FRONT' ? 52 : seat.row === 'MID' ? 44 : 38,
                      height: seat.row === 'FRONT' ? 52 : seat.row === 'MID' ? 44 : 38,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: `2.5px solid ${isPresent ? '#10b981' : isInBeam ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)'}`,
                      boxShadow: isPresent
                        ? '0 0 16px rgba(16, 185, 129, 0.7)'
                        : isInBeam
                        ? '0 0 14px rgba(56, 189, 248, 0.6)'
                        : '0 4px 10px rgba(0,0,0,0.5)',
                      background: '#1e293b',
                      position: 'relative',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  >
                    <img
                      src={seat.avatar}
                      alt={seat.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {/* Verified Green Check badge */}
                    {isPresent && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: '#10b981',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          boxShadow: '0 0 6px #10b981',
                        }}
                      >
                        <CheckCircle2 size={12} />
                      </div>
                    )}
                  </div>

                  {/* Student Name Pill */}
                  <div
                    style={{
                      marginTop: 4,
                      background: isPresent ? 'rgba(6, 78, 59, 0.95)' : 'rgba(15, 23, 42, 0.9)',
                      border: `1px solid ${isPresent ? '#10b981' : 'rgba(255,255,255,0.15)'}`,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                  >
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#ffffff' }}>
                      {seat.name}
                    </div>
                    <div
                      style={{
                        fontSize: '0.58rem',
                        color: isPresent ? '#6ee7b7' : '#94a3b8',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                      }}
                    >
                      <span>Roll {seat.rollNumber}</span>
                      <span>•</span>
                      <span>{seat.distance}m</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Telemetry & Real-Time Roster Drawer */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            overflowY: 'auto',
          }}
        >
          {/* Attendance Metric Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(16, 185, 129, 0.15))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Class Attendance
              </span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                {attendanceRate}%
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 9999, overflow: 'hidden', marginBottom: 8 }}>
              <div
                style={{
                  width: `${attendanceRate}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #38bdf8, #10b981)',
                  borderRadius: 9999,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78125rem', color: '#cbd5e1' }}>
              <span>Verified Present:</span>
              <strong style={{ color: '#10b981' }}>{presentCount} / {seats.length} Students</strong>
            </div>
          </div>

          {/* Seat Status Breakdown */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Spatial Seating Zones
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {[
                { label: 'Front Row (2.0m)', count: seats.filter((s) => s.row === 'FRONT' && presentStudentIds.has(s.studentId)).length, total: seats.filter((s) => s.row === 'FRONT').length, color: '#38bdf8' },
                { label: 'Middle Row (4.2m)', count: seats.filter((s) => s.row === 'MID' && presentStudentIds.has(s.studentId)).length, total: seats.filter((s) => s.row === 'MID').length, color: '#818cf8' },
                { label: 'Back Row (7.2m)', count: seats.filter((s) => s.row === 'BACK' && presentStudentIds.has(s.studentId)).length, total: seats.filter((s) => s.row === 'BACK').length, color: '#c084fc' },
                { label: 'Side Wings (5.2m)', count: seats.filter((s) => s.row === 'WING' && presentStudentIds.has(s.studentId)).length, total: seats.filter((s) => s.row === 'WING').length, color: '#34d399' },
              ].map((zone, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '0.5rem 0.625rem',
                  }}
                >
                  <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{zone.label}</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: zone.color, marginTop: 2 }}>
                    {zone.count} / {zone.total}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Verification Activity Stream */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={12} color="#10b981" />
              <span>Real-Time Biometric Verifications</span>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                minHeight: 180,
              }}
            >
              {verificationLog.length === 0 ? (
                <div
                  style={{
                    padding: '1.5rem',
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    border: '1px dashed rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                  }}
                >
                  Camera is sweeping... Detected students will appear here as they are verified.
                </div>
              ) : (
                verificationLog.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.625rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>
                        {log.name} ({log.roll})
                      </div>
                      <div style={{ fontSize: '0.625rem', color: '#94a3b8' }}>
                        {log.row} Row · {log.distance}m · {log.confidence}% Match
                      </div>
                    </div>
                    <span style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 700 }}>
                      ✓ {log.time}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
