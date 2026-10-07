-- Marks whether a treatment's consumables are disposable (single-use).
-- Run once in the Supabase SQL editor.
ALTER TABLE public.apt_treatments
  ADD COLUMN IF NOT EXISTS supplies_disposable boolean NOT NULL DEFAULT false;
