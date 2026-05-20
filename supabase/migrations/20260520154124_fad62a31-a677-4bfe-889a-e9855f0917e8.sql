
-- ============================================================
-- Daily Default Notice (DDN) — Phase 1 schema
-- ============================================================

-- 1. ddn_sections ----------------------------------------------
CREATE TABLE public.ddn_sections (
  id            text PRIMARY KEY,
  title_ko      text NOT NULL,
  title_en      text,
  display_order int  NOT NULL DEFAULT 0,
  collapsible   bool NOT NULL DEFAULT true,
  is_active     bool NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. ddn_fields ------------------------------------------------
CREATE TABLE public.ddn_fields (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      text NOT NULL REFERENCES public.ddn_sections(id) ON DELETE CASCADE,
  field_key       text NOT NULL UNIQUE,
  label_ko        text NOT NULL,
  label_en        text,
  help_text       text,
  data_type       text NOT NULL CHECK (data_type IN (
                    'text','number','date','time','radio_yn','radio',
                    'checkbox_multi','textarea','computed','repeatable_group','heading')),
  unit            text,
  required        bool NOT NULL DEFAULT false,
  default_value   jsonb,
  validation      jsonb,
  conditional_on  jsonb,
  display_order   int  NOT NULL DEFAULT 0,
  width           text NOT NULL DEFAULT 'full' CHECK (width IN ('full','half','third','quarter')),
  is_active       bool NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ddn_fields_section_order_idx ON public.ddn_fields(section_id, display_order);

-- 3. ddn_field_options -----------------------------------------
CREATE TABLE public.ddn_field_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id      uuid NOT NULL REFERENCES public.ddn_fields(id) ON DELETE CASCADE,
  value         text NOT NULL,
  label_ko      text NOT NULL,
  label_en      text,
  display_order int  NOT NULL DEFAULT 0,
  is_active     bool NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, value)
);
CREATE INDEX ddn_field_options_field_order_idx ON public.ddn_field_options(field_id, display_order);

