import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { Camera, CheckCircle2, ShieldCheck, X, RefreshCw, AlertCircle, Info, UserCheck, ArrowLeftRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  captureLivenessEnrollment,
  EnrollProgress,
  EnrollmentResult,
  loadFaceModels,
  warmUpFaceModels,
} from '../../utils/faceRecognitionEngine';
import { errorMessage } from '../../api/client';
import { Student } from '../../types';

interface FaceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Enroll this student instead of the signed-in one (teachers enrolling from the scanner). */
  student?: Student | null;
  onEnrolled?: () => void;
}

type Phase = 'loading' | 'ready' | 'capturing' | 'review' | 'saving' | 'done';

const STEP_LABELS: Array<{ key: EnrollProgress['step']; label: string }> = [
  { key: 'center', label: 'Look straight' },
  { key: 'turn-first', label: 'Turn one way' },
  { key: 'turn-second', label: 'Turn the other way' },
  { key: 'center-again', label: 'Look straight' },
];

export const FaceEnrollmentModal: React.FC<FaceEnrollmentModalProps> = ({ isOpen, onClose, student, onEnrolled }) => {
  const { currentStudent, registerStudentFace } = useAttendance();
  const target = student ?? currentStudent;
  const forSomeoneElse = !!student && student.id !== currentStudent?.id;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [progress, setProgress] = useState<EnrollProgress | null>(null);
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError(
        window.isSecureContext
          ? 'Camera unavailable or permission denied. Allow camera access and try again.'
          : 'The camera only works over HTTPS or on localhost. Open the portal over HTTPS to enroll.'
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPhase('loading');
    setResult(null);
    setError(null);
    setProgress(null);
    (async () => {
      try {
        await Promise.all([loadFaceModels().then(() => warmUpFaceModels()), startCamera()]);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
      if (!cancelled) setPhase('ready');
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // The <video> is unmounted while reviewing; re-attach the stream when it comes back.
  useEffect(() => {
    const video = videoRef.current;
    if (isOpen && (phase === 'ready' || phase === 'capturing') && video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => undefined);
    }
  }, [isOpen, phase]);

  if (!isOpen || !target) return null;

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setPhase('capturing');
    abortRef.current = new AbortController();
    try {
      const res = await captureLivenessEnrollment(video, setProgress, abortRef.current.signal);
      setResult(res);
      setPhase('review');
    } catch (err) {
      setError(errorMessage(err));
      setPhase('ready');
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setPhase('saving');
    setError(null);
    try {
      await registerStudentFace(target.id, result.frames, result.photo);
      stopCamera();
      setPhase('done');
      onEnrolled?.();
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } catch (err) {
      setError(errorMessage(err));
      setPhase('review');
    }
  };

  const retake = () => {
    setResult(null);
    setProgress(null);
    setPhase('ready');
    if (!streamRef.current) void startCamera();
  };

  const busy = phase === 'loading' || phase === 'capturing' || phase === 'saving';
  const stepIndex = progress ? STEP_LABELS.findIndex((s) => s.key === progress.step) : -1;
  const turning = progress?.step === 'turn-first' || progress?.step === 'turn-second';

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} style={{ zIndex: 300 }}>
      <div className="modal-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, var(--brand-light), #e0f2fe)',
                color: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-heading)' }}>
                {forSomeoneElse ? `Enroll ${target.name}'s face` : 'Face Enrollment'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {target.name} · {target.enrollment_number}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {phase === 'done' ? (
          <div className="alert alert-success" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.5rem' }}>
            <CheckCircle2 size={44} style={{ color: 'var(--green)', marginBottom: '0.75rem' }} />
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.375rem' }}>Face profile saved</div>
            <p style={{ fontSize: '0.8125rem', opacity: 0.9 }}>
              {forSomeoneElse ? `${target.name} can now be recognised` : 'You can now be recognised'} by classroom
              cameras. In class, glance at the camera and turn your head a little when your teacher asks.
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            {target.face_registered && phase !== 'review' && phase !== 'saving' && (
              <div className="alert alert-info" style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.75rem' }}>
                <Info size={14} style={{ flexShrink: 0 }} />
                <span>A face profile already exists. Enrolling again replaces it.</span>
              </div>
            )}

            {/* Step indicator */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: '0.625rem' }}>
              {STEP_LABELS.map((s, i) => {
                const done = phase === 'review' || phase === 'saving' || i < stepIndex;
                const active = phase === 'capturing' && i === stepIndex;
                return (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 3,
                        background: done ? '#22c55e' : active ? '#93c5fd' : 'var(--gray-200, #e5e7eb)',
                        overflow: 'hidden',
                      }}
                    >
                      {active && (
                        <div style={{ width: `${Math.round((progress?.progress ?? 0) * 100)}%`, height: '100%', background: '#2563eb', transition: 'width 0.15s' }} />
                      )}
                    </div>
                    <div style={{ fontSize: '0.6875rem', marginTop: 3, color: active ? 'var(--text-heading)' : 'var(--text-muted)', fontWeight: active ? 700 : 500 }}>
                      {s.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                height: 280,
                background: '#090d16',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
                border: '1px solid var(--border)',
              }}
            >
              {phase === 'review' || phase === 'saving' ? (
                result && (
                  <img
                    src={result.photo}
                    alt="Captured face"
                    style={{ width: 200, height: 200, borderRadius: '50%', objectFit: 'cover', border: '3px solid #22c55e' }}
                  />
                )
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      width: 165,
                      height: 210,
                      borderRadius: '50%',
                      border: `3px ${phase === 'capturing' ? 'solid' : 'dashed'} ${phase === 'capturing' ? '#22c55e' : '#38bdf8'}`,
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                      pointerEvents: 'none',
                    }}
                  />
                  {turning && (
                    <ArrowLeftRight size={40} color="#fff" style={{ position: 'absolute', top: 14, opacity: 0.9 }} />
                  )}
                  {cameraError && (
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '1.5rem', textAlign: 'center', color: '#e2e8f0', fontSize: '0.8125rem', background: '#090d16' }}>
                      {cameraError}
                    </div>
                  )}
                </>
              )}
              {!cameraError && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, textAlign: 'center', color: '#fff', fontSize: '0.8125rem', fontWeight: 700 }}>
                  <span style={{ background: 'rgba(0, 0, 0, 0.65)', padding: '4px 12px', borderRadius: 12 }}>
                    {phase === 'loading'
                      ? 'Loading face models…'
                      : phase === 'capturing'
                        ? progress?.hint ?? 'Starting…'
                        : phase === 'review' || phase === 'saving'
                          ? 'Capture complete'
                          : 'Press Start, then follow the prompts'}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div className="alert alert-danger" style={{ fontSize: '0.8125rem', padding: '0.625rem 0.75rem', marginBottom: '0.75rem' }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="alert alert-info" style={{ fontSize: '0.75rem', padding: '0.625rem 0.875rem', marginBottom: '1rem' }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              <span>
                You'll look straight at the camera, slowly turn your head to each side, then look straight again (about 10
                seconds). The head turn proves it's a real person, not a photo. Only numeric face signatures and a small
                thumbnail are stored, on the college server.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(phase === 'review' || phase === 'saving') && (
                <button className="btn btn-secondary" onClick={retake} disabled={phase === 'saving'}>
                  <RefreshCw size={14} /> Retake
                </button>
              )}
              <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              {phase === 'review' || phase === 'saving' ? (
                <button className="btn btn-primary" disabled={phase !== 'review'} onClick={handleSave}>
                  <UserCheck size={14} />
                  {phase === 'saving' ? 'Verifying…' : 'Save face profile'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleCapture} disabled={phase !== 'ready' || !!cameraError}>
                  <Camera size={14} /> {phase === 'capturing' ? 'Capturing…' : 'Start'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
