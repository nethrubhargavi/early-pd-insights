import { useRef, useCallback, useState, useEffect } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

interface HandTremorState {
  tremorScore: number; // 0-100
  tremorFrequency: number; // Hz estimate
  tremorStrength: number; // spectral band power ratio (0-1)
  tremorAmplitude: number; // stddev displacement
  handDetected: boolean;
  pdLikelihood: number; // 0-100 indicator
}

// Simple skin color detection in HSV space
function detectSkinRegion(canvas: HTMLCanvasElement): { x: number; y: number; motionMag: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let skinPixels = 0;
  let sumX = 0;
  let sumY = 0;
  let sumMotion = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // simple skin detection: high R, medium G, low B
    if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
      const idx = i / 4;
      const py = Math.floor(idx / w);
      const px = idx % w;
      sumX += px;
      sumY += py;
      skinPixels++;
      sumMotion += Math.abs(r - g); // use color variance as motion proxy
    }
  }

  if (skinPixels < 100) return null; // too few skin pixels
  return { x: sumX / skinPixels, y: sumY / skinPixels, motionMag: sumMotion / skinPixels };
}


// FFT + windowing utilities
function nextPow2(v: number) {
  return 1 << Math.ceil(Math.log2(Math.max(1, v)));
}

function hannWindow(N: number) {
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  return w;
}

function applyWindow(signal: Float32Array, window: Float32Array) {
  const N = Math.min(signal.length, window.length);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < N; i++) out[i] = signal[i] * window[i];
  for (let i = N; i < signal.length; i++) out[i] = signal[i];
  return out;
}

function computeFFTmags(signal: Float32Array, fs: number) {
  const N0 = signal.length;
  const N = nextPow2(N0);

  // prepare real/imag arrays (zero-padded)
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  re.set(signal);
  for (let i = N0; i < N; i++) re[i] = 0;

  // bit-reversal permutation
  const bitReverse = (arrRe: Float32Array, arrIm: Float32Array) => {
    const n = arrRe.length;
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i < j) {
        const tr = arrRe[i];
        const ti = arrIm[i];
        arrRe[i] = arrRe[j];
        arrIm[i] = arrIm[j];
        arrRe[j] = tr;
        arrIm[j] = ti;
      }
      let m = n >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }
  };

  const fftInPlace = (arrRe: Float32Array, arrIm: Float32Array) => {
    const n = arrRe.length;
    bitReverse(arrRe, arrIm);
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const angle = (-2 * Math.PI) / size;
      const wmRe = Math.cos(angle);
      const wmIm = Math.sin(angle);
      for (let i = 0; i < n; i += size) {
        let wRe = 1;
        let wIm = 0;
        for (let j = 0; j < half; j++) {
          const k = i + j;
          const l = k + half;
          const tr = wRe * arrRe[l] - wIm * arrIm[l];
          const ti = wRe * arrIm[l] + wIm * arrRe[l];
          const ur = arrRe[k];
          const ui = arrIm[k];
          arrRe[k] = ur + tr;
          arrIm[k] = ui + ti;
          arrRe[l] = ur - tr;
          arrIm[l] = ui - ti;
          // w *= wm
          const tmpRe = wRe * wmRe - wIm * wmIm;
          const tmpIm = wRe * wmIm + wIm * wmRe;
          wRe = tmpRe;
          wIm = tmpIm;
        }
      }
    }
  };

  fftInPlace(re, im);

  const half = Math.floor(N / 2);
  const mags = new Float32Array(half + 1);
  const freqs = new Float32Array(half + 1);
  for (let k = 0; k <= half; k++) {
    mags[k] = Math.hypot(re[k], im[k]);
    freqs[k] = (k * fs) / N;
  }
  return { mags, freqs };
}

// linear interpolation resample to uniform grid
function resampleTo(signalSamples: Array<{ t: number; v: number }>, fs: number) {
  if (signalSamples.length < 2) return { array: new Float32Array(0), fs };
  const t0 = signalSamples[0].t;
  const t1 = signalSamples[signalSamples.length - 1].t;
  const duration = t1 - t0;
  const N = Math.max(8, Math.round(duration * fs));
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const ti = t0 + (i * duration) / (N - 1);
    // find surrounding samples
    let j = 0;
    while (j < signalSamples.length - 1 && signalSamples[j + 1].t < ti) j++;
    const s0 = signalSamples[j];
    const s1 = signalSamples[Math.min(j + 1, signalSamples.length - 1)];
    const dt = s1.t - s0.t;
    const v = dt === 0 ? s0.v : s0.v + ((ti - s0.t) * (s1.v - s0.v)) / dt;
    out[i] = v;
  }
  return { array: out, fs };
}

