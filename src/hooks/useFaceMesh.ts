import { useRef, useCallback, useState, useEffect } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Eye landmark indices for EAR calculation (MediaPipe Tasks Vision uses same indices)
const LEFT_EYE_INDICES = {
  top: 159,
  bottom: 145,
  left: 33,
  right: 133,
};

const RIGHT_EYE_INDICES = {
  top: 386,
  bottom: 374,
  left: 362,
  right: 263,
};

// Additional landmarks for smile detection
const MOUTH_INDICES = {
  left: 61,
  right: 291,
  top: 13,
  bottom: 14,
};

// Eyebrow landmarks
const LEFT_EYEBROW_TOP = 66;
const RIGHT_EYEBROW_TOP = 296;
const FOREHEAD_CENTER = 10;

interface FaceMeshState {
  blinkCount: number;
  isBlinking: boolean;
  facialExpressivity: number;
  smileAmplitude: number;
  browMovement: number;
  asymmetry: number;
  faceDetected: boolean;
}

interface Landmark {
  x: number;
  y: number;
  z: number;
}

// Eye Aspect Ratio threshold. Raised to catch softer (normal) blinks.
const EAR_THRESHOLD = 0.27;
// Minimum milliseconds between counted blinks to avoid double counting the same blink
const BLINK_COOLDOWN = 350;
// Minimum sudden drop in smoothed EAR to count as a blink (helps very short blinks)
const EAR_DROP_THRESHOLD = 0.08;
// Number of consecutive frames below threshold required to *start* a blink
const CONSECUTIVE_BELOW = 2;

