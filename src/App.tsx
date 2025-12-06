import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import History from "./pages/History";
import Upload from "./pages/Upload";
import Profile from "./pages/Profile";
import HandTremorTest from "./pages/tests/HandTremorTest";
import VoiceTest from "./pages/tests/VoiceTest";
import FacialTest from "./pages/tests/FacialTest";
import Results from "./pages/tests/Results";
import SessionDetail from "./pages/SessionDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/history" element={<History />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/test/hand" element={<HandTremorTest />} />
            <Route path="/test/voice" element={<VoiceTest />} />
            <Route path="/test/facial" element={<FacialTest />} />
            <Route path="/test/results" element={<Results />} />
            <Route path="/session/:id" element={<SessionDetail />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
