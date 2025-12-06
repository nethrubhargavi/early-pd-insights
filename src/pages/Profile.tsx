import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  User,
  Mail,
  Shield,
  LogOut,
  FileText,
  Bell,
  HelpCircle,
  ChevronRight,
  Brain,
} from "lucide-react";

export default function Profile() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  if (loading) {
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

  const menuItems = [
    { icon: Bell, label: "Notifications", description: "Manage reminders" },
    { icon: Shield, label: "Privacy & Data", description: "Your data controls" },
    { icon: FileText, label: "Export Data", description: "Download your records" },
    { icon: HelpCircle, label: "Help & Support", description: "FAQs and contact" },
  ];

  return (
    <AppLayout>
      <div className="px-4 pt-6 pb-4 space-y-6">
        {/* Profile Header */}
        <Card variant="gradient" className="overflow-hidden">
          <div className="gradient-hero p-6 text-primary-foreground">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center backdrop-blur">
                <Brain className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-display font-bold">
                  {user?.user_metadata?.full_name || "User"}
                </h2>
                <p className="text-sm opacity-90 flex items-center gap-1 mt-1">
                  <Mail className="w-3 h-3" />
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Sessions", value: "0" },
            { label: "Reports", value: "0" },
            { label: "Days Active", value: "1" },
          ].map((stat) => (
            <Card key={stat.label} variant="default" className="text-center py-4">
              <CardContent className="p-0">
                <p className="text-2xl font-display font-bold text-primary">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Menu Items */}
        <div className="space-y-2">
          {menuItems.map((item) => (
            <Card
              key={item.label}
              variant="interactive"
              className="cursor-pointer"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                    <item.icon className="w-5 h-5 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sign Out */}
        <Button
          variant="outline"
          size="lg"
          className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>

        {/* Version */}
        <p className="text-xs text-center text-muted-foreground">
          NeuroScreen v1.0.0 • Made with care
        </p>
      </div>
    </AppLayout>
  );
}