-- 4. ddn_settings (singleton) ----------------------------------
CREATE TABLE public.ddn_settings (
  id                       text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  master_notice_ref        text,
  master_notice_date       date,
  day1_date                date,
  letter_no_prefix         text DEFAULT 'HD/SHAW/SC/26-',
  letter_no_next           int  DEFAULT 1,
  pm_absence_start_date    date,
  contract_completion_date date,
  ld_daily_rate_sgd        numeric DEFAULT 121000,
  ld_cap_sgd               numeric DEFAULT 3630000,
  pm_daily_rate_sgd        numeric DEFAULT 1000,
  hdec_manday_rate_sgd     numeric DEFAULT 1500,
  hdec_korean_md_rate_sgd  numeric DEFAULT 2000,
  admin_overhead_pct       numeric DEFAULT 0.03,
  avg_ncr_external_cost    numeric DEFAULT 20000,
  avg_def_external_cost    numeric DEFAULT 2000,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- 5. ddn_entries -----------------------------------------------
CREATE TABLE public.ddn_entries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date             date NOT NULL UNIQUE,
  letter_no              text,
  day_n                  int,
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','sent')),
  inputs                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_letter_html  text,
  generated_docx_path    text,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ddn_entries_date_idx ON public.ddn_entries(entry_date DESC);

-- updated_at trigger ------------------------------------------
CREATE TRIGGER ddn_sections_updated_at
  BEFORE UPDATE ON public.ddn_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ddn_fields_updated_at
  BEFORE UPDATE ON public.ddn_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ddn_settings_updated_at
  BEFORE UPDATE ON public.ddn_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ddn_entries_updated_at
  BEFORE UPDATE ON public.ddn_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS ----------------------------------------------------------
ALTER TABLE public.ddn_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ddn_fields        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ddn_field_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ddn_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ddn_entries       ENABLE ROW LEVEL SECURITY;

-- Schema tables: read for any authenticated, write for admin
CREATE POLICY ddn_sections_select ON public.ddn_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ddn_sections_admin_write ON public.ddn_sections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY ddn_fields_select ON public.ddn_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ddn_fields_admin_write ON public.ddn_fields
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY ddn_field_options_select ON public.ddn_field_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ddn_field_options_admin_write ON public.ddn_field_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Settings: read any auth, write admin
CREATE POLICY ddn_settings_select ON public.ddn_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ddn_settings_admin_write ON public.ddn_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Entries: read any auth, write superuser/admin
CREATE POLICY ddn_entries_select ON public.ddn_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ddn_entries_super_write ON public.ddn_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superuser') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'superuser') OR public.has_role(auth.uid(), 'admin'));

-- Seed singleton settings row ---------------------------------
INSERT INTO public.ddn_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

-- Seed sections ------------------------------------------------
INSERT INTO public.ddn_sections (id, title_ko, title_en, display_order, collapsible) VALUES
  ('planned_tests', '금일 계획된 테스트', 'Today''s Planned Testing Programme', 1, false),
  ('sec1', '§1. Cl.4.8 Superintendence (인원·감독)', 'Superintendence', 2, true),
  ('sec2', '§2. Art.11.1(c)(ii) Progress', 'Progress', 3, true),
  ('sec3', '§3. Art.11.1(e) NCR/Defects', 'NCR / Defects', 4, true),
  ('sec4', '§4. Art.6.1 Substantial Completion', 'Substantial Completion', 5, true),
  ('sec5', '§5. Cl.7.2 Procurement', 'Procurement', 6, true),
  ('sec6', '§6. Cl.4.6 Work to Satisfaction', 'Work to Satisfaction', 7, true),
  ('sec7', '§7. HSE — Special HSE Conditions Cl.6.2', 'HSE', 8, true),
  ('sec8', '§8. 누적 (자동 계산)', 'Cumulative (auto)', 9, true);

-- Seed fields --------------------------------------------------
-- planned_tests (fixed top)
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('planned_tests','planned_tests.pred_systems','Pred — 시스템·Level','Pred — Systems/Level','text',NULL,10,'full'),
  ('planned_tests','planned_tests.pred_plan','Pred — 계획 건수','Pred — Planned','number','건',11,'third'),
  ('planned_tests','planned_tests.pred_actual','Pred — 실적 건수','Pred — Actual','number','건',12,'third'),
  ('planned_tests','planned_tests.pred_pct','Pred — 달성률','Pred — Achievement','computed','%',13,'third'),
  ('planned_tests','planned_tests.t1_systems','T1 — 시스템·Level','T1 — Systems/Level','text',NULL,20,'full'),
  ('planned_tests','planned_tests.t1_plan','T1 — 계획 건수','T1 — Planned','number','건',21,'third'),
  ('planned_tests','planned_tests.t1_actual','T1 — 실적 건수','T1 — Actual','number','건',22,'third'),
  ('planned_tests','planned_tests.t1_pct','T1 — 달성률','T1 — Achievement','computed','%',23,'third'),
  ('planned_tests','planned_tests.t2_systems','T2 — 시스템·Level','T2 — Systems/Level','text',NULL,30,'full'),
  ('planned_tests','planned_tests.t2_plan','T2 — 계획 건수','T2 — Planned','number','건',31,'third'),
  ('planned_tests','planned_tests.t2_actual','T2 — 실적 건수','T2 — Actual','number','건',32,'third'),
  ('planned_tests','planned_tests.t2_pct','T2 — 달성률','T2 — Achievement','computed','%',33,'third'),
  ('planned_tests','planned_tests.delayed_items','지연 항목 + 사유','Delayed items with reasons','repeatable_group',NULL,40,'full');

-- §1 Superintendence
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec1','sec1.pm_attended','PM 현장 출근','PM attended Site','radio_yn',NULL,10,'half'),
  ('sec1','sec1.pm_time','PM 출근 시각','PM arrival time','time',NULL,11,'half'),
  ('sec1','sec1.eng_planned','Engineer (Elec) — 계획','Engineer (Elec) — planned','number','명',20,'half'),
  ('sec1','sec1.eng_actual','Engineer (Elec) — 실제','Engineer (Elec) — actual','number','명',21,'half'),
  ('sec1','sec1.sup_planned','Supervisor (Elec) — 계획','Supervisor (Elec) — planned','number','명',22,'half'),
  ('sec1','sec1.sup_actual','Supervisor (Elec) — 실제','Supervisor (Elec) — actual','number','명',23,'half'),
  ('sec1','sec1.elv_eng_planned','ELV Engineer — 계획','ELV Engineer — planned','number','명',24,'half'),
  ('sec1','sec1.elv_eng_actual','ELV Engineer — 실제','ELV Engineer — actual','number','명',25,'half'),
  ('sec1','sec1.elv_sup_planned','ELV Supervisor — 계획','ELV Supervisor — planned','number','명',26,'half'),
  ('sec1','sec1.elv_sup_actual','ELV Supervisor — 실제','ELV Supervisor — actual','number','명',27,'half'),
  ('sec1','sec1.doc_staff','문서작업 전담 인력','Dedicated documentation staff','radio',NULL,30,'half'),
  ('sec1','sec1.doc_staff_count','문서작업 인원 수','Documentation staff count','number','명',31,'half'),
  ('sec1','sec1.meet_0900','09:00 미팅 PM 참석','09:00 meeting PM attended','radio_yn',NULL,40,'half'),
  ('sec1','sec1.meet_1700','17:00 미팅 PM 참석','17:00 meeting PM attended','radio_yn',NULL,41,'half'),
  ('sec1','sec1.tbm_0730','07:30 TBM 참석','07:30 TBM attended','radio_yn',NULL,42,'half'),
  ('sec1','sec1.manpower_0800','08:00 전 Manpower 보고 제출','08:00 manpower report','radio_yn',NULL,43,'half'),
  ('sec1','sec1.hdec_substitution','HDEC 대행 업무 (오늘)','HDEC substituted duties (today)','checkbox_multi',NULL,50,'full'),
  ('sec1','sec1.hdec_substitution_target','Sub-con 직접 관리·지시 — 대상','Direct management — target','text',NULL,51,'full'),
  ('sec1','sec1.hdec_substitution_other','기타 대행 내용','Other substituted duties','text',NULL,52,'full');

-- §2 Progress
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec2','sec2.delay_days','누적 지연일','Cumulative delay days','computed','일',10,'half'),
  ('sec2','sec2.ld_accumulated','LD 누적','LD accumulated','computed','SGD',11,'half'),
  ('sec2','sec2.facade_cum','Façade Lighting Turn-on 누적','Façade Lighting cumulative','number','m',20,'third'),
  ('sec2','sec2.facade_today','Façade 신규 점등 (오늘)','Façade new turn-on (today)','number','m',21,'third'),
  ('sec2','sec2.facade_defect','Façade 잔여 Defect','Façade outstanding defects','number','m',22,'third'),
  ('sec2','sec2.op_24h','24-hour Operation 시행','24-hour operation','radio_yn',NULL,30,'half');

-- §3 NCR / Defects
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec3','sec3.ncr_open','NCR Open 건수','NCR open','number','건',10,'third'),
  ('sec3','sec3.ncr_closed_today','NCR 신규 closure (오늘)','NCR closed today','number','건',11,'third'),
  ('sec3','sec3.ncr_new_today','NCR 신규 발생 (오늘)','NCR new today','number','건',12,'third'),
  ('sec3','sec3.def_open','Defects Open 건수','Defects open','number','건',20,'third'),
  ('sec3','sec3.def_closed_today','Defects 신규 closure (오늘)','Defects closed today','number','건',21,'third'),
  ('sec3','sec3.def_new_today','Defects 신규 발생 (오늘)','Defects new today','number','건',22,'third'),
  ('sec3','sec3.tc_reject','T&C Reject 발생 (오늘)','T&C reject today','radio',NULL,30,'full'),
  ('sec3','sec3.tc_reject_system','T&C Reject — 시스템','T&C reject — system','text',NULL,31,'third'),
  ('sec3','sec3.tc_reject_level','T&C Reject — Level','T&C reject — level','text',NULL,32,'third'),
  ('sec3','sec3.tc_reject_reason','T&C Reject — 사유','T&C reject — reason','text',NULL,33,'third'),
  ('sec3','sec3.archi_rework_plan','Architectural rework 시정 plan (HD-378)','Architectural rework plan','radio',NULL,40,'full');

-- §4 Substantial Completion
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec4','sec4.asbuilt_cum','As-Built ELEC 누적 제출','As-Built ELEC cumulative','number','/567',10,'half'),
  ('sec4','sec4.asbuilt_today','As-Built 신규 제출 (오늘)','As-Built new today','number','건',11,'half'),
  ('sec4','sec4.om_elec','O&M Electrical 재제출','O&M Electrical resubmission','radio',NULL,20,'half'),
  ('sec4','sec4.om_elv','O&M ELV 제출','O&M ELV submission','radio',NULL,21,'half'),
  ('sec4','sec4.warranty','Warranty 서명본 제출','Warranty signed copy','radio',NULL,30,'half'),
  ('sec4','sec4.gm_led_driver','Green Mark — LED driver losses','Green Mark — LED driver losses','radio',NULL,40,'half'),
  ('sec4','sec4.gm_power_tab','Green Mark — lighting power tab','Green Mark — lighting power tabulation','radio',NULL,41,'half');

-- §5 Procurement
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec5','sec5.cctv_po','CCTV PO 발행','CCTV PO issued','radio',NULL,10,'half'),
  ('sec5','sec5.cctv_po_date','CCTV PO 발행일','CCTV PO date','date',NULL,11,'half'),
  ('sec5','sec5.cctv_eta','CCTV 자재 ETA','CCTV material ETA','radio',NULL,20,'half'),
  ('sec5','sec5.cctv_eta_date','CCTV ETA 일자','CCTV ETA date','date',NULL,21,'half'),
  ('sec5','sec5.strobe','Strobe / Panic Alarm 자재','Strobe / Panic Alarm materials','radio',NULL,30,'half'),
  ('sec5','sec5.pole_lighting','Pole Lighting 납기 일정 제출','Pole Lighting delivery schedule','radio',NULL,40,'half'),
  ('sec5','sec5.special_lighting','Special Lighting 납기 일정 제출','Special Lighting delivery schedule','radio',NULL,41,'half'),
  ('sec5','sec5.x15_quote','X15/X15a/P1 대체 견적 제출','X15/X15a/P1 substitute quotation','radio',NULL,50,'half'),
  ('sec5','sec5.temp_elec','Temp Electrical 사용 중','Temp Electrical in use','radio',NULL,60,'half');

-- §6 Work to Satisfaction
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec6','sec6.pt_unaware','PT 자기 작업 미파악 사례','PT unaware of own work','radio',NULL,10,'half'),
  ('sec6','sec6.pt_unaware_detail','PT 미파악 사례 상세','PT unaware — detail','textarea',NULL,11,'full'),
  ('sec6','sec6.pt_dispute','PT 내부 노동분쟁 영향','PT internal labour dispute','radio',NULL,20,'half'),
  ('sec6','sec6.pt_dispute_detail','PT 노동분쟁 상세','PT dispute — detail','textarea',NULL,21,'full'),
  ('sec6','sec6.t1_substitute','Internal Test (T1) HDEC 대행 건수','T1 HDEC substituted count','number','건',30,'third'),
  ('sec6','sec6.mos_unlearned','MOS 미학습 진행 T&C 건수','MOS unlearned T&C count','number','건',31,'third'),
  ('sec6','sec6.hubble_reject','Hubble RTO Reject (오늘)','Hubble RTO Reject (today)','number','건',32,'third'),
  ('sec6','sec6.rto_cctv','RTO 미처리 — CCTV','RTO outstanding — CCTV','number','건',40,'quarter'),
  ('sec6','sec6.rto_fi','RTO 미처리 — FI','RTO outstanding — FI','number','건',41,'quarter'),
  ('sec6','sec6.rto_oi','RTO 미처리 — OI','RTO outstanding — OI','number','건',42,'quarter'),
  ('sec6','sec6.rto_smart','RTO 미처리 — Smart Lighting','RTO outstanding — Smart Lighting','number','건',43,'quarter'),
  ('sec6','sec6.rto_pa','RTO 미처리 — PA','RTO outstanding — PA','number','건',44,'quarter'),
  ('sec6','sec6.cross_damage','Cross-trade damage','Cross-trade damage','radio',NULL,50,'full'),
  ('sec6','sec6.cross_damage_location','Cross-trade damage — 위치','Cross-trade damage — location','text',NULL,51,'third'),
  ('sec6','sec6.cross_damage_trade','Cross-trade damage — trade','Cross-trade damage — trade','text',NULL,52,'third'),
  ('sec6','sec6.cross_damage_cost','Cross-trade damage — 예상비용','Cross-trade damage — est. cost','number','SGD',53,'third'),
  ('sec6','sec6.pt_other_rework','PT 작업으로 인한 타 trade rework','PT-caused rework by other trades','number','건',60,'half');

-- §7 HSE
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec7','sec7.safety_violations','PT 안전 위반','PT safety violations','number','건',10,'half'),
  ('sec7','sec7.working_hour_violation','PT 작업시간 위반 (07~22시 외)','Working-hour violation','radio',NULL,20,'half'),
  ('sec7','sec7.working_hour_detail','작업시간 위반 — 사례','Working-hour violation — case','text',NULL,21,'full'),
  ('sec7','sec7.env_violations','PT 환경 위반','PT environmental violations','number','건',30,'half'),
  ('sec7','sec7.hse_penalty_count','HSE Penalty — 건수','HSE Penalty — count','number','건',40,'half'),
  ('sec7','sec7.hse_penalty_amount','HSE Penalty — 금액','HSE Penalty — amount','number','SGD',41,'half');

-- §8 Cumulative (mostly computed + 2 inputs)
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, display_order, width) VALUES
  ('sec8','sec8.input_korean_md','HDEC 한국인 PT-대행 man-days (오늘 추가)','HDEC Korean MD added today','number','MD',10,'half'),
  ('sec8','sec8.input_hdec_md','HDEC 보조 man-days (오늘 추가)','HDEC supervision MD added today','number','MD',11,'half'),
  ('sec8','sec8.cum_pm_absent','PM 결근 누적 일수','PM absent days (cum.)','computed','일',20,'third'),
  ('sec8','sec8.cum_hdec_md','HDEC 보조 man-days 누적','HDEC supervision MD (cum.)','computed','MD',21,'third'),
  ('sec8','sec8.cum_korean_md','HDEC 한국인 PT-대행 man-days 누적','HDEC Korean MD (cum.)','computed','MD',22,'third'),
  ('sec8','sec8.cum_pm_charge','PM Back-charge 누적','PM back-charge (cum.)','computed','SGD',30,'third'),
  ('sec8','sec8.cum_def_ncr_cost','Defects/NCR 외주비 추정','Defects/NCR external cost est.','computed','SGD',31,'third'),
  ('sec8','sec8.cum_hse_penalty','HSE Penalty 누적','HSE Penalty (cum.)','computed','SGD',32,'third'),
  ('sec8','sec8.cum_ld','LD 누적','LD (cum.)','computed','SGD',40,'half'),
  ('sec8','sec8.aggregate','Aggregate Back-Charge','Aggregate Back-Charge','computed','SGD',41,'half'),
  ('sec8','sec8.delta_yesterday','Change vs yesterday','Change vs yesterday','computed','SGD',50,'full');

