import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TestCard } from "@/components/screening/TestCard";
import { ScoreCircle } from "@/components/screening/ScoreCircle";
import { RiskBadge } from "@/components/screening/RiskBadge";
import {
  Hand,
  Mic,
  ScanFace,
  Brain,
  AlertTriangle,
  ArrowRight,
  Activity,
} from "lucide-react";

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gradient-primary" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col gradient-surface">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8">
          <div className="text-center space-y-6 animate-fade-in max-w-md">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl gradient-hero shadow-glow animate-float">
              <Brain className="w-10 h-10 text-primary-foreground" />
            </div>
            
            <div className="space-y-3">
              <h1 className="text-4xl font-display font-bold text-foreground">
                NeuroScreen
              </h1>
              <p className="text-lg text-muted-foreground">
                AI-Powered Early Parkinson's Risk Assessment
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6">
              {[
                { icon: Hand, label: "Hand Tremor" },
                { icon: Mic, label: "Voice Analysis" },
                { icon: ScanFace, label: "Facial Scan" },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card/50 backdrop-blur animate-fade-in"
                  style={{ animationDelay: `${(i + 1) * 150}ms` }}
                >
                  <item.icon className="w-6 h-6 text-primary" />
                  <span className="text-xs text-muted-foreground font-medium">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="px-6 pb-8 space-y-4">
          <Button
            variant="hero"
            size="xl"
            className="w-full"
            onClick={() => navigate("/auth")}
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            Free screening • No medical training required
          </p>
        </div>

        {/* Disclaimer */}
        <div className="px-6 pb-8">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Disclaimer:</span> This app
              provides informational screening only and is not a medical diagnosis tool.
              Always consult a healthcare professional.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Logged in dashboard
  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {user.user_metadata?.full_name || "User"}
            </h1>
          </div>
          <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center">
            <Brain className="w-6 h-6 text-primary-foreground" />
          </div>
        </div>

        {/* Quick Stats Card */}
        <Card variant="gradient" className="overflow-hidden">
          <div className="gradient-hero p-5 text-primary-foreground">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90">Last Assessment</p>
                <p className="text-lg font-semibold mt-1">No tests yet</p>
              </div>
              <Activity className="w-10 h-10 opacity-50" />
            </div>
          </div>
        </Card>

        {/* Start New Screening */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-semibold">New Screening</h2>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
              ~5 min
            </span>
          </div>

          <div className="space-y-3">
            <TestCard
              step={1}
              icon={<Hand className="w-4 h-4 text-primary" />}
              title="Hand Tremor Test"
              description="Hold camera steady for 15 seconds"
              isActive
              onClick={() => navigate("/test/hand")}
            />
            <TestCard
              step={2}
              icon={<Mic className="w-4 h-4 text-primary" />}
              title="Voice Analysis"
              description="Vocalize 'aaaah' for 5 seconds"
              isLocked
            />
            <TestCard
              step={3}
              icon={<ScanFace className="w-4 h-4 text-primary" />}
              title="Facial Scan"
              description="Record face for 30-60 seconds"
              isLocked
            />
            <TestCard
              step={4}
              icon={<Brain className="w-4 h-4 text-primary" />}
              title="Final Risk Assessment"
              description="Combined AI analysis"
              isLocked
            />
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 border border-border">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            This screening is for informational purposes only. Results should be discussed
            with a healthcare professional.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
