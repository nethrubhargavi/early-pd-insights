-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create sessions table for test history
CREATE TABLE public.screening_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  hand_tremor_score NUMERIC(5,2),
  hand_tremor_frequency NUMERIC(5,2),
  hand_tremor_risk TEXT CHECK (hand_tremor_risk IN ('Low', 'Moderate', 'High')),
  voice_score NUMERIC(5,2),
  voice_risk TEXT CHECK (voice_risk IN ('Low', 'Moderate', 'High')),
  facial_blink_rate NUMERIC(5,2),
  facial_expressivity_score NUMERIC(5,2),
  facial_risk TEXT CHECK (facial_risk IN ('Low', 'Moderate', 'High')),
  final_risk_index NUMERIC(5,2),
  final_risk_category TEXT CHECK (final_risk_category IN ('Low', 'Moderate', 'High')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.screening_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions" ON public.screening_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own sessions" ON public.screening_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sessions" ON public.screening_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Create uploaded reports table
CREATE TABLE public.uploaded_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.screening_sessions(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  parsed_data JSONB,
  biomarker_summary_score NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.uploaded_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports" ON public.uploaded_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own reports" ON public.uploaded_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reports" ON public.uploaded_reports FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reports" ON public.uploaded_reports FOR DELETE USING (auth.uid() = user_id);

-- Create function to handle new user profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'full_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create storage bucket for reports
INSERT INTO storage.buckets (id, name, public) VALUES ('reports', 'reports', false);

CREATE POLICY "Users can upload their own reports" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their own reports" ON storage.objects FOR SELECT USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);