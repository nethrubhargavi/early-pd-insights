import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Brain, User, Copy, Check } from "lucide-react";
import { z } from "zod";

const patientIdSchema = z.object({
  patientId: z.string().min(6, "Patient ID must be at least 6 characters").max(20, "Patient ID must be at most 20 characters").regex(/^[A-Z0-9]+$/, "Patient ID must contain only uppercase letters and numbers"),
  fullName: z.string().min(2, "Name must be at least 2 characters").optional(),
});

// Generate a unique patient ID
const generatePatientId = () => {
  const prefix = "NP"; // NeuroPatient
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `${prefix}${timestamp}${random}`;
};

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [patientId, setPatientId] = useState("");
  const [fullName, setFullName] = useState("");
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleGenerateId = () => {
    const newId = generatePatientId();
    setGeneratedId(newId);
    setPatientId(newId);
  };

  const handleCopyId = async () => {
    if (generatedId) {
      await navigator.clipboard.writeText(generatedId);
      setCopied(true);
      toast.success("Patient ID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validationResult = patientIdSchema.safeParse({
        patientId: patientId.toUpperCase(),
        fullName: isLogin ? undefined : fullName,
      });

      if (!validationResult.success) {
        toast.error(validationResult.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const normalizedId = patientId.toUpperCase();
      // Use patient ID as email domain for Supabase auth
      const email = `${normalizedId}@neuroscreen.patient`;
      const password = `NS_${normalizedId}_2024`;

      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Invalid Patient ID. Please check and try again.");
          } else {
            toast.error("Login failed. Please try again.");
          }
        } else {
          toast.success("Welcome back!");
          navigate("/");
        }
      } else {
        if (!fullName.trim()) {
          toast.error("Please enter your full name");
          setIsLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("This Patient ID is already registered. Please sign in instead.");
          } else {
            toast.error("Registration failed. Please try again.");
          }
        } else {
          toast.success("Account created! Save your Patient ID safely.");
          navigate("/");
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gradient-surface">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary shadow-glow mb-4">
            <Brain className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">NeuroScreen</h1>
          <p className="text-muted-foreground">Early Parkinson's Risk Assessment</p>
        </div>

        <Card variant="elevated" className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">
              {isLogin ? "Patient Login" : "New Patient Registration"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? "Enter your Patient ID to access your records"
                : "Generate your unique Patient ID"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="Enter your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Generate Patient ID</Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGenerateId}
                    >
                      Generate Unique Patient ID
                    </Button>
                    {generatedId && (
                      <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                        <span className="font-mono text-lg font-bold text-primary flex-1">
                          {generatedId}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyId}
                          className="shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Save this ID securely. You'll need it to log in.
                    </p>
                  </div>
                </>
              )}

              {isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="patientId">Patient ID</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="patientId"
                      type="text"
                      placeholder="Enter your Patient ID (e.g., NP1A2B3C)"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value.toUpperCase())}
                      className="pl-10 font-mono uppercase"
                      maxLength={20}
                      required
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={isLoading || (!isLogin && !generatedId)}
              >
                {isLoading ? "Please wait..." : isLogin ? "Sign In" : "Register"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setPatientId("");
                  setGeneratedId(null);
                  setFullName("");
                }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {isLogin
                  ? "New patient? Register here"
                  : "Already registered? Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground px-4">
          By continuing, you agree to our Terms of Service and Privacy Policy.
          This app is for informational purposes only and is not a medical diagnosis tool.
        </p>
      </div>
    </div>
  );
}