-- Conditional rules (only show child when parent has specific value)
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec1.doc_staff','equals','present') WHERE field_key='sec1.doc_staff_count';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec3.tc_reject','equals','yes')      WHERE field_key IN ('sec3.tc_reject_system','sec3.tc_reject_level','sec3.tc_reject_reason');
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec5.cctv_po','equals','issued')      WHERE field_key='sec5.cctv_po_date';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec5.cctv_eta','equals','confirmed')  WHERE field_key='sec5.cctv_eta_date';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec6.pt_unaware','equals','yes')      WHERE field_key='sec6.pt_unaware_detail';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec6.pt_dispute','equals','yes')      WHERE field_key='sec6.pt_dispute_detail';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec6.cross_damage','equals','yes')    WHERE field_key IN ('sec6.cross_damage_location','sec6.cross_damage_trade','sec6.cross_damage_cost');
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec7.working_hour_violation','equals','yes') WHERE field_key='sec7.working_hour_detail';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec1.hdec_substitution','contains','sub_management') WHERE field_key='sec1.hdec_substitution_target';
UPDATE public.ddn_fields SET conditional_on = jsonb_build_object('field_key','sec1.hdec_substitution','contains','other')         WHERE field_key='sec1.hdec_substitution_other';

-- Seed options ------------------------------------------------
-- sec1.doc_staff radio
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'present','있음','Present',1 FROM public.ddn_fields WHERE field_key='sec1.doc_staff';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'absent','없음','Absent',2 FROM public.ddn_fields WHERE field_key='sec1.doc_staff';

-- sec1.hdec_substitution checkbox_multi
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT f.id, v.value, v.label_ko, v.label_en, v.display_order
FROM public.ddn_fields f, (VALUES
  ('sub_management','Sub-con 직접 관리·지시','direct management of the Subcontractor''s sub-contractor',1),
  ('t1_perform','Internal Test (T1) 수행','performance of Internal Tests (T1)',2),
  ('sub_review','Sub-con 서류 검토','review of sub-contractor submissions',3),
  ('tnc_prep','T&C 준비·실행','preparation and execution of Testing & Commissioning',4),
  ('other','기타','other',5)
) AS v(value,label_ko,label_en,display_order)
WHERE f.field_key='sec1.hdec_substitution';

-- sec3.tc_reject radio
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'no','없음','None',1 FROM public.ddn_fields WHERE field_key='sec3.tc_reject';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'yes','있음','Yes',2 FROM public.ddn_fields WHERE field_key='sec3.tc_reject';

-- sec3.archi_rework_plan radio (submitted/not)
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'submitted','제출','Submitted',1 FROM public.ddn_fields WHERE field_key='sec3.archi_rework_plan';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'not_submitted','미제출','Not submitted',2 FROM public.ddn_fields WHERE field_key='sec3.archi_rework_plan';

