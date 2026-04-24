
-- 1. defect_items: 신규 3개 컬럼
ALTER TABLE public.defect_items
  ADD COLUMN work_type text,
  ADD COLUMN classification_source text,
  ADD COLUMN classified_at timestamptz;

CREATE INDEX idx_defect_items_work_type ON public.defect_items(work_type);
CREATE INDEX idx_defect_items_classification_source ON public.defect_items(classification_source);

-- 2. defect_classification_rules
CREATE TABLE public.defect_classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL UNIQUE,
  main_trade text NOT NULL,
  sub_trade text NOT NULL,
  work_type text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_defect_classification_rules_active_priority
  ON public.defect_classification_rules(is_active, priority);

ALTER TABLE public.defect_classification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read classification rules"
  ON public.defect_classification_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage classification rules"
  ON public.defect_classification_rules FOR ALL
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()))
  WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_defect_classification_rules_updated_at
  BEFORE UPDATE ON public.defect_classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. defect_discipline_fallback
CREATE TABLE public.defect_discipline_fallback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_discipline text NOT NULL UNIQUE,
  main_trade text NOT NULL,
  sub_trade text NOT NULL,
  work_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_defect_discipline_fallback_active
  ON public.defect_discipline_fallback(is_active, field_discipline);

ALTER TABLE public.defect_discipline_fallback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read discipline fallback"
  ON public.defect_discipline_fallback FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage discipline fallback"
  ON public.defect_discipline_fallback FOR ALL
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()))
  WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_defect_discipline_fallback_updated_at
  BEFORE UPDATE ON public.defect_discipline_fallback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
