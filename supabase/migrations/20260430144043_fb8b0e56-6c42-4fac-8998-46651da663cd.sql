-- Header mappings table
CREATE TABLE public.import_header_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL CHECK (module IN ('tnc','defect')),
  header_alias text NOT NULL,
  target_field text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT import_header_mappings_unique UNIQUE (module, header_alias)
);

CREATE INDEX idx_import_header_mappings_module_active ON public.import_header_mappings(module, is_active);

ALTER TABLE public.import_header_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read header mappings"
ON public.import_header_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert header mappings"
ON public.import_header_mappings FOR INSERT TO authenticated
WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can update header mappings"
ON public.import_header_mappings FOR UPDATE TO authenticated
USING (is_admin_or_superuser(auth.uid()))
WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete non-system header mappings"
ON public.import_header_mappings FOR DELETE TO authenticated
USING (is_admin_or_superuser(auth.uid()) AND is_system = false);

CREATE OR REPLACE FUNCTION public.protect_system_header_mappings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_system = true THEN
    IF NEW.module IS DISTINCT FROM OLD.module
       OR NEW.header_alias IS DISTINCT FROM OLD.header_alias
       OR NEW.target_field IS DISTINCT FROM OLD.target_field
       OR NEW.is_system IS DISTINCT FROM OLD.is_system THEN
      RAISE EXCEPTION 'System header mappings cannot be modified (only note/is_active toggle allowed).';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
    RAISE EXCEPTION 'System header mappings cannot be deleted.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_system_header_mappings
BEFORE UPDATE OR DELETE ON public.import_header_mappings
FOR EACH ROW EXECUTE FUNCTION public.protect_system_header_mappings();