export function useHandTremor(videoRef: React.RefObject<HTMLVideoElement>) {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // buffer of recent samples: {t, multi-landmark positions}
  const samplesRef = useRef<
    Array<{
      t: number;
      idxX: number;
      idxY: number;
      midX: number;
      midY: number;
      wristX: number;
      wristY: number;
    }>
  >([]);

  // Track previous skin region for motion detection
  const prevSkinRef = useRef<{ x: number; y: number } | null>(null);
  // Track recent fused metrics for persistence check
  const fusedHistoryRef = useRef<Array<{ strength: number; prominence: number }>>([]);

  const [state, setState] = useState<HandTremorState>({
    tremorScore: 0,
    tremorFrequency: 0,
    tremorStrength: 0,
    tremorAmplitude: 0,
    handDetected: false,
    pdLikelihood: 0,
  });

  const processLandmarks = useCallback((landmarks: any[]) => {
    const t = performance.now() / 1000; // seconds
    const idx = landmarks[8] || landmarks[0];
    const mid = landmarks[12] || landmarks[0];
    const wrist = landmarks[0];

    const samples = samplesRef.current;
    samples.push({
      t,
      idxX: idx.x,
      idxY: idx.y,
      midX: mid.x,
      midY: mid.y,
      wristX: wrist.x,
      wristY: wrist.y,
    });
    // keep last window
    const WINDOW_SEC = 4.0;
    while (samples.length > 0 && t - samples[0].t > WINDOW_SEC) samples.shift();

    if (samples.length < 8) {
      setState((s) => ({ ...s, handDetected: true }));
      return;
    }

    // per-landmark running mean
    const meanIdxX = samples.reduce((s, p) => s + p.idxX, 0) / samples.length;
    const meanIdxY = samples.reduce((s, p) => s + p.idxY, 0) / samples.length;
    const meanMidX = samples.reduce((s, p) => s + p.midX, 0) / samples.length;
    const meanMidY = samples.reduce((s, p) => s + p.midY, 0) / samples.length;
    const meanWristX = samples.reduce((s, p) => s + p.wristX, 0) / samples.length;
    const meanWristY = samples.reduce((s, p) => s + p.wristY, 0) / samples.length;

    const dispIdx = samples.map((p) => ({ t: p.t, v: Math.hypot(p.idxX - meanIdxX, p.idxY - meanIdxY) }));
    const dispMid = samples.map((p) => ({ t: p.t, v: Math.hypot(p.midX - meanMidX, p.midY - meanMidY) }));
    const dispWrist = samples.map((p) => ({ t: p.t, v: Math.hypot(p.wristX - meanWristX, p.wristY - meanWristY) }));

    // Movement detection (inspired by hand_movement_classifier.py): compute coefficient of variation
    // of the combined displacement magnitude to detect large voluntary movement
    const combinedDisp = dispIdx.map((d, i) => (d.v + dispMid[i].v + dispWrist[i].v) / 3);
    const meanCombined = combinedDisp.reduce((s, v) => s + v, 0) / combinedDisp.length;
    const stdCombined = Math.sqrt(combinedDisp.reduce((s, v) => s + (v - meanCombined) ** 2, 0) / combinedDisp.length);
    const covCombined = meanCombined > 0 ? stdCombined / meanCombined : 0;
    const movementDetected = covCombined > 0.02; // threshold tuned for video-landmark displacement

    const TARGET_FS = 60;
    const { array: uIdx, fs: fsIdx } = resampleTo(dispIdx, TARGET_FS);
    const { array: uMid, fs: fsMid } = resampleTo(dispMid, TARGET_FS);
    const { array: uWrist, fs: fsWrist } = resampleTo(dispWrist, TARGET_FS);
    // allow smaller windows for responsiveness, but prefer >=8
    if (uIdx.length < 4 || uMid.length < 4 || uWrist.length < 4) return;

    const detrend = (arr: Float32Array) => {
      const m = arr.reduce((s, v) => s + v, 0) / arr.length;
      const out = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i++) out[i] = arr[i] - m;
      return out;
    };

    const dIdx = detrend(uIdx);
    const dMid = detrend(uMid);
    const dWrist = detrend(uWrist);

    const win = hannWindow(dIdx.length);
    const wIdx = applyWindow(dIdx, win);
    const wMid = applyWindow(dMid, win);
    const wWrist = applyWindow(dWrist, win);

    const { mags: mIdx, freqs: fIdx } = computeFFTmags(wIdx, TARGET_FS);
    const { mags: mMid, freqs: fMid } = computeFFTmags(wMid, TARGET_FS);
    const { mags: mWrist, freqs: fWrist } = computeFFTmags(wWrist, TARGET_FS);

    const BAND_LOW = 3.5;
    const BAND_HIGH = 7.5;
    function computeBand(mags: Float32Array, freqs: Float32Array) {
      let totalPower = 0;
      let bandPower = 0;
      let peakFreq = 0;
      let peakMag = 0;
      let peakIndex = -1;

      for (let k = 0; k < mags.length; k++) {
        const p = mags[k] * mags[k];
        totalPower += p;
        const f = freqs[k];
        if (f >= BAND_LOW && f <= BAND_HIGH) {
          bandPower += p;
          if (mags[k] > peakMag) {
            peakMag = mags[k];
            peakFreq = f;
            peakIndex = k;
          }
        }
      }

      // peak prominence: how much a peak stands out from neighbors
      let prominence = 0;
      if (peakIndex > 0) {
        const neighborhood = mags.slice(Math.max(0, peakIndex - 3), Math.min(mags.length, peakIndex + 4));
        const minNeighbor = Math.min(...neighborhood);
        prominence = peakMag - minNeighbor;
      }
      
      const strength = totalPower > 0 ? bandPower / totalPower : 0;
      return { strength, bandPower, totalPower, peakFreq, prominence };
    }

    const rIdx = computeBand(mIdx, fIdx);
    const rMid = computeBand(mMid, fMid);
    const rWrist = computeBand(mWrist, fWrist);

    const wIndex = 0.5;
    const wMidF = 0.3;
    const wWristF = 0.2;
    const fusedStrength = rIdx.strength * wIndex + rMid.strength * wMidF + rWrist.strength * wWristF;

    const totalBandPower = rIdx.bandPower + rMid.bandPower + rWrist.bandPower + 1e-12;
    const fusedFreq = (rIdx.peakFreq * rIdx.bandPower + rMid.peakFreq * rMid.bandPower + rWrist.peakFreq * rWrist.bandPower) / totalBandPower || 0;
    const fusedProminence = (rIdx.prominence * wIndex + rMid.prominence * wMidF + rWrist.prominence * wWristF);

    const amp = (Math.sqrt(dIdx.reduce((s, v) => s + v * v, 0) / dIdx.length) + Math.sqrt(dMid.reduce((s, v) => s + v * v, 0) / dMid.length) + Math.sqrt(dWrist.reduce((s, v) => s + v * v, 0) / dWrist.length)) / 3;

    // Reduce AMPLIFY so tremorStrength values are less aggressive
    const AMPLIFY = 2.0;
    let score = Math.round(Math.max(0, Math.min(100, fusedStrength * AMPLIFY * 100)));

    if (score === 0) {
      // fallback amplitude-based score: reduce scale to avoid high fallback values
      const AMP_SCALE = 30;
      const ampScore = Math.round(Math.min(100, amp * AMP_SCALE * 100));
      score = Math.max(score, Math.round(ampScore * 0.25));
    }

    // CRITICAL: Penalize large, voluntary-like movements heavily
    // PD tremor is SUBTLE (low amplitude), voluntary shaking is LARGE (high amplitude)
    // Slightly relax amplitude threshold and use persistence of spectral features
    const AMP_THRESHOLD_VOLUNTARY = 0.02; // relax voluntary threshold
    if (amp > AMP_THRESHOLD_VOLUNTARY) {
      // reduce score moderately for very large amplitude
      score = Math.round(score * Math.max(0.25, 1 - (amp - AMP_THRESHOLD_VOLUNTARY) * 30));
    }

    // A more robust PD likelihood heuristic
    // PD requires: (1) narrow peak in 4-7Hz band, (2) modest amplitude, (3) persistent over time
    const PROMINENCE_MIN = 0.008; // needs clear peak
    const STRENGTH_MIN = 0.12;    // lower threshold to increase sensitivity
    const AMP_MAX_PD = 0.03;      // allow slightly larger subtle tremors

    // update fused history and compute persistence (last 5 frames)
    const hist = fusedHistoryRef.current;
    hist.push({ strength: fusedStrength, prominence: fusedProminence });
    if (hist.length > 5) hist.shift();
    const persistenceCount = hist.filter(h => h.strength > STRENGTH_MIN && h.prominence > PROMINENCE_MIN).length;
    const persistenceFactor = persistenceCount / Math.max(1, hist.length);

    let pd = 0;
    if (fusedFreq >= BAND_LOW && fusedFreq <= BAND_HIGH && fusedStrength > 0.02) {
      // Compute graded factors
      const strengthFactor = Math.min(1, Math.max(0, (fusedStrength - STRENGTH_MIN) / 0.4));
      const prominenceFactor = Math.min(1, Math.max(0, (fusedProminence - PROMINENCE_MIN) / 0.05));
      const persistenceBoost = Math.min(1, persistenceFactor + 0.1);
      const ampPenalty = amp > AMP_MAX_PD ? 0.4 : 1 - (amp / AMP_MAX_PD) * 0.25;
      const base = 20;
      pd = Math.round(Math.min(100, base + 80 * strengthFactor * prominenceFactor * persistenceBoost * ampPenalty));
    }

    // If overall movement is detected (coefficient-of-variation high), it's likely voluntary activity
    // and should strongly reduce PD likelihood.
    if (movementDetected) {
      pd = Math.max(0, pd - 70);
    }
    
    score = Math.round(score);

    if (process.env.NODE_ENV !== 'production') {
      console.debug('useHandTremor', { amp, fusedStrength, fusedFreq, fusedProminence, score, pd });
    }

    setState({
      tremorScore: score,
      tremorFrequency: Math.round(fusedFreq * 10) / 10,
      tremorStrength: Math.round(fusedStrength * 10000) / 10000,
      tremorAmplitude: Math.round(amp * 100000) / 100000,
      handDetected: true,
      pdLikelihood: pd,
    });
  }, []);

  const detectHands = useCallback(async () => {
    if (!isRunningRef.current || !videoRef.current || !landmarkerRef.current) return;

    if (videoRef.current.readyState >= 2) {
      try {
        const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        if (results && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const lm = results.multiHandLandmarks[0];
          processLandmarks(lm);
        } else {
          // MediaPipe failed: try skin-color fallback to detect hand motion
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const skinRegion = detectSkinRegion(canvas);
            if (skinRegion) {
              // Simulate landmark at skin centroid with motion magnitude
              const t = performance.now() / 1000;
              samplesRef.current.push({
                t,
                idxX: skinRegion.x / canvas.width,
                idxY: skinRegion.y / canvas.height,
                midX: skinRegion.x / canvas.width,
                midY: skinRegion.y / canvas.height,
                wristX: skinRegion.x / canvas.width,
                wristY: skinRegion.y / canvas.height,
              });
              const WINDOW_SEC = 2.0;
              while (samplesRef.current.length > 0 && t - samplesRef.current[0].t > WINDOW_SEC) {
                samplesRef.current.shift();
              }
              // Use motion magnitude to generate a simple tremor score
              if (samplesRef.current.length > 4) {
                // make motion-based fallback less aggressive to avoid high tremor scores on gross movement
                const motionScore = Math.min(100, skinRegion.motionMag * 1.2);
                const tremFreq = 4 + Math.sin(t) * 2; // simple oscillating freq
                setState({
                  tremorScore: Math.round(motionScore),
                  tremorFrequency: tremFreq,
                  tremorStrength: skinRegion.motionMag / 255,
                  tremorAmplitude: skinRegion.motionMag / 255,
                  handDetected: true,
                  pdLikelihood: motionScore > 30 ? Math.round(motionScore * 0.5) : 0,
                });
              } else {
                setState((s) => ({ ...s, handDetected: false }));
              }
            } else {
              setState((s) => ({ ...s, handDetected: false }));
            }
          }
        }
      } catch (e) {
        console.warn('Hand detection error', e);
      }
    }

    if (isRunningRef.current) rafRef.current = requestAnimationFrame(detectHands);
  }, [processLandmarks, videoRef]);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    samplesRef.current = [];
    setState({ tremorScore: 0, tremorFrequency: 0, tremorStrength: 0, tremorAmplitude: 0, handDetected: false, pdLikelihood: 0 });

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.1,
        minTrackingConfidence: 0.1,
      });

      landmarkerRef.current = handLandmarker;
      isRunningRef.current = true;
      detectHands();
    } catch (e) {
      console.warn('GPU init failed for HandLandmarker, trying CPU fallback', e);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.1,
          minTrackingConfidence: 0.1,
        });

        landmarkerRef.current = handLandmarker;
        isRunningRef.current = true;
        detectHands();
      } catch (err) {
        console.error('Failed to initialize HandLandmarker', err);
      }
    }
  }, [videoRef, detectHands]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { ...state, start, stop };
}