-- sec4: standard submitted/not_submitted radios
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT f.id, v.value, v.label_ko, v.label_en, v.display_order
FROM public.ddn_fields f, (VALUES ('submitted','제출','Submitted',1),('not_submitted','미제출','Not submitted',2)) AS v(value,label_ko,label_en,display_order)
WHERE f.field_key IN ('sec4.om_elec','sec4.om_elv','sec4.warranty','sec4.gm_led_driver','sec4.gm_power_tab',
                      'sec5.pole_lighting','sec5.special_lighting','sec5.x15_quote');

-- sec5.cctv_po
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'issued','발행','Issued',1 FROM public.ddn_fields WHERE field_key='sec5.cctv_po';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'not_issued','미발행','Not issued',2 FROM public.ddn_fields WHERE field_key='sec5.cctv_po';

-- sec5.cctv_eta
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'confirmed','확정','Confirmed',1 FROM public.ddn_fields WHERE field_key='sec5.cctv_eta';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'unknown','불명','Unknown',2 FROM public.ddn_fields WHERE field_key='sec5.cctv_eta';

-- sec5.strobe
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'arrived','도착','Arrived',1 FROM public.ddn_fields WHERE field_key='sec5.strobe';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'not_arrived','미도착','Not arrived',2 FROM public.ddn_fields WHERE field_key='sec5.strobe';

