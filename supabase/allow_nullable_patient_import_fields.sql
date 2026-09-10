-- Patient imports keep usable values even when the source row has no name.
-- The remaining importable patient columns are already nullable in schema.sql.
ALTER TABLE public.apt_patients
  ALTER COLUMN name DROP NOT NULL;
