-- 1) Table
CREATE TABLE public.docs_field_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  original_header text,
  source_origin text NOT NULL DEFAULT 'system',
  visible_to_roles app_role[] DEFAULT '{}'::app_role[],
  editable_to_roles app_role[] DEFAULT '{}'::app_role[]
);

-- 2) RLS
ALTER TABLE public.docs_field_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read docs field config"
ON public.docs_field_config
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage docs field config"
ON public.docs_field_config
FOR ALL TO authenticated
USING (is_admin_or_superuser(auth.uid()))
WITH CHECK (is_admin_or_superuser(auth.uid()));

-- 3) Seed default fields
INSERT INTO public.docs_field_config (field_name, display_name, sort_order, source_origin) VALUES
  ('document_no',           'Document No',           10,  'aconex'),
  ('revision',              'Revision',              20,  'aconex'),
  ('title',                 'Title',                 30,  'aconex'),
  ('trade',                 'Trade',                 40,  'system'),
  ('discipline',            'Discipline',            50,  'aconex'),
  ('sheet_name',            'Sheet Name',            60,  'aconex'),
  ('series',                'Series',                70,  'aconex'),
  ('level_location',        'Level / Location',      80,  'aconex'),
  ('document_type',         'Document Type',         90,  'aconex'),
  ('organisation_raw',      'Organisation',          100, 'aconex'),
  ('aconex_status',         'Aconex Status',         110, 'aconex'),
  ('current_status',        'Current Status',        120, 'hdec'),
  ('is_submitted',          'Submitted',             130, 'hdec'),
  ('transmittal_number',    'Transmittal No',        140, 'aconex'),
  ('submitted_date',        'Submitted Date',        150, 'aconex'),
  ('approved_date',         'Approved Date',         160, 'aconex'),
  ('transmittal_due_date',  'Transmittal Due',       170, 'aconex'),
  ('days_due',              'Days Due',              180, 'system'),
  ('sub1_planned_date',     'Sub1 Planned',          200, 'hdec'),
  ('sub1_submission_date',  'Sub1 Submitted',        210, 'hdec'),
  ('sub1_approval_date',    'Sub1 Approved',         220, 'hdec'),
  ('sub1_approval_status',  'Sub1 Status',           230, 'hdec'),
  ('sub2_planned_date',     'Sub2 Planned',          240, 'hdec'),
  ('sub2_submission_date',  'Sub2 Submitted',        250, 'hdec'),
  ('sub2_approval_date',    'Sub2 Approved',         260, 'hdec'),
  ('sub2_approval_status',  'Sub2 Status',           270, 'hdec'),
  ('sub3_planned_date',     'Sub3 Planned',          280, 'hdec'),
  ('sub3_submission_date',  'Sub3 Submitted',        290, 'hdec'),
  ('sub3_approval_date',    'Sub3 Approved',         300, 'hdec'),
  ('sub3_approval_status',  'Sub3 Status',           310, 'hdec'),
  ('remarks',               'Remarks',               320, 'hdec'),
  ('risk',                  'Risk',                  330, 'system'),
  ('updated_at',            'Updated At',            900, 'system'),
  ('created_at',            'Created At',            910, 'system');