-- sec5.temp_elec
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'normal','정상','Normal',1 FROM public.ddn_fields WHERE field_key='sec5.temp_elec';
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT id,'in_use','사용 중','In use',2 FROM public.ddn_fields WHERE field_key='sec5.temp_elec';

-- sec6.pt_unaware, sec6.pt_dispute, sec6.cross_damage : no/yes
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT f.id, v.value, v.label_ko, v.label_en, v.display_order
FROM public.ddn_fields f, (VALUES ('no','없음','None',1),('yes','있음','Yes',2)) AS v(value,label_ko,label_en,display_order)
WHERE f.field_key IN ('sec6.pt_unaware','sec6.pt_dispute','sec6.cross_damage','sec7.working_hour_violation');

-- repeatable group child option keys (used by UI to render reasons)
-- planned_tests.delayed_items: store available reasons as field options for reuse
INSERT INTO public.ddn_field_options (field_id, value, label_ko, label_en, display_order)
SELECT f.id, v.value, v.label_ko, v.label_en, v.display_order
FROM public.ddn_fields f, (VALUES
  ('pt_unaware','PT 자기 작업현황 미파악','PT unaware of own work status',1),
  ('material_late','자재 미도착 (PO 지연)','Material not arrived (PO delay)',2),
  ('manpower_short','PT 인력 부족','PT manpower shortage',3),
  ('reject_rework','Reject 후 재작업','Rework after reject',4),
  ('subcon_mgmt','Sub-contractor 관리 부재','Sub-contractor management failure',5),
  ('no_internal_test','Internal Test 미수행','Internal Test not performed',6),
  ('mos_unlearned','MOS 미학습','MOS not studied',7),
  ('pt_internal','PT 내부 분쟁','PT internal dispute',8),
  ('other','기타','Other',9)
) AS v(value,label_ko,label_en,display_order)
WHERE f.field_key='planned_tests.delayed_items';
