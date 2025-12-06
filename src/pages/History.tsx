import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useScreeningSession } from "@/hooks/useScreeningSession";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/screening/RiskBadge";
import { ScoreCircle } from "@/components/screening/ScoreCircle";
import { CalendarDays, ChevronRight, FileText, TrendingUp, Play, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ScreeningSession {
  id: string;
  created_at: string;
  completed_at: string | null;
  final_risk_index: number | null;
  final_risk_category: "Low" | "Moderate" | "High" | null;
  hand_tremor_score: number | null;
  voice_score: number | null;
  facial_expressivity_score: number | null;
}

// Determine which test to resume next based on completed tests
function getNextTestForIncompleteSession(session: ScreeningSession): string {
  if (session.hand_tremor_score === null) return "/test/hand-tremor";
  if (session.voice_score === null) return "/test/voice";
  if (session.facial_expressivity_score === null) return "/test/facial";
  return "/test/results";
}

// Get progress label for incomplete sessions
function getProgressLabel(session: ScreeningSession): string {
  const testsCompleted = [
    session.hand_tremor_score !== null,
    session.voice_score !== null,
    session.facial_expressivity_score !== null,
  ].filter(Boolean).length;
  
  return `${testsCompleted}/3 tests completed`;
}

export default function History() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ScreeningSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user]);

  // Refetch sessions whenever the page becomes visible (e.g., after completing a screening)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user) {
        fetchSessions();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user]);

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from("screening_sessions")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setSessions(data as ScreeningSession[]);
    }
    setIsLoading(false);
  };

  const deleteSession = async (id: string) => {
    const ok = window.confirm('Delete this session? This action cannot be undone.');
    if (!ok) return;

    // Optimistic UI update
    const prev = sessions;
    setSessions((s) => s.filter((x) => x.id !== id));

    // Delete from database
    const { error } = await supabase.from('screening_sessions').delete().eq('id', id).eq('user_id', user?.id);
    if (error) {
      console.error('Failed to delete session', error);
      // revert
      setSessions(prev);
      alert('Failed to delete session. Please try again.');
      return;
    }

    // Cleanup server-side uploaded files
    try {
      await fetch(`http://localhost:4000/api/cleanup/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to cleanup uploaded files:', err);
      // Don't revert UI - session is already deleted from DB; file cleanup is non-critical
    }
  };

  const chartData = useMemo(() => {
    const completedSessions = sessions
      .filter((s) => s.final_risk_index !== null)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return completedSessions.map((session) => ({
      date: format(new Date(session.created_at), "MMM d"),
      score: session.final_risk_index,
      risk: session.final_risk_category,
    }));
  }, [sessions]);

  const showTrendChart = chartData.length >= 3;

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

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Session History
            </h1>
            <p className="text-sm text-muted-foreground">
              Track your screening results over time
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Lower values indicate lower chances (lower risk). This is a screening tool and not a diagnosis — if you have concerns, consult a healthcare professional.
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-secondary-foreground" />
          </div>
        </div>

        {sessions.length === 0 ? (
          <Card variant="glass" className="text-center py-12">
            <CardContent>
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg mb-2">
                No Sessions Yet
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                Complete your first screening to see your history
              </p>
              <Button variant="hero" onClick={() => navigate("/")}>
                Start Screening
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Trend Overview */}
            <Card variant="elevated">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Risk Trend</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {showTrendChart ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          formatter={(value: number, name: string, props: any) => [
                            `${value.toFixed(1)} (${props.payload.risk})`,
                            "Risk Index",
                          ]}
                        />
                        <ReferenceLine y={40} stroke="hsl(var(--chart-2))" strokeDasharray="5 5" />
                        <ReferenceLine y={70} stroke="hsl(var(--chart-5))" strokeDasharray="5 5" />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm text-center">
                    Complete at least 3 screenings to see your risk trend over time
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Session List */}
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                All Sessions ({sessions.length})
              </h2>
              {sessions.map((session) => (
                <Card
                  key={session.id}
                  variant="interactive"
                  className="cursor-pointer"
                  onClick={() => navigate(`/session/${session.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {session.final_risk_index ? (
                        <ScoreCircle
                          score={session.final_risk_index}
                          size="sm"
                          risk={session.final_risk_category || undefined}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-muted-foreground text-center px-2">
                            {getProgressLabel(session)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {format(new Date(session.created_at), "MMM d, yyyy")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(session.created_at), "h:mm a")}
                          </span>
                        </div>
                        {session.final_risk_category ? (
                          <RiskBadge risk={session.final_risk_category} size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Incomplete</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!session.final_risk_index ? (
                          <Button
                            variant="hero"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Set session in localStorage so the test page hook will pick it up
                              localStorage.setItem("active_session_id", session.id);
                              navigate(getNextTestForIncompleteSession(session));
                            }}
                            className="flex-shrink-0"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Resume
                          </Button>
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                          className="ml-2"
                          aria-label="Delete session"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}