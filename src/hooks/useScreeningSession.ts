import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SessionData {
  id: string;
  hand_tremor_score?: number;
  hand_tremor_frequency?: number;
  hand_tremor_risk?: string;
  voice_score?: number;
  voice_risk?: string;
  facial_expressivity_score?: number;
  facial_blink_rate?: number;
  facial_risk?: string;
  final_risk_index?: number;
  final_risk_category?: string;
}

export function useScreeningSession() {
  const { user } = useAuth();
  // Initialize from localStorage immediately to avoid race conditions
  const [sessionId, setSessionId] = useState<string | null>(() => {
    const stored = localStorage.getItem("active_session_id");
    if (stored) {
      console.log("Initialized sessionId from localStorage:", stored);
      return stored;
    }
    console.log("No session found in localStorage on init");
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Listen for external localStorage changes (e.g., from another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "active_session_id" && e.newValue) {
        console.log("Session ID updated from storage event:", e.newValue);
        setSessionId(e.newValue);
      } else if (e.key === "active_session_id" && !e.newValue) {
        console.log("Session ID cleared from storage event");
        setSessionId(null);
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const createSession = async (): Promise<string | null> => {
    if (!user) return null;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("screening_sessions")
        .insert({ user_id: user.id })
        .select("id")
        .single();

      if (error) {
        console.error("Error creating session:", error);
        return null;
      }

      const newSessionId = data.id;
      setSessionId(newSessionId);
      localStorage.setItem("active_session_id", newSessionId);
      console.log("Created new session:", newSessionId);
      return newSessionId;
    } catch (error) {
      console.error("Error creating session:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateSession = async (updates: Partial<SessionData>): Promise<boolean> => {
    try {
      // Ensure we have a session id; create one if missing
      const id = sessionId ?? (await getOrCreateSession());
      if (!id) {
        console.error("Unable to obtain or create a session to update");
        return false;
      }

      console.log("updateSession: updating session", id, "with:", updates);

      const { error } = await supabase
        .from("screening_sessions")
        .update(updates)
        .eq("id", id);

      if (error) {
        console.error("Error updating session:", error);
        return false;
      }

      // If we created a session via getOrCreateSession, ensure state/localStorage updated
      if (!sessionId) {
        setSessionId(id);
        localStorage.setItem("active_session_id", id);
      }

      console.log("Updated session:", id, updates);
      return true;
    } catch (error) {
      console.error("Error updating session:", error);
      return false;
    }
  };

  const completeSession = async (finalData: {
    final_risk_index: number;
    final_risk_category: string;
  }): Promise<boolean> => {
    try {
      const id = sessionId ?? (await getOrCreateSession());
      if (!id) {
        console.error("No session to complete");
        return false;
      }

      const { error } = await supabase
        .from("screening_sessions")
        .update({
          ...finalData,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        console.error("Error completing session:", error);
        return false;
      }

      localStorage.removeItem("active_session_id");
      setSessionId(null);
      console.log("Completed session:", id);
      return true;
    } catch (error) {
      console.error("Error completing session:", error);
      return false;
    }
  };

  const clearSession = () => {
    localStorage.removeItem("active_session_id");
    setSessionId(null);
  };

  const resumeSession = (id: string) => {
    setSessionId(id);
    localStorage.setItem("active_session_id", id);
  };

  const getOrCreateSession = async (): Promise<string | null> => {
    // Check state first
    if (sessionId) {
      console.log("getOrCreateSession: returning existing sessionId from state:", sessionId);
      return sessionId;
    }
    
    // Check localStorage in case it was set by resume (and state hasn't synced yet)
    const storedId = localStorage.getItem("active_session_id");
    if (storedId) {
      console.log("getOrCreateSession: found in localStorage, setting state:", storedId);
      setSessionId(storedId);
      return storedId;
    }
    
    // Otherwise create a new session
    console.log("getOrCreateSession: creating new session");
    return createSession();
  };

  return {
    sessionId,
    isLoading,
    createSession,
    updateSession,
    completeSession,
    clearSession,
    resumeSession,
    getOrCreateSession,
  };
}
