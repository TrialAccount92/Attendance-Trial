/**
 * Face measurement with face-api.js (@vladmandic/face-api).
 *
 * The browser only *measures* faces:
 *   detector (TinyFaceDetector, or SSD MobileNet v1 for accuracy)
 *   → 68 landmarks → ResNet-34 → 128-D descriptor.
 * Deciding who a face is, and whether it is a live person, happens on the
 * server (backend/app/face.py and liveness.py). Enrolled descriptors are never
 * sent to the browser.
 *
 * Head pose comes from the landmarks and mirrors backend/app/liveness.py:
 *   yaw  = (|nose − left jaw| − |nose − right jaw|) / face width   (left/right turn)
 *   roll = angle of the line between the eyes, in degrees           (sideways tilt)
 * Only "frontal" frames (|yaw| ≤ 0.25, |roll| ≤ 15°) are used for identity;
 * turned faces give unreliable descriptors. Liveness = the head visibly turns,
 * which a photo moved around in front of the camera cannot imitate.
 *
 * Models are served from /models (public/models), copied from the npm package.
 */
import type * as FaceApiModule from '@vladmandic/face-api';
import { FaceFrame } from '../types';

type FaceApi = typeof FaceApiModule;

export const FRONTAL_MAX_YAW = 0.25;
export const FRONTAL_MAX_ROLL_DEG = 15;
/** Enrollment: how far the head must turn to each side (server requires 0.15; we ask a bit more). */
export const ENROLL_TURN = 0.2;
/** Frontal samples captured before and after the head turns. */
export const ENROLL_FRONTAL_SAMPLES = 5;

export type DetectorKind = 'fast' | 'accurate';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceObservation {
  box: FaceBox; // pixels in the source frame
  score: number; // detection confidence 0-1
  points: number[][]; // 68 landmarks, pixels
  yaw: number;
  roll: number;
  frontal: boolean;
  descriptor: Float32Array | null;
}

export interface DetectOptions {
  detector?: DetectorKind;
  /** TinyFaceDetector input size: larger finds smaller (farther) faces but is slower. */
  inputSize?: 224 | 320 | 416 | 512 | 608;
  minScore?: number;
  maxFaces?: number;
  /** Skip the (expensive) descriptor step, e.g. while only tracking head pose. */
  withDescriptors?: boolean;
}

// ── Model loading ────────────────────────────────────────────────────────────

// face-api + TensorFlow.js are ~1.3 MB, so they are only downloaded when a
// face feature is first used.
let loadPromise: Promise<FaceApi> | null = null;
let loaded: FaceApi | null = null;

// The bundled tfjs types don't expose these, but the runtime does.
type TfRuntime = { ready: () => Promise<void>; getBackend: () => string };

function modelUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base === './' || !base ? '/' : base;
  return `${prefix.replace(/\/+$/, '')}/models`;
}

/** Loads face-api and its detector, landmark and recognition networks once. Rejects if they can't be loaded. */
export function loadFaceModels(): Promise<FaceApi> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await (faceapi.tf as unknown as TfRuntime).ready();
      const url = modelUrl();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.ssdMobilenetv1.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      loaded = faceapi;
      return faceapi;
    })().catch((err) => {
      loadPromise = null; // allow a retry
      throw new Error(`Face recognition models could not be loaded (${err instanceof Error ? err.message : err}).`);
    });
  }
  return loadPromise;
}

let warmPromise: Promise<void> | null = null;

/**
 * Runs every network once on a blank frame. The first real inference otherwise
 * stalls for seconds (GPU shader compilation), which would eat into the user's
 * enrollment steps or delay the first classroom frame.
 */
export function warmUpFaceModels(): Promise<void> {
  if (!warmPromise) {
    warmPromise = (async () => {
      const faceapi = await loadFaceModels();
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#888';
        ctx.fillRect(0, 0, c.width, c.height);
      }
      await faceapi.detectAllFaces(c, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
      await faceapi.detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 })).withFaceLandmarks();
      // Descriptor + landmark nets only run when a face is found, so run them directly too.
      await faceapi.computeFaceDescriptor(c);
      await faceapi.detectFaceLandmarks(c);
    })().catch(() => {
      warmPromise = null;
    });
  }
  return warmPromise;
}

