CREATE TYPE public.team_type AS ENUM ('Mech', 'Elec', 'Arch', 'Supp');

ALTER TABLE public.subtests
  ADD COLUMN team public.team_type NULL;