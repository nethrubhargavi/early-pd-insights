import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/screening/RiskBadge";
import { ScoreCircle } from "@/components/screening/ScoreCircle";
import { ArrowLeft, Hand, Mic, Smile, Activity } from "lucide-react";
import { format } from "date-fns";

interface SessionData {
  id: string;
  created_at: string;
  completed_at: string | null;
  final_risk_index: number | null;
  final_risk_category: string | null;
  hand_tremor_score: number | null;
  hand_tremor_frequency: number | null;
  hand_tremor_risk: string | null;
  voice_score: number | null;
  voice_risk: string | null;
  facial_expressivity_score: number | null;
  facial_blink_rate: number | null;
  facial_risk: string | null;
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user && id) {
      fetchSession();
    }
  }, [user, id]);

  const fetchSession = async () => {
    const { data, error } = await supabase
      .from("screening_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error && data) {
      setSession(data as SessionData);
    }
    setIsLoading(false);
  };

  const getRiskColor = (risk: string | null) => {
    switch (risk) {
      case "Low":
        return "text-green-500";
      case "Moderate":
        return "text-yellow-500";
      case "High":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  if (loading || isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse space-y-4">
            <div className="h-20 w-20 rounded-full bg-muted mx-auto" />
            <div className="h-4 w-32 bg-muted rounded mx-auto" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!session) {
    return (
      <AppLayout>
        <div className="px-4 pt-6 pb-4 space-y-6">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to History
          </Button>
          <Card variant="glass" className="text-center py-12">
            <CardContent>
              <h3 className="font-display font-semibold text-lg mb-2">
                Session Not Found
              </h3>
              <p className="text-muted-foreground text-sm">
                This session may have been deleted or doesn't exist.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const modules = [
    {
      name: "Hand Tremor",
      icon: Hand,
      score: session.hand_tremor_score,
      risk: session.hand_tremor_risk,
      details: (() => {
        const freq = session.hand_tremor_frequency;
        // try common places where PD likelihood might be stored
        const handPd = (session as any).hand_tremor_pd_likelihood ?? (session as any).details?.hand_pd_likelihood ?? (session as any).details?.hand_tremor_pd_likelihood ?? null;
        if (freq && handPd !== null) return `Frequency: ${freq} Hz • PD likelihood: ${handPd}%`;
        if (freq) return `Frequency: ${freq} Hz`;
        if (handPd !== null) return `PD likelihood: ${handPd}%`;
        return null;
      })(),
    },
    {
      name: "Voice Analysis",
      icon: Mic,
      score: session.voice_score,
      risk: session.voice_risk,
      details: null,
    },
    {
      name: "Facial Analysis",
      icon: Smile,
      score: session.facial_expressivity_score,
      risk: session.facial_risk,
      details: session.facial_blink_rate !== null
        ? `Blink Rate: ${session.facial_blink_rate}/min`
        : null,
    },
  ];

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/history")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">
              Session Details
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(session.created_at), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        </div>

        {/* Final Score Card */}
        {session.final_risk_index !== null && (
          <Card variant="elevated" className="text-center py-6">
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <ScoreCircle
                  score={session.final_risk_index}
                  size="lg"
                  risk={session.final_risk_category as "Low" | "Moderate" | "High" | undefined}
                />
              </div>
              <div>
                <h2 className="text-lg font-display font-semibold mb-2">
                  PD Early Risk Index
                </h2>
                {session.final_risk_category && (
                  <RiskBadge risk={session.final_risk_category as "Low" | "Moderate" | "High"} />
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Module Breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Module Results
          </h2>
          {modules.map((module) => (
            <Card key={module.name} variant="glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                    <module.icon className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">{module.name}</h3>
                    {module.details && (
                      <p className="text-xs text-muted-foreground">{module.details}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {module.score !== null ? (
                      <>
                        <p className="text-lg font-semibold">{module.score.toFixed(1)}</p>
                        <p className={`text-xs ${getRiskColor(module.risk)}`}>
                          {module.risk || "N/A"}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not completed</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center">
          This is not a medical diagnosis. Consult a healthcare professional for proper evaluation.
        </p>
      </div>
    </AppLayout>
  );
}
