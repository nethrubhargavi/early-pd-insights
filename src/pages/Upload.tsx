import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useScreeningSession } from "@/hooks/useScreeningSession";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Upload as UploadIcon,
  FileText,
  Image,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UploadedReport {
  id: string;
  file_name: string;
  file_type: string;
  created_at: string;
  biomarker_summary_score: number | null;
}

export default function Upload() {
  const { user, loading } = useAuth();
  const { sessionId } = useScreeningSession();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reports, setReports] = useState<UploadedReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchReports();
    }
  }, [user]);

  const fetchReports = async () => {
    const { data, error } = await supabase
      .from("uploaded_reports")
      .select("id, file_name, file_type, created_at, biomarker_summary_score")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setReports(data);
    }
    setIsLoadingReports(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).slice(0, 10);
    if (files.length > 0) {
      await handleFileUpload(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const arr = Array.from(files).slice(0, 10);
      await handleFileUpload(arr);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    if (!user) return;

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "text/csv",
      "application/vnd.ms-excel",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    // limit to 10 files
    const toProcess = files.slice(0, 10);

    setIsUploading(true);

    try {
      for (const file of toProcess) {
        if (!allowedTypes.includes(file.type)) {
          toast.error(`Skipped ${file.name}: unsupported file type`);
          continue;
        }

        if (file.size > 10 * 1024 * 1024) {
          toast.error(`Skipped ${file.name}: file too large (max 10MB)`);
          continue;
        }

        const fileExt = file.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}_${Math.floor(Math.random() * 10000)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("reports")
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error for', file.name, uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        const pubRes = await supabase.storage
          .from("reports")
          .getPublicUrl(filePath);
        const urlData = pubRes.data || pubRes; // handle different client shapes
        const publicUrl = urlData?.publicUrl || urlData?.publicURL || urlData?.public_url || null;
        if (!publicUrl) {
          console.warn('Could not obtain public URL for', filePath, pubRes);
        }
        // Send file to biomarker analyzer (optional)
        const formData = new FormData();
        formData.append('file', file);

        let biomarkerAnalysis = null;

        try {
          const analyzeRes = await fetch('http://localhost:4000/api/analyze-biomarkers', {
            method: 'POST',
            body: formData,
          });

          if (analyzeRes.ok) {
            biomarkerAnalysis = await analyzeRes.json();
          } else {
            console.warn('Biomarker analysis failed:', analyzeRes.statusText);
          }
        } catch (analyzeErr) {
          console.warn('Could not connect to biomarker analyzer for', file.name, analyzeErr);
        }

        // Extract risk assessment if available
        let biomarkerScore = null;
        let biomarkerRisk = null;
        if (biomarkerAnalysis?.risk_assessment) {
          biomarkerScore = biomarkerAnalysis.risk_assessment.score;
          biomarkerRisk = biomarkerAnalysis.risk_assessment.risk;
        }

        const insertPayload: any = {
          user_id: user.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          biomarker_summary_score: biomarkerScore,
          biomarker_risk: biomarkerRisk ? biomarkerRisk.toLowerCase() : null,
          created_at: new Date().toISOString(),
        };

        // attach session id when available
        if (typeof sessionId !== 'undefined' && sessionId !== null) {
          insertPayload.session_id = sessionId;
        }

        // ensure file_url is set to a string if available
        if (publicUrl) insertPayload.file_url = publicUrl;

        try {
          const { error: dbError } = await supabase.from("uploaded_reports").insert(insertPayload);
          if (dbError) {
            // If DB has not been migrated to include new columns, retry with minimal payload
            const detail = dbError.message || JSON.stringify(dbError);
            console.error('DB insert failed for', file.name, dbError);
            if (/column .* does not exist|unknown column|invalid input syntax/i.test(detail)) {
              // Build fallback payload with required columns only
              const fallback: any = {
                user_id: user.id,
                file_name: file.name,
                file_type: file.type,
                created_at: new Date().toISOString(),
              };
              if (publicUrl) fallback.file_url = publicUrl;
              if (sessionId) fallback.session_id = sessionId;

              const { error: fbErr } = await supabase.from("uploaded_reports").insert(fallback);
              if (fbErr) {
                console.error('Fallback DB insert also failed for', file.name, fbErr);
                const fbDetail = fbErr.message || JSON.stringify(fbErr);
                toast.error(`Failed to save report ${file.name}: ${fbDetail}`);
              }
            } else {
              toast.error(`Failed to save report ${file.name}: ${detail}`);
            }
          }
        } catch (err) {
          console.error('Unexpected error inserting report for', file.name, err);
          toast.error(`Failed to save report ${file.name}: ${String(err)}`);
        }
      }

      toast.success("Reports uploaded and analyzed (where possible)!");
      fetchReports();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Failed to upload reports. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (reportId: string) => {
    const { error } = await supabase
      .from("uploaded_reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      toast.error("Failed to delete report");
    } else {
      toast.success("Report deleted");
      fetchReports();
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes("pdf")) return <FileText className="w-5 h-5" />;
    if (fileType.includes("image")) return <Image className="w-5 h-5" />;
    return <FileSpreadsheet className="w-5 h-5" />;
  };

  if (loading || isLoadingReports) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Medical Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload blood or fluid reports for biomarker analysis
          </p>
        </div>

        {/* Info Card */}
        <Card variant="glass" className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Supported Biomarkers</p>
                <p className="text-xs text-muted-foreground">
                  TSH, T3, T4; Vitamin B12; Folate; Vitamin D; Serum ceruloplasmin; CSF alpha-synuclein; CSF phospho-tau; CSF NFL.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Zone */}
        <div
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.csv,.doc,.docx"
            multiple
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
              {isUploading ? (
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              ) : (
                <UploadIcon className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium">
                {isUploading ? "Uploading..." : "Drop files here or tap to browse (up to 10)"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                    PDF, JPG, PNG, CSV, DOC/DOCX — each up to 10MB. Uploading reports is optional.
                  </p>
            </div>
          </div>
        </div>

        {/* Uploaded Reports */}
        {reports.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Uploaded Reports ({reports.length})
            </h2>
            {reports.map((report) => (
              <Card key={report.id} variant="default">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground">
                      {getFileIcon(report.file_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {report.file_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.biomarker_summary_score !== null && (
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                          Score: {report.biomarker_summary_score}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(report.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground text-center px-4">
          Report analysis is informational only and does not affect your PD Risk
          Index unless enabled in settings.
        </p>
      </div>
    </AppLayout>
  );
}
