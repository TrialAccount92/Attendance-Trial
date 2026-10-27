import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAttendance } from '../../context/AttendanceContext';
import { Camera, CheckCircle2, AlertTriangle, X, ShieldAlert, Upload, MapPin, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Html5Qrcode } from 'html5-qrcode';
import { soundEffects } from '../../utils/cameraZoomController';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const READER_ID = 'attendpulse-qr-reader';

function getPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => reject(new Error('Location permission is needed for this class. Allow it and scan again.')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ isOpen, onClose }) => {
  const { activeSession, classes, subjects, markAttendanceViaQR, currentStudent, getStudentStats } = useAttendance();

  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'on' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef<Promise<unknown> | null>(null);
  const handlingRef = useRef(false);

  const needsLocation = !!activeSession?.require_location;

  const stopCamera = useCallback(async () => {
    // Let a camera that is still starting finish first; stopping mid-start leaves it half-open.
    await startingRef.current?.catch(() => undefined);
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch {
        /* already stopped */
      }
    }
    setCameraState('idle');
  }, []);

  const submit = useCallback(
    async (payload: string) => {
      if (handlingRef.current) return;
      handlingRef.current = true;
      setSubmitting(true);
      await stopCamera();
      try {
        const coords = needsLocation ? await getPosition() : null;
        const res = await markAttendanceViaQR(payload, coords);
        setScanResult(res);
        if (res.success) {
          soundEffects.playSuccessChime();
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
      } catch (err) {
        setScanResult({ success: false, message: err instanceof Error ? err.message : 'Could not submit.' });
      } finally {
        setSubmitting(false);
        handlingRef.current = false;
      }
    },
    [markAttendanceViaQR, needsLocation, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraState('starting');
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      await stopCamera();
      const scanner = new Html5Qrcode(READER_ID, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      scannerRef.current = scanner;
      startingRef.current = scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (w, h) => {
            const side = Math.max(120, Math.floor(Math.min(w, h) * 0.7));
            return { width: side, height: side };
          },
        },
        (text) => void submit(text),
        () => undefined
      );
      await startingRef.current;
      startingRef.current = null;
      setCameraState('on');
    } catch (err) {
      startingRef.current = null;
      setCameraState('error');
      setCameraError(
        !window.isSecureContext
          ? 'The camera only works over HTTPS or on localhost. You can upload a photo of the QR code instead.'
          : `Camera unavailable (${err instanceof Error ? err.message : String(err)}). You can upload a photo of the QR code instead.`
      );
    }
  }, [stopCamera, submit]);

  // Keep the camera running whenever the scanner view is showing.
  useEffect(() => {
    if (isOpen && !scanResult && !submitting && cameraState === 'idle') void startCamera();
  }, [isOpen, scanResult, submitting, cameraState, startCamera]);

  useEffect(() => {
    if (!isOpen) {
      setScanResult(null);
      void stopCamera();
    }
  }, [isOpen, stopCamera]);

  useEffect(() => () => void stopCamera(), [stopCamera]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubmitting(true);
    let text: string | null = null;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await stopCamera();
      const reader = new Html5Qrcode(READER_ID, false);
      text = await reader.scanFile(file, false);
      reader.clear();
    } catch {
      setScanResult({ success: false, message: 'No QR code found in that image. Try again with a sharper photo.' });
      setSubmitting(false);
      return;
    }
    await submit(text);
  };

  if (!isOpen) return null;

  const targetClass = activeSession ? classes.find((c) => c.id === activeSession.class_id) : null;
  const targetSubject = targetClass ? subjects.find((s) => s.id === targetClass.subject_id) : null;
  const overall = currentStudent ? getStudentStats(currentStudent.id).overall : null;

  const close = () => {
    void stopCamera();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content" style={{ maxWidth: 480, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'var(--blue-50)', color: 'var(--blue-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--gray-900)' }}>Scan Attendance QR Code</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Point your camera at the code on the classroom screen</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {scanResult ? (
          <div
            className={`alert ${scanResult.success ? 'alert-success' : 'alert-danger'}`}
            style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.75rem 1.25rem', marginBottom: '1rem', borderRadius: 'var(--r-lg)' }}
          >
            {scanResult.success ? <CheckCircle2 size={40} style={{ marginBottom: '0.75rem' }} /> : <AlertTriangle size={40} style={{ marginBottom: '0.75rem' }} />}
            <div style={{ fontWeight: 800, fontSize: '1.125rem', marginBottom: '0.375rem' }}>
              {scanResult.success ? 'Attendance recorded' : 'Not recorded'}
            </div>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.5, margin: 0 }}>{scanResult.message}</p>
            {scanResult.success && overall && (
              <div style={{ marginTop: '1rem', fontSize: '0.8125rem', fontWeight: 600 }}>
                Overall attendance: <strong>{overall.percentage}%</strong>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1.25rem', width: '100%' }}>
              {scanResult.success ? (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={close}>
                  Done
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => setScanResult(null)}
                >
                  Scan again
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                minHeight: 260,
                background: '#090d16',
                borderRadius: 'var(--r-lg)',
                marginBottom: '0.75rem',
                overflow: 'hidden',
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div id={READER_ID} style={{ width: '100%' }} />
              {cameraState !== 'on' && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '1.25rem', textAlign: 'center', color: '#cbd5e1', fontSize: '0.8125rem' }}>
                  {submitting ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={18} /> Checking code…</span>
                  ) : cameraState === 'starting' ? (
                    'Starting camera…'
                  ) : cameraState === 'error' ? (
                    <div>
                      <div style={{ marginBottom: '0.75rem' }}>{cameraError}</div>
                      <button className="btn btn-secondary btn-sm" onClick={() => setCameraState('idle')}>Try camera again</button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <label className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: '1rem', cursor: 'pointer' }}>
              <Upload size={13} /> Upload a photo of the QR code instead
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
            </label>

            {activeSession ? (
              <div style={{ padding: '0.875rem 1rem', borderRadius: 'var(--r-md)', background: 'var(--blue-50)', border: '1px solid var(--blue-200)', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--blue-700)' }}>
                  <span className="pulse-indicator" /> Live now: {targetSubject?.name ?? 'Lecture'}
                </div>
                <div style={{ color: 'var(--gray-600)', marginTop: 2 }}>
                  Room {targetClass?.room} · Sem {targetClass?.semester} Div {targetClass?.division}
                  {activeSession.topic ? ` · ${activeSession.topic}` : ''}
                </div>
                {needsLocation && (
                  <div style={{ color: 'var(--blue-800)', marginTop: 4 }}>
                    <MapPin size={11} style={{ verticalAlign: 'middle' }} /> Your teacher requires a location check — allow location when asked.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '0.875rem 1rem', borderRadius: 'var(--r-md)', background: 'var(--amber-50)', border: '1px solid var(--amber-200)', fontSize: '0.8125rem', color: 'var(--amber-900)', display: 'flex', gap: 8 }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>None of your classes has an open attendance session right now. Your teacher shows the QR code during class.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