CREATE OR REPLACE FUNCTION public.bump_header_mappings_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_settings(key, value, updated_at)
  VALUES ('header_mappings_version', to_jsonb(extract(epoch from now())::bigint), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_bump_header_mappings_version
AFTER INSERT OR UPDATE OR DELETE ON public.import_header_mappings
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_header_mappings_version();

INSERT INTO public.import_header_mappings (module, header_alias, target_field, is_system) VALUES
('tnc','system','system',false),
('tnc','system name','system',false),
('tnc','itemno','item_no',true),
('tnc','item no','item_no',true),
('tnc','item_no','item_no',true),
('tnc','team','team',false),
('tnc','level','level',false),
('tnc','lv','level',false),
('tnc','equipment','equipment',false),
('tnc','description','description',false),
('tnc','mos-1','mos_1',false),
('tnc','mos-2','mos_2',false),
('tnc','mos-3','mos_3',false),
('tnc','mos-4','mos_4',false),
('tnc','mos-5','mos_5',false),
('tnc','mos code','mos_code',true),
('tnc','mos_code','mos_code',true),
('tnc','moscode','mos_code',true),
('tnc','subtest id','subtest_id',true),
('tnc','subtestid','subtest_id',true),
('tnc','subtest_id','subtest_id',true),
('tnc','t1 planned','t1_planned_date',false),
('tnc','t1planned','t1_planned_date',false),
('tnc','t1 planned date','t1_planned_date',false),
('tnc','t1_planned_date','t1_planned_date',false),
('tnc','t1 date','t1_planned_date',false),
('tnc','t1date','t1_planned_date',false),
('tnc','t1 status','t1_status',false),
('tnc','t1status','t1_status',false),
('tnc','t1_status','t1_status',false),
('tnc','t2 planned','t2_planned_date',false),
('tnc','t2planned','t2_planned_date',false),
('tnc','t2 planned date','t2_planned_date',false),
('tnc','t2_planned_date','t2_planned_date',false),
('tnc','t2 date','t2_planned_date',false),
('tnc','t2date','t2_planned_date',false),
('tnc','t2 status','t2_status',false),
('tnc','t2status','t2_status',false),
('tnc','t2_status','t2_status',false),
('tnc','predecessor status','predecessor_status_raw',false),
('tnc','pre decessor status','predecessor_status_raw',false),
('tnc','pre decessor','predecessor_status_raw',false),
('tnc','precessor status','predecessor_status_raw',false),
('tnc','predecessor','predecessor_status_raw',false),
('tnc','predecessor_status_raw','predecessor_status_raw',false),
('tnc','subcontractor','subcontractor_name',false),
('tnc','subcontractor name','subcontractor_name',false),
('tnc','subcontractor_name','subcontractor_name',false),
('tnc','subsub','subsub_name',false),
('tnc','sub-sub','subsub_name',false),
('tnc','sub sub','subsub_name',false),
('tnc','sub_sub','subsub_name',false),
('tnc','subsub name','subsub_name',false),
('tnc','subsub_name','subsub_name',false),
('tnc','sub-sub name','subsub_name',false),
('tnc','sub-subcontractor','subsub_name',false),
('tnc','sub subcontractor','subsub_name',false),
('tnc','subsubcontractor','subsub_name',false),
('tnc','sub_subcontractor','subsub_name',false),
('tnc','sub-sub contractor','subsub_name',false),
('tnc','sub-sub-contractor','subsub_name',false),
('tnc','hdec pic','hdec_pic_name',false),
('tnc','hdecpic','hdec_pic_name',false),
('tnc','hdec_pic_name','hdec_pic_name',false),
('tnc','hdec pic name','hdec_pic_name',false),
('tnc','r1 status','r1_status',false),
('tnc','r1status','r1_status',false),
('tnc','r1_status','r1_status',false),
('tnc','r1','r1_status',false),
('tnc','r1 (report review)','r1_status',false),
('tnc','r1 report review','r1_status',false),
('tnc','r2 status','r2_status',false),
('tnc','r2status','r2_status',false),
('tnc','r2_status','r2_status',false),
('tnc','r2','r2_status',false),
('tnc','r2 (review by consultant)','r2_status',false),
('tnc','r2 review by consultant','r2_status',false),
('tnc','r1 report ref','r1_report_ref',false),
('tnc','r1 report reference','r1_report_ref',false),
('tnc','r1_report_ref','r1_report_ref',false),
('tnc','r1 ref','r1_report_ref',false),
('tnc','r1 target submission','r1_target_submission_date',false),
('tnc','r1 target submission date','r1_target_submission_date',false),
('tnc','r1_target_submission_date','r1_target_submission_date',false),
('tnc','r1 actual submission','r1_actual_submission_date',false),
('tnc','r1 actual submission date','r1_actual_submission_date',false),
('tnc','r1_actual_submission_date','r1_actual_submission_date',false),
('tnc','r2 target submission','r2_target_submission_date',false),
('tnc','r2 target submission date','r2_target_submission_date',false),
('tnc','r2_target_submission_date','r2_target_submission_date',false),
('tnc','r2 actual submission','r2_actual_submission_date',false),
('tnc','r2 actual submission date','r2_actual_submission_date',false),
('tnc','r2_actual_submission_date','r2_actual_submission_date',false),
('tnc','r2 target approval','r2_target_approval_date',false),
('tnc','r2 target approval date','r2_target_approval_date',false),
('tnc','r2_target_approval_date','r2_target_approval_date',false),
('tnc','r2 actual approval','r2_actual_approval_date',false),
('tnc','r2 actual approval date','r2_actual_approval_date',false),
('tnc','r2_actual_approval_date','r2_actual_approval_date',false),
('tnc','aconex','aconex_ref_no',false),
('tnc','aconex ref','aconex_ref_no',false),
('tnc','aconex ref no','aconex_ref_no',false),
('tnc','aconex_ref_no','aconex_ref_no',false),
('tnc','aconex no','aconex_ref_no',false),
('tnc','remarks','remarks',false),
('tnc','remark','remarks',false),
('tnc','note','remarks',false),
('tnc','notes','remarks',false),
('tnc','punchlist','punchlist_comments',false),
('tnc','punch list','punchlist_comments',false),
('tnc','punchlist comments','punchlist_comments',false),
('tnc','punch list comments','punchlist_comments',false),
('tnc','punchlist_comments','punchlist_comments',false),
('tnc','punchlist comment','punchlist_comments',false),
('tnc','source','source',false),
('tnc','updated','updated_at',false),
('tnc','updated at','updated_at',false),
('tnc','updated_at','updated_at',false),
('defect','id','id',true),
('defect','uuid','id',true),
('defect','defect id','id',true),
('defect','issue no','issue_no',true),
('defect','issue number','issue_no',true),
('defect','issue type','defect_type',false),
('defect','area','area_raw',false),
('defect','location detail','area_location',false),
('defect','issue description','description',false),
('defect','description','description',false),
('defect','status','status',false),
('defect','field discipline','trade_detail',false),
('defect','defect prioritisation','priority',false),
('defect','priority','priority',false),
('defect','main trade','main_trade',false),
('defect','sub trade','sub_trade',false),
('defect','sub contractor','subcontractor_name',false),
('defect','subcontractor','subcontractor_name',false),
('defect','sub-sub','subsub_name',false),
('defect','subsub','subsub_name',false),
('defect','hdec pic','hdec_pic_name',false),
('defect','hdec p i c','hdec_pic_name',false),
('defect','hdec_pic','hdec_pic_name',false),
('defect','hdec pic name','hdec_pic_name',false),
('defect','hdec in charge','hdec_pic_name',false),
('defect','hdec person in charge','hdec_pic_name',false),
('defect','responsible pic','hdec_pic_name',false),
('defect','person in charge','hdec_pic_name',false),
('defect','hdec eng','hdec_eng_name',false),
('defect','hdec engineer','hdec_eng_name',false),
('defect','hdec_eng','hdec_eng_name',false),
('defect','hdec eng name','hdec_eng_name',false),
('defect','responsible engineer','hdec_eng_name',false),
('defect','engineer in charge','hdec_eng_name',false),
('defect','engineer','hdec_eng_name',false),
('defect','in charge','hdec_pic_name',false),
('defect','pic name','hdec_pic_name',false),
('defect','pic','hdec_pic_name',false),
('defect','담당자','hdec_pic_name',false),
('defect','담당','hdec_pic_name',false),
('defect','hdec 담당자','hdec_pic_name',false),
('defect','level','area_level',false),
('defect','location','area_location',false),
('defect','remarks','remarks',false),
('defect','comments','aconex_comments',false),
('defect','aconex comments','aconex_comments',false),
('defect','hdec comments','hdec_comments',false),
('defect','planned start date','planned_start_date',false),
('defect','planned completion date','planned_completion_date',false),
('defect','planned closure date','planned_closure_date',false),
('defect','actual start date','actual_start_date',false),
('defect','actual completion date','actual_completion_date',false),
('defect','actual closure date','actual_closure_date',false),
('defect','closed on','actual_closure_date',false),
('defect','closed date','actual_closure_date',false),
('defect','date closed','actual_closure_date',false),
('defect','closure date','actual_closure_date',false),
('defect','planned progress %','planned_progress_pct',false),
('defect','planned progress','planned_progress_pct',false),
('defect','actual progress %','actual_progress_pct',false),
('defect','actual progress','actual_progress_pct',false),
('defect','progress','actual_progress_pct',false),
('defect','completion status','completion_status',false),
('defect','closure status','closure_status',false),
('defect','work type','work_type',false),
('defect','subcontractor issue no','subcontractor_issue_no',false),
('defect','subcontractor no','subcontractor_issue_no',false),
('defect','subcontractor issue source','subcontractor_issue_source',false),
('defect','subcontractor issue no source','subcontractor_issue_source',false)
ON CONFLICT (module, header_alias) DO NOTHING;

INSERT INTO public.app_settings(key, value)
VALUES ('header_mappings_version', to_jsonb(extract(epoch from now())::bigint))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;