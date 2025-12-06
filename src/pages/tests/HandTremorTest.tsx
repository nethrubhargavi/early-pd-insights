import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useScreeningSession } from "@/hooks/useScreeningSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Hand,
  Camera,
  Play,
  Square,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useHandTremor } from "@/hooks/useHandTremor";

type TestPhase = "intro" | "camera" | "recording" | "analyzing" | "results";

interface TestResult {
  tremorStrength: number;
  tremorFrequency: number;
  risk: "Low" | "Moderate" | "High";
  pdLikelihood?: number;
  tremorAmplitude?: number;
}

export default function HandTremorTest() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { getOrCreateSession, updateSession } = useScreeningSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handTremor = useHandTremor(videoRef);

  const [phase, setPhase] = useState<TestPhase>("intro");
  const [countdown, setCountdown] = useState(15);
  const [result, setResult] = useState<TestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Ensure video element always has the stream attached when it's rendered
  useEffect(() => {
    if (videoRef.current && streamRef.current && (phase === "camera" || phase === "recording")) {
      videoRef.current.srcObject = streamRef.current;
      
      // Ensure video is playing
      if (videoRef.current.paused) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error("Autoplay failed:", error);
          });
        }
      }
    }
  }, [phase]);

  const startCamera = async () => {
    try {
      // Ensure we have a session before starting
      const sessionId = await getOrCreateSession();
      if (!sessionId) {
        toast.error("Failed to create screening session");
        return;
      }

      // First, set phase to camera so video element is mounted
      setPhase("camera");
      
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
      });
      
      streamRef.current = stream;
      
      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Try to play immediately and handle autoplay policy
        try {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
        } catch (playError) {
          console.error("Play error:", playError);
          // If autoplay fails, user will need to click
          toast.warning("Click the video to start playback");
        }
        // start real-time hand tremor detection
        try {
          handTremor.start();
        } catch (e) {
          console.warn('Hand tremor detection start failed', e);
        }
      }
    } catch (error) {
      console.error("Camera error:", error);
      toast.error("Unable to access camera. Please grant permission.");
      setPhase("intro");
    }
  };

  const startRecording = () => {
    setPhase("recording");
    setCountdown(15);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          analyzeRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const analyzeRecording = () => {
    setPhase("analyzing");

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Stop hand detection to freeze current values
    try {
      handTremor.stop();
    } catch (e) {
      // ignore
    }

    // Check if a hand was actually detected during recording
    const handDetected = handTremor.handDetected ?? false;
    if (!handDetected) {
      toast.error("No hand detected during recording. Please ensure your hand is clearly visible in the frame.");
      setPhase("recording");
      // Reset countdown and allow retry
      setCountdown(15);
      return;
    }

    // Read latest tremor estimate from hook
    const score = handTremor.tremorScore ?? 0;
    const freq = handTremor.tremorFrequency ?? 0;
    const amp = handTremor.tremorAmplitude ?? 0;
    const pdLikelihood = handTremor.pdLikelihood ?? 0;

    // Map PD likelihood -> risk
    // Only classify as Moderate/High if PD likelihood is substantial
    let risk: "Low" | "Moderate" | "High" = "Low";
    if (pdLikelihood > 85) {
      risk = "High";
    } else if (pdLikelihood > 55) {
      risk = "Moderate";
    }
    
    // Safety override: if amplitude is very high, definitely not PD
    const VOLUNTARY_AMP_THRESHOLD = 0.025;
    if (amp > VOLUNTARY_AMP_THRESHOLD) {
      risk = "Low";
    }

    setResult({
      tremorStrength: Math.round(score * 10) / 10,
      tremorFrequency: Math.round(freq * 10) / 10,
      risk,
      pdLikelihood: Math.round(pdLikelihood * 10) / 10,
      tremorAmplitude: Math.round(amp * 100000) / 100000,
    });

    setPhase("results");
  };

  const saveAndContinue = async (exitAfter: boolean) => {
    if (!result) return;

    setIsSaving(true);
    const success = await updateSession({
      hand_tremor_score: result.tremorStrength,
      hand_tremor_frequency: result.tremorFrequency,
      hand_tremor_risk: result.risk,
    });

    setIsSaving(false);

    if (success) {
      toast.success("Hand tremor results saved!");
      if (exitAfter) {
        navigate("/");
      } else {
        navigate("/test/voice");
      }
    } else {
      toast.error("Failed to save results. Please try again.");
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low":
        return "text-risk-low";
      case "Moderate":
        return "text-risk-moderate";
      case "High":
        return "text-risk-high";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Hand className="w-5 h-5 text-primary" />
            <span className="font-display font-semibold">Hand Tremor Test</span>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Intro Phase */}
        {phase === "intro" && (
          <div className="space-y-6 animate-fade-in">
            <Card variant="elevated">
              <CardContent className="p-6 text-center space-y-4">
                <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center mx-auto shadow-glow">
                  <Hand className="w-10 h-10 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-bold">
                    Hand Tremor Assessment
                  </h2>
                  <p className="text-muted-foreground mt-2">
                    This test analyzes hand movement patterns to detect potential
                    tremors associated with Parkinson's disease.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass">
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Instructions
                </h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Hold your phone steady with one hand</li>
                  <li>Extend your other hand in front of the camera</li>
                  <li>Keep your hand still for 15 seconds</li>
                  <li>Relax - small movements are normal</li>
                </ol>
              </CardContent>
            </Card>

            <Button variant="hero" size="xl" className="w-full" onClick={startCamera}>
              <Camera className="w-5 h-5 mr-2" />
              Start Test
            </Button>
          </div>
        )}

        {/* Camera Phase */}
        {phase === "camera" && (
          <div className="space-y-6 animate-fade-in">
            <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-border cursor-pointer">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onClick={() => {
                  if (videoRef.current?.paused) {
                    videoRef.current.play().catch(err => console.error("Click play error:", err));
                  }
                }}
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  display: "block",
                  objectFit: "contain",
                  backgroundColor: "#000"
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-primary/50 rounded-2xl animate-pulse-ring" />
              </div>
              <div className="absolute bottom-4 left-4 right-4 text-center">
                <p className="text-sm bg-card/80 backdrop-blur px-4 py-2 rounded-full inline-block text-foreground">
                  Position your hand inside the frame
                </p>
              </div>
            </div>

            <Button variant="hero" size="xl" className="w-full" onClick={startRecording}>
              <Play className="w-5 h-5 mr-2" />
              Begin Recording
            </Button>
          </div>
        )}

        {/* Recording Phase */}
        {phase === "recording" && (
          <div className="space-y-6 animate-fade-in">
            <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-primary cursor-pointer">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onClick={() => {
                  if (videoRef.current?.paused) {
                    videoRef.current.play().catch(err => console.error("Click play error:", err));
                  }
                }}
                style={{ 
                  width: "100%", 
                  height: "100%", 
                  display: "block",
                  objectFit: "contain",
                  backgroundColor: "#000"
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-primary rounded-2xl">
                  {/* Scan line animation */}
                  <div className="absolute inset-x-0 h-1 bg-primary animate-scan" />
                </div>
              </div>
              <div className="absolute top-4 right-4 flex items-center">
                <span className="bg-card/90 backdrop-blur px-4 py-1.5 rounded-full font-display font-bold text-2xl">
                  {countdown}s
                </span>
              </div>
            </div>

            <p className="text-center text-muted-foreground">
              Keep your hand steady inside the frame
            </p>
          </div>
        )}

        {/* Analyzing Phase */}
        {phase === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center shadow-glow mb-6">
              <Loader2 className="w-12 h-12 text-primary-foreground animate-spin" />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">Analyzing...</h2>
            <p className="text-muted-foreground text-center">
              Processing hand movement patterns
              <br />
              using AI tremor detection
            </p>
          </div>
        )}

        {/* Results Phase */}
        {phase === "results" && result && (
          <div className="space-y-6 animate-fade-in">
            <Card variant="elevated" className="text-center">
              <CardContent className="p-6">
                <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-success" />
                </div>
                <h2 className="text-xl font-display font-bold mb-1">
                  Test Complete
                </h2>
                <p className="text-muted-foreground">
                  Hand tremor analysis results
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card variant="default">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-display font-bold text-primary">
                    {result.tremorStrength}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tremor Strength
                  </p>
                </CardContent>
              </Card>
              <Card variant="default">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-display font-bold text-primary">
                    {result.tremorFrequency} Hz
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Frequency
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card
              variant="risk"
              className={`border-risk-${result.risk.toLowerCase()}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">PD Tremor Likelihood</div>
                    {typeof result.pdLikelihood === 'number' && (
                      <div className="text-xs text-muted-foreground">Based on spectral features and amplitude</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${getRiskColor(result.risk)}`}>{result.risk}</div>
                    {typeof result.pdLikelihood === 'number' && (
                      <div className="text-sm text-muted-foreground">{result.pdLikelihood}%</div>
                    )}
                  </div>
                </div>
                {typeof result.tremorAmplitude === 'number' && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Tremor amplitude: {result.tremorAmplitude} (large amplitude may indicate voluntary movement and reduce PD likelihood)
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => saveAndContinue(true)}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & Exit"}
              </Button>
              <Button
                variant="hero"
                size="lg"
                className="flex-1"
                onClick={() => saveAndContinue(false)}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Next Test"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