export function useFaceMesh(videoRef: React.RefObject<HTMLVideoElement>) {
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastBlinkTimeRef = useRef<number>(0);
  const wasBlinkingRef = useRef<boolean>(false);
  const baselineSmileRef = useRef<number | null>(null);
  const baselineBrowRef = useRef<number | null>(null);
  const expressivitySamplesRef = useRef<number[]>([]);
  const earSamplesRef = useRef<number[]>([]);
  const prevEarRef = useRef<number | null>(null);
  const consecutiveBelowRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);

  const [state, setState] = useState<FaceMeshState>({
    blinkCount: 0,
    isBlinking: false,
    facialExpressivity: 50,
    smileAmplitude: 0,
    browMovement: 0,
    asymmetry: 0,
    faceDetected: false,
  });

  const calculateEAR = useCallback(
    (landmarks: Landmark[], eyeIndices: typeof LEFT_EYE_INDICES) => {
      const top = landmarks[eyeIndices.top];
      const bottom = landmarks[eyeIndices.bottom];
      const left = landmarks[eyeIndices.left];
      const right = landmarks[eyeIndices.right];

      const verticalDist = Math.sqrt(
        Math.pow(top.x - bottom.x, 2) + Math.pow(top.y - bottom.y, 2)
      );
      const horizontalDist = Math.sqrt(
        Math.pow(left.x - right.x, 2) + Math.pow(left.y - right.y, 2)
      );

      return verticalDist / (horizontalDist + 0.0001);
    },
    []
  );

  const calculateSmileWidth = useCallback((landmarks: Landmark[]) => {
    const left = landmarks[MOUTH_INDICES.left];
    const right = landmarks[MOUTH_INDICES.right];
    return Math.sqrt(
      Math.pow(left.x - right.x, 2) + Math.pow(left.y - right.y, 2)
    );
  }, []);

  const calculateBrowHeight = useCallback((landmarks: Landmark[]) => {
    const leftBrow = landmarks[LEFT_EYEBROW_TOP];
    const rightBrow = landmarks[RIGHT_EYEBROW_TOP];
    const forehead = landmarks[FOREHEAD_CENTER];

    const leftDist = Math.abs(leftBrow.y - forehead.y);
    const rightDist = Math.abs(rightBrow.y - forehead.y);
    return (leftDist + rightDist) / 2;
  }, []);

  const calculateAsymmetry = useCallback((landmarks: Landmark[]) => {
    const leftEye = landmarks[LEFT_EYE_INDICES.left];
    const rightEye = landmarks[RIGHT_EYE_INDICES.right];
    const nose = landmarks[1];

    const leftDist = Math.abs(leftEye.x - nose.x);
    const rightDist = Math.abs(rightEye.x - nose.x);

    return (Math.abs(leftDist - rightDist) / (leftDist + rightDist + 0.0001)) * 100;
  }, []);

  const processResults = useCallback(
    (landmarks: Landmark[]) => {
      const now = Date.now();

      const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
      const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
      const avgEAR = (leftEAR + rightEAR) / 2;

      // Maintain small sliding window for smoothing
      earSamplesRef.current.push(avgEAR);
      if (earSamplesRef.current.length > 5) {
        earSamplesRef.current.shift();
      }

      const smoothedEAR =
        earSamplesRef.current.reduce((a, b) => a + b, 0) /
        earSamplesRef.current.length;

      // Detect blink either by smoothed EAR below threshold (soft blink)
      // or by a sharp drop relative to previous smoothed EAR (very brief blink).
      const dropFromPrev = prevEarRef.current !== null ? prevEarRef.current - smoothedEAR : 0;

      // Count consecutive frames below threshold to add temporal hysteresis
      const isBelow = smoothedEAR < EAR_THRESHOLD;
      if (isBelow) {
        consecutiveBelowRef.current = consecutiveBelowRef.current + 1;
      } else {
        consecutiveBelowRef.current = 0;
      }

      const isCurrentlyBlinking =
        consecutiveBelowRef.current >= CONSECUTIVE_BELOW || dropFromPrev > EAR_DROP_THRESHOLD;

      prevEarRef.current = smoothedEAR;

      // Debug log for tuning in development
      try {
        if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.debug('EAR', smoothedEAR.toFixed(3), 'drop', dropFromPrev.toFixed(3), 'belowFrames', consecutiveBelowRef.current, 'blinking', isCurrentlyBlinking);
        }
      } catch (e) {
        // ignore
      }

      const smileWidth = calculateSmileWidth(landmarks);
      const browHeight = calculateBrowHeight(landmarks);
      const asymmetry = calculateAsymmetry(landmarks);

      if (baselineSmileRef.current === null) {
        baselineSmileRef.current = smileWidth;
      }
      if (baselineBrowRef.current === null) {
        baselineBrowRef.current = browHeight;
      }

      const smileChange =
        ((smileWidth - baselineSmileRef.current) / baselineSmileRef.current) * 100;
      const browChange =
        ((browHeight - baselineBrowRef.current) / baselineBrowRef.current) * 100;

      const expressivityScore = Math.abs(smileChange) + Math.abs(browChange) * 2;
      expressivitySamplesRef.current.push(expressivityScore);
      if (expressivitySamplesRef.current.length > 100) {
        expressivitySamplesRef.current.shift();
      }

      const avgExpressivity =
        expressivitySamplesRef.current.reduce((a, b) => a + b, 0) /
        expressivitySamplesRef.current.length;

      setState((prev) => {
        let newBlinkCount = prev.blinkCount;

        if (wasBlinkingRef.current && !isCurrentlyBlinking) {
          if (now - lastBlinkTimeRef.current > BLINK_COOLDOWN) {
            newBlinkCount = prev.blinkCount + 1;
            lastBlinkTimeRef.current = now;
          }
        }

        // Update blinking state for next frame
        wasBlinkingRef.current = isCurrentlyBlinking;

        // Normalize expressivity into a 0-100 percentage in a smooth way.
        // avgExpressivity is an unbounded score derived from landmark deltas; map it
        // using a saturating transform so typical ranges produce meaningful values
        // without always hitting 100.
        const normalizedExpressivity = Math.max(0, avgExpressivity);
        const expressivityPercent = Math.min(
          100,
          Math.round((normalizedExpressivity / (normalizedExpressivity + 8)) * 100)
        );

        return {
          blinkCount: newBlinkCount,
          isBlinking: isCurrentlyBlinking,
          facialExpressivity: expressivityPercent,
          smileAmplitude: Math.max(0, smileChange),
          browMovement: Math.abs(browChange),
          asymmetry: Math.round(asymmetry * 10) / 10,
          faceDetected: true,
        };
      });
    },
    [calculateEAR, calculateSmileWidth, calculateBrowHeight, calculateAsymmetry]
  );

  const detectFaces = useCallback(async () => {
    if (!isRunningRef.current || !videoRef.current || !faceLandmarkerRef.current) {
      return;
    }

    if (videoRef.current.readyState >= 2) {
      try {
        const results = faceLandmarkerRef.current.detectForVideo(
          videoRef.current,
          performance.now()
        );

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          processResults(results.faceLandmarks[0]);
        } else {
          setState((prev) => ({ ...prev, faceDetected: false }));
        }
      } catch (e) {
        console.warn("Face detection error:", e);
      }
    }

    if (isRunningRef.current) {
      animationFrameRef.current = requestAnimationFrame(detectFaces);
    }
  }, [videoRef, processResults]);

  const startDetection = useCallback(async () => {
    if (!videoRef.current) return;

    // Reset state
    setState({
      blinkCount: 0,
      isBlinking: false,
      facialExpressivity: 50,
      smileAmplitude: 0,
      browMovement: 0,
      asymmetry: 0,
      faceDetected: false,
    });
    baselineSmileRef.current = null;
    baselineBrowRef.current = null;
    expressivitySamplesRef.current = [];
    lastBlinkTimeRef.current = 0;
    wasBlinkingRef.current = false;

    try {
      // Initialize FaceLandmarker using tasks-vision API
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceLandmarkerRef.current = faceLandmarker;
      isRunningRef.current = true;
      console.log("FaceLandmarker initialized with GPU");

      // Start detection loop
      detectFaces();
    } catch (error) {
      console.warn("GPU delegate failed, trying CPU fallback:", error);
      // Try with CPU fallback
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceLandmarkerRef.current = faceLandmarker;
        isRunningRef.current = true;
        console.log("FaceLandmarker initialized with CPU fallback");
        detectFaces();
      } catch (fallbackError) {
        console.error("Failed to initialize FaceLandmarker with CPU fallback:", fallbackError);
      }
    }
  }, [videoRef, detectFaces]);

  const stopDetection = useCallback(() => {
    isRunningRef.current = false;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (faceLandmarkerRef.current) {
      faceLandmarkerRef.current.close();
      faceLandmarkerRef.current = null;
    }
  }, []);

  const resetBlinkCount = useCallback(() => {
    setState((prev) => ({ ...prev, blinkCount: 0 }));
    lastBlinkTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  return {
    ...state,
    startDetection,
    stopDetection,
    resetBlinkCount,
  };
}
