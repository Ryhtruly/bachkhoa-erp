-- Add submitted_agency column to legal_submissions table
-- Stores the name of the government agency where the dossier was submitted
ALTER TABLE public.legal_submissions
  ADD COLUMN IF NOT EXISTS submitted_agency text;

COMMENT ON COLUMN public.legal_submissions.submitted_agency IS 'Cơ quan tiếp nhận hồ sơ (VD: Chi nhánh VP ĐKĐĐ, UBND Quận/Huyện, Sở Xây Dựng...)';
