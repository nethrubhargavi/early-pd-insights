import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useScreeningSession } from "@/hooks/useScreeningSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreCircle } from "@/components/screening/ScoreCircle";
import { RiskBadge } from "@/components/screening/RiskBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  Brain,
  Hand,
  Mic,
  ScanFace,
  ArrowLeft,
  Download,
  Share2,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Loader2,
  Mail,
  MessageCircle,
  Copy,
  Printer,
  Smartphone,
} from "lucide-react";

interface ModuleResult {
  name: string;
  icon: typeof Hand;
  score: number;
  weight: number;
  risk: "Low" | "Moderate" | "High";
  contribution: number;
}

export default function Results() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { sessionId, completeSession, clearSession } = useScreeningSession();
  const [moduleResults, setModuleResults] = useState<ModuleResult[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [finalRisk, setFinalRisk] = useState<"Low" | "Moderate" | "High">("Low");
  const [biomarkerScore, setBiomarkerScore] = useState<number | null>(null);
  const [biomarkerRisk, setBiomarkerRisk] = useState<"Low" | "Moderate" | "High" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pdfBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    console.log("Results: mounted with sessionId =", sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (sessionId) {
      loadSessionData();
    } else {
      // No active session - use simulated data
      generateSimulatedResults();
    }
  }, [sessionId]);

  // Pre-generate PDF when results are ready for instant sharing
  useEffect(() => {
    if (!isLoading && moduleResults.length > 0) {
      generatePDFBlob().then((blob) => {
        pdfBlobRef.current = blob;
      }).catch(console.error);
    }
  }, [isLoading, moduleResults, finalScore, finalRisk]);

  const loadSessionData = async () => {
    if (!sessionId) {
      console.log("loadSessionData: no sessionId, using simulated data");
      return;
    }

    console.log("loadSessionData: loading data for sessionId:", sessionId);

    const { data, error } = await supabase
      .from("screening_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      console.error("Error loading session:", error);
      console.log("loadSessionData: error occurred, falling back to simulated data");
      generateSimulatedResults();
      return;
    }

    // Calculate results from session data
    // NOTE: some modules use higher=better (facial expressivity), others higher=worst (hand tremor).
    // The UI expects lower numeric values to indicate more PD-like features for these modules,
    // so invert hand score here by using (100 - raw) to normalize semantics consistently.
    // Note: facial score is already stored as a risk score (not raw expressivity), so don't invert it
    const rawHand = data.hand_tremor_score || 0;
    const voiceScore = data.voice_score || 0;
    const facialScore = data.facial_expressivity_score || 0;

    // Invert hand so that higher numbers indicate healthier performance
    // Facial is already a risk score, so use it directly
    const handScore = Math.max(0, Math.min(100, 100 - rawHand));

    console.log("loadSessionData: raw scores - hand:", rawHand, "voice:", voiceScore, "facial(risk):", facialScore);
    console.log("loadSessionData: normalized scores - hand:", handScore, "voice:", voiceScore, "facial:", facialScore);

    // Fetch biomarker reports for this session (prefer session-specific, fallback to latest user-level)
    let screeningBiomarkerScore: number | null = null;
    let screeningBiomarkerRisk: "Low" | "Moderate" | "High" | null = null;

    try {
      let reportsData: any = null;

      // Try session-specific report first
      if (sessionId) {
        const resp = await supabase
          .from("uploaded_reports")
          .select("biomarker_summary_score, biomarker_risk, biomarker_analysis")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(1);
        reportsData = resp.data;
      }

      // Fallback to latest user-level report
      if ((!reportsData || reportsData.length === 0) && user) {
        const resp2 = await supabase
          .from("uploaded_reports")
          .select("biomarker_summary_score, biomarker_risk, biomarker_analysis")
          .eq("user_id", user?.id)
          .order("created_at", { ascending: false })
          .limit(1);
        reportsData = resp2.data;
      }

      if (reportsData && reportsData.length > 0) {
        const report = reportsData[0];
        screeningBiomarkerScore = report.biomarker_summary_score;
        screeningBiomarkerRisk = report.biomarker_risk
          ? ((report.biomarker_risk.charAt(0).toUpperCase() + report.biomarker_risk.slice(1)) as "Low" | "Moderate" | "High")
          : null;
        console.log("loadSessionData: found biomarker report - score:", screeningBiomarkerScore, "risk:", screeningBiomarkerRisk);
      }
    } catch (bioErr) {
      console.warn("Failed to fetch biomarker reports:", bioErr);
    }

    // Calculate weighted score: 0-100 scale
    // If biomarkers available: Hand Tremor (35%), Voice (25%), Facial (25%), Biomarkers (15%)
    // Otherwise: Hand Tremor (40%), Voice (30%), Facial (30%)
    let finalScore: number;
    let risk: "Low" | "Moderate" | "High";

    if (screeningBiomarkerScore !== null) {
      // Include biomarker score in final calculation
      finalScore = (handScore * 0.35) + (voiceScore * 0.25) + (facialScore * 0.25) + (screeningBiomarkerScore * 0.15);
      setBiomarkerScore(screeningBiomarkerScore);
      setBiomarkerRisk(screeningBiomarkerRisk);
    } else {
      // Original weights without biomarkers
      finalScore = (handScore * 0.4) + (voiceScore * 0.3) + (facialScore * 0.3);
    }
    
    // Risk mapping: Low (0-40), Moderate (40-70), High (70-100)
    risk =
      finalScore >= 70 ? "High" : finalScore >= 40 ? "Moderate" : "Low";

    setModuleResults([
      {
        name: "Hand Tremor",
        icon: Hand,
        score: handScore,
        weight: screeningBiomarkerScore !== null ? 0.35 : 0.4,
        risk: (data.hand_tremor_risk as "Low" | "Moderate" | "High") || "Low",
        contribution: screeningBiomarkerScore !== null ? (handScore * 0.35) : (handScore * 0.4),
      },
      {
        name: "Voice Analysis",
        icon: Mic,
        score: voiceScore,
        weight: screeningBiomarkerScore !== null ? 0.25 : 0.3,
        risk: (data.voice_risk as "Low" | "Moderate" | "High") || "Low",
        contribution: screeningBiomarkerScore !== null ? (voiceScore * 0.25) : (voiceScore * 0.3),
      },
      {
        name: "Facial Scan",
        icon: ScanFace,
        score: Math.max(0, Math.min(100, 100 - facialScore)), // Display inverted for consistency
        weight: screeningBiomarkerScore !== null ? 0.25 : 0.3,
        risk: (data.facial_risk as "Low" | "Moderate" | "High") || "Low",
        contribution: screeningBiomarkerScore !== null ? (facialScore * 0.25) : (facialScore * 0.3),
      },
    ]);

    setFinalScore(Math.round(finalScore * 10) / 10);
    setFinalRisk(risk);
    console.log("loadSessionData: successfully loaded real session data, finalScore:", Math.round(finalScore * 10) / 10, "with biomarkers:", screeningBiomarkerScore !== null);
    setIsLoading(false);
  };

  const generateSimulatedResults = () => {
    // Simulated RAW sensor outputs (same format as stored session values)
    const rawHand = 28; // raw hand tremor score (lower = less tremor)
    const voiceScore = 35; // voice instability (higher = worse)
    const rawFacial = 30; // raw facial expressivity (higher = healthier)

    // Normalize by inverting rawHand and rawFacial so higher values in UI represent healthier
    const handScore = Math.max(0, Math.min(100, 100 - rawHand));
    const facialScore = Math.max(0, Math.min(100, 100 - rawFacial));

    // Simulated biomarker score (optional)
    const hasSimulatedBiomarkers = Math.random() > 0.5; // 50% chance
    let simBiomarkerScore = null;
    let simBiomarkerRisk: "Low" | "Moderate" | "High" | null = null;

    if (hasSimulatedBiomarkers) {
      simBiomarkerScore = Math.floor(Math.random() * 60) + 20; // 20-80
      simBiomarkerRisk = simBiomarkerScore < 40 ? "Low" : simBiomarkerScore < 70 ? "Moderate" : "High";
      setBiomarkerScore(simBiomarkerScore);
      setBiomarkerRisk(simBiomarkerRisk);
    } else {
      setBiomarkerScore(null);
      setBiomarkerRisk(null);
    }

    const results: ModuleResult[] = [
      {
        name: "Hand Tremor",
        icon: Hand,
        score: handScore,
        weight: hasSimulatedBiomarkers ? 0.35 : 0.4,
        risk: "Low",
        contribution: hasSimulatedBiomarkers ? (handScore * 0.35) : (handScore * 0.4),
      },
      {
        name: "Voice Analysis",
        icon: Mic,
        score: voiceScore,
        weight: hasSimulatedBiomarkers ? 0.25 : 0.3,
        risk: "Low",
        contribution: hasSimulatedBiomarkers ? (voiceScore * 0.25) : (voiceScore * 0.3),
      },
      {
        name: "Facial Scan",
        icon: ScanFace,
        score: facialScore,
        weight: hasSimulatedBiomarkers ? 0.25 : 0.3,
        risk: "Low",
        contribution: hasSimulatedBiomarkers ? (facialScore * 0.25) : (facialScore * 0.3),
      },
    ];

    let finalScore: number;
    if (hasSimulatedBiomarkers && simBiomarkerScore !== null) {
      finalScore = (handScore * 0.35) + (voiceScore * 0.25) + (facialScore * 0.25) + (simBiomarkerScore * 0.15);
    } else {
      finalScore = (handScore * 0.4) + (voiceScore * 0.3) + (facialScore * 0.3);
    }

    const risk: "Low" | "Moderate" | "High" =
      finalScore >= 70 ? "High" : finalScore >= 40 ? "Moderate" : "Low";

    setModuleResults(results);
    setFinalScore(Math.round(finalScore * 10) / 10);
    setFinalRisk(risk);
    setIsLoading(false);
  };

  const handleComplete = async () => {
    setIsSaving(true);
    console.log("handleComplete: sessionId =", sessionId, "finalScore =", finalScore, "finalRisk =", finalRisk);

    if (sessionId) {
      console.log("handleComplete: calling completeSession with data:", { final_risk_index: finalScore, final_risk_category: finalRisk });
      const success = await completeSession({
        final_risk_index: finalScore,
        final_risk_category: finalRisk,
      });

      if (success) {
        console.log("handleComplete: completeSession succeeded");
        toast.success("Screening session saved to history!");
      } else {
        console.log("handleComplete: completeSession failed");
        toast.error("Failed to save session");
      }
    } else {
      console.log("handleComplete: NO sessionId - session will not be saved!");
    }

    clearSession();
    setIsSaving(false);
    navigate("/");
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low":
        return "bg-risk-low";
      case "Moderate":
        return "bg-risk-moderate";
      case "High":
        return "bg-risk-high";
      default:
        return "bg-muted";
    }
  };

  const generatePDFBlob = async (): Promise<Blob> => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = 20;

    // Title
    pdf.setFontSize(22);
    pdf.setFont("helvetica", "bold");
    pdf.text("PD Early Screening Results", pageWidth / 2, yPos, { align: "center" });
    yPos += 12;

    // Date
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth / 2, yPos, { align: "center" });
    yPos += 15;

    // Final Score Box
    pdf.setFillColor(finalRisk === "High" ? 239 : finalRisk === "Moderate" ? 245 : 34, finalRisk === "High" ? 68 : finalRisk === "Moderate" ? 158 : 197, finalRisk === "High" ? 68 : finalRisk === "Moderate" ? 11 : 94);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 35, 3, 3, "F");
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("PD Early Risk Index", pageWidth / 2, yPos + 12, { align: "center" });
    
    pdf.setFontSize(28);
    pdf.text(`${finalScore}`, pageWidth / 2, yPos + 26, { align: "center" });
    
    pdf.setFontSize(12);
    pdf.text(`Risk Level: ${finalRisk}`, pageWidth / 2, yPos + 33, { align: "center" });
    yPos += 45;

    // Reset text color
    pdf.setTextColor(0, 0, 0);

    // Module Results
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("Score Breakdown", margin, yPos);
    yPos += 10;

    moduleResults.forEach((module) => {
      pdf.setFillColor(245, 245, 245);
      pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 22, 2, 2, "F");
      
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 0, 0);
      pdf.text(module.name, margin + 5, yPos + 8);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Score: ${module.score}`, margin + 5, yPos + 16);
      pdf.text(`Risk: ${module.risk}`, margin + 50, yPos + 16);
      pdf.text(`Weight: ${(module.weight * 100).toFixed(0)}%`, margin + 90, yPos + 16);
      pdf.text(`Contribution: ${module.contribution.toFixed(1)}`, margin + 130, yPos + 16);
      
      yPos += 27;
    });

    yPos += 5;

    // Fusion Weights
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("Fusion Weights", margin, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("• Tremor Frequency: 40%", margin + 5, yPos);
    yPos += 6;
    pdf.text("• Voice Instability: 30%", margin + 5, yPos);
    yPos += 6;
    pdf.text("• Facial Masking + Blink: 30%", margin + 5, yPos);
    yPos += 15;

    // Disclaimer
    pdf.setFillColor(255, 243, 205);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 30, 2, 2, "F");
    
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(133, 100, 4);
    pdf.text("Important Notice", margin + 5, yPos + 8);
    
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const disclaimer = "This screening is for informational purposes only and does not constitute a medical diagnosis. Please consult a neurologist or healthcare professional for proper evaluation and diagnosis.";
    const splitDisclaimer = pdf.splitTextToSize(disclaimer, pageWidth - 2 * margin - 10);
    pdf.text(splitDisclaimer, margin + 5, yPos + 15);

    return pdf.output("blob");
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const pdfBlob = await generatePDFBlob();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `PD_Screening_Results_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("PDF exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const getShareText = () => {
    return `PD Early Screening Results\n\nRisk Index: ${finalScore} (${finalRisk})\n\nBreakdown:\n${moduleResults.map(m => `- ${m.name}: ${m.score} (${m.risk})`).join("\n")}\n\nNote: This is for informational purposes only.`;
  };

  const handleNativeShare = async () => {
    setIsSharing(true);
    const shareText = getShareText();
    const fileName = `PD_Screening_Results_${new Date().toISOString().split("T")[0]}.pdf`;
    
    try {
      let pdfBlob = pdfBlobRef.current;
      if (!pdfBlob) {
        pdfBlob = await generatePDFBlob();
        pdfBlobRef.current = pdfBlob;
      }
      
      const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });
      
      if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
        await navigator.share({
          title: "PD Early Screening Results",
          text: shareText,
          files: [pdfFile],
        });
        toast.success("Shared successfully!");
      } else if (navigator.share) {
        await navigator.share({
          title: "PD Early Screening Results",
          text: shareText,
        });
        toast.success("Shared successfully!");
      } else {
        toast.error("Native sharing not supported on this device");
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Share error:", error);
        toast.error("Failed to share");
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleWhatsAppShare = () => {
    const shareText = getShareText();
    const encodedText = encodeURIComponent(shareText);
    window.open(`https://wa.me/?text=${encodedText}`, "_blank");
    toast.success("Opening WhatsApp...");
  };

  const handleGmailShare = () => {
    const shareText = getShareText();
    const subject = encodeURIComponent("PD Early Screening Results");
    const body = encodeURIComponent(shareText);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, "_blank");
    toast.success("Opening Gmail...");
  };

  const handleCopyToClipboard = async () => {
    const shareText = getShareText();
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("Results copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <span className="font-display font-semibold">Final Results</span>
          </div>
          <div className="w-10" />
        </div>
      </div>

      <div className="p-4 space-y-6 animate-fade-in">
        {/* Main Score Card */}
        <Card variant="elevated" className="overflow-hidden">
          <div className="gradient-hero p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <ScoreCircle
                  score={finalScore}
                  size="xl"
                  risk={finalRisk}
                  label="PD Early Risk Index"
                />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-primary-foreground">
              <RiskBadge risk={finalRisk} size="lg" />
            </div>
          </div>
        </Card>

        {/* Module Breakdown */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Score Breakdown
          </h2>

          {moduleResults.map((module) => (
            <Card key={module.name} variant="default">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                    <module.icon className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{module.name}</span>
                      <RiskBadge risk={module.risk} size="sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getRiskColor(module.risk)} transition-all duration-1000`}
                          style={{ width: `${module.score}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-8">
                        {module.score}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>Weight: {(module.weight * 100).toFixed(0)}%</span>
                  <span>Contribution: {module.contribution.toFixed(1)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Biomarker Results (if available) */}
        {biomarkerScore !== null && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Medical Biomarkers
            </h2>
            <Card variant="default">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Lab Biomarkers</span>
                      {biomarkerRisk && <RiskBadge risk={biomarkerRisk} size="sm" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getRiskColor(biomarkerRisk || "Low")} transition-all duration-1000`}
                          style={{ width: `${biomarkerScore}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-8">
                        {biomarkerScore}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                  <p>Weight: 15% (Blood/fluid marker analysis)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Weight Info */}
        <Card variant="glass">
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm mb-3">Fusion Weights</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tremor Frequency</span>
                <span className="font-medium">{biomarkerScore !== null ? '35%' : '40%'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Voice Instability</span>
                <span className="font-medium">{biomarkerScore !== null ? '25%' : '30%'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Facial Masking + Blink</span>
                <span className="font-medium">{biomarkerScore !== null ? '25%' : '30%'}</span>
              </div>
              {biomarkerScore !== null && (
                <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground">Lab Biomarkers</span>
                  <span className="font-medium">15%</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="lg" 
            className="flex-1"
            onClick={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {isExporting ? "Exporting..." : "Export PDF"}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1"
                disabled={isSharing}
              >
                {isSharing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Share2 className="w-4 h-4 mr-2" />
                )}
                {isSharing ? "Sharing..." : "Share"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleWhatsAppShare}>
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleGmailShare}>
                <Mail className="w-4 h-4 mr-2" />
                Gmail
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNativeShare}>
                <Smartphone className="w-4 h-4 mr-2" />
                More Apps...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyToClipboard}>
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Disclaimer */}
        <Card variant="glass" className="border-warning/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-sm">Important Notice</p>
                <p className="text-xs text-muted-foreground">
                  This screening is for informational purposes only and does not
                  constitute a medical diagnosis. Please consult a neurologist or
                  healthcare professional for proper evaluation and diagnosis.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Done Button */}
        <Button
          variant="hero"
          size="xl"
          className="w-full"
          onClick={handleComplete}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5 mr-2" />
          )}
          {isSaving ? "Saving..." : "Done"}
        </Button>
      </div>
    </div>
  );
}
