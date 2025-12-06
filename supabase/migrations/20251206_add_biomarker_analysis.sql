-- Add biomarker_analysis column to store detailed analysis results
ALTER TABLE public.uploaded_reports 
ADD COLUMN biomarker_analysis JSONB;

-- Add biomarker_risk column to track overall risk
ALTER TABLE public.uploaded_reports 
ADD COLUMN biomarker_risk TEXT CHECK (biomarker_risk IN ('low', 'moderate', 'high'));