export function faceBackendName(): string {
  try {
    return loaded ? (loaded.tf as unknown as TfRuntime).getBackend() || 'unknown' : 'not loaded';
  } catch {
    return 'unknown';
  }
}

// ── Head pose (keep in sync with backend/app/liveness.py) ────────────────────

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function yawOf(p: number[][]): number {
  const width = dist(p[0], p[16]);
  return width > 1e-6 ? (dist(p[30], p[0]) - dist(p[30], p[16])) / width : 0;
}

export function rollOf(p: number[][]): number {
  const mean = (from: number, to: number) => {
    let x = 0;
    let y = 0;
    for (let i = from; i < to; i++) {
      x += p[i][0];
      y += p[i][1];
    }
    return [x / (to - from), y / (to - from)];
  };
  const l = mean(36, 42);
  const r = mean(42, 48);
  return (Math.atan2(r[1] - l[1], r[0] - l[0]) * 180) / Math.PI;
}

export const isFrontal = (yaw: number, roll: number) =>
  Math.abs(yaw) <= FRONTAL_MAX_YAW && Math.abs(roll) <= FRONTAL_MAX_ROLL_DEG;

// ── Detection ────────────────────────────────────────────────────────────────

type FaceInput = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

function frameSize(input: FaceInput): { width: number; height: number } {
  if (input instanceof HTMLVideoElement) return { width: input.videoWidth, height: input.videoHeight };
  if (input instanceof HTMLImageElement) return { width: input.naturalWidth, height: input.naturalHeight };
  return { width: input.width, height: input.height };
}

function detectorOptions(faceapi: FaceApi, opts: DetectOptions) {
  const minScore = opts.minScore ?? 0.5;
  if (opts.detector === 'accurate') {
    return new faceapi.SsdMobilenetv1Options({ minConfidence: minScore, maxResults: opts.maxFaces ?? 100 });
  }
  return new faceapi.TinyFaceDetectorOptions({ inputSize: opts.inputSize ?? 416, scoreThreshold: minScore });
}

/** Detects every face in the frame with landmarks, head pose and (optionally) its descriptor. */
export async function detectFaces(input: FaceInput, opts: DetectOptions = {}): Promise<FaceObservation[]> {
  const faceapi = await loadFaceModels();
  const withLandmarks = faceapi.detectAllFaces(input, detectorOptions(faceapi, opts)).withFaceLandmarks();
  const results =
    opts.withDescriptors === false
      ? (await withLandmarks).map((r) => ({ ...r, descriptor: null }))
      : await withLandmarks.withFaceDescriptors();
  return results.slice(0, opts.maxFaces ?? 100).map((r) => {
    const points = r.landmarks.positions.map((q) => [q.x, q.y]);
    const yaw = yawOf(points);
    const roll = rollOf(points);
    return {
      box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
      score: r.detection.score,
      points,
      yaw,
      roll,
      frontal: isFrontal(yaw, roll),
      descriptor: (r.descriptor as Float32Array | null) ?? null,
    };
  });
}

/** Compact frame for the server: time, rounded landmarks, descriptor only when frontal. */
export function toFaceFrame(face: FaceObservation, t: number): FaceFrame {
  return {
    t: Math.round(t),
    p: face.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]),
    ...(face.frontal && face.descriptor ? { d: Array.from(face.descriptor, (v) => Math.round(v * 1e6) / 1e6) } : {}),
  };
}

export function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

// ── Guided enrollment with a liveness check ──────────────────────────────────

export type EnrollStep = 'center' | 'turn-first' | 'turn-second' | 'center-again' | 'done';

export interface EnrollProgress {
  step: EnrollStep;
  hint: string;
  /** 0..1 progress of the current step. */
  progress: number;
  yaw: number | null;
}

export interface EnrollmentResult {
  frames: FaceFrame[];
  photo: string;
}

export class EnrollmentError extends Error {}

const STEP_TIMEOUT_MS = 40000;
const MIN_FRAME_GAP_MS = 120;

/**
 * Guided capture: look straight (samples) → turn to one side → the other side
 * → look straight again. Every frame's landmarks are recorded so the server can
 * verify the head really turned (a photo can't). Descriptors are only taken on
 * front-facing frames.
 */
export async function captureLivenessEnrollment(
  video: HTMLVideoElement,
  onProgress: (p: EnrollProgress) => void,
  signal?: AbortSignal
): Promise<EnrollmentResult> {
  const frames: FaceFrame[] = [];
  const start = performance.now();
  let lastT = -Infinity;
  let photo = '';
  let frontalYaw = 0;
  let firstSide = 0; // -1 or +1 once the first turn is done
  const halfSamples = Math.ceil(ENROLL_FRONTAL_SAMPLES / 2);
  const steps: EnrollStep[] = ['center', 'turn-first', 'turn-second', 'center-again'];

  await warmUpFaceModels();
  for (const step of steps) {
    let stepStart = -1; // starts after the step's first processed frame
    let got = 0;
    for (;;) {
      if (signal?.aborted) throw new EnrollmentError('Enrollment cancelled.');
      if (stepStart >= 0 && performance.now() - stepStart > STEP_TIMEOUT_MS) {
        throw new EnrollmentError(
          step.startsWith('turn')
            ? 'Head turn not detected. Turn your head clearly to the side (like looking at a classmate), then back.'
            : 'Could not get a clear front-facing view. Face the camera in good light and try again.'
        );
      }
      const wantDescriptor = step === 'center' || step === 'center-again';
      const faces = await detectFaces(video, {
        detector: wantDescriptor ? 'accurate' : 'fast',
        inputSize: 320,
        minScore: 0.6,
        maxFaces: 3,
        withDescriptors: wantDescriptor,
      });
      if (stepStart < 0) stepStart = performance.now();
      const h = frameSize(video).height;
      let hint = '';
      if (faces.length === 0) hint = 'No face found — look at the camera in good light.';
      else if (faces.length > 1) hint = 'Only you should be in the frame.';
      else if (h && faces[0].box.height / h < 0.2) hint = 'Move closer to the camera.';

      if (!hint) {
        const face = faces[0];
        const t = performance.now() - start;
        if (t - lastT >= MIN_FRAME_GAP_MS) {
          frames.push(toFaceFrame(face, t));
          lastT = t;
        }
        if (step === 'center' || step === 'center-again') {
          if (face.frontal && face.descriptor) {
            got++;
            if (!photo) photo = cropThumbnail(video, face.box);
            if (step === 'center') frontalYaw = got === 1 ? face.yaw : (frontalYaw * (got - 1) + face.yaw) / got;
            hint = 'Hold still…';
          } else {
            hint = 'Look straight at the camera, head upright.';
          }
          const need = step === 'center' ? halfSamples : ENROLL_FRONTAL_SAMPLES - halfSamples;
          onProgress({ step, hint, progress: got / need, yaw: face.yaw });
          if (got >= need) break;
        } else {
          const offset = face.yaw - frontalYaw;
          const target = step === 'turn-first' ? 0 : -firstSide;
          const reached =
            step === 'turn-first' ? Math.abs(offset) >= ENROLL_TURN : Math.sign(offset) === target && Math.abs(offset) >= ENROLL_TURN;
          hint = step === 'turn-first' ? 'Slowly turn your head to one side…' : 'Now slowly turn to the other side…';
          const progress = step === 'turn-first' ? Math.abs(offset) / ENROLL_TURN : Math.max(0, offset * target) / ENROLL_TURN;
          onProgress({ step, hint, progress: Math.min(1, progress), yaw: face.yaw });
          if (reached) {
            if (step === 'turn-first') firstSide = Math.sign(offset);
            break;
          }
        }
      } else {
        onProgress({ step, hint, progress: 0, yaw: null });
      }
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  onProgress({ step: 'done', hint: 'Done.', progress: 1, yaw: null });
  // Keep within the server's limit (240 frames) while preserving the turns.
  const thinned = frames.length > 220 ? frames.filter((_, i) => i % Math.ceil(frames.length / 220) === 0 || frames[i].d) : frames;
  return { frames: thinned, photo };
}

/** Square JPEG thumbnail around a face box, as a data URL. */
export function cropThumbnail(source: FaceInput, box: FaceBox, size = 160): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const { width: srcW, height: srcH } = frameSize(source);
  const side = Math.min(Math.max(box.width, box.height) * 1.6, srcW, srcH);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = Math.max(0, Math.min(srcW - side, cx - side / 2));
  const sy = Math.max(0, Math.min(srcH - side, cy - side / 2));
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}
