-- ddn_mapping_rules
CREATE TABLE public.ddn_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  section_id text NOT NULL REFERENCES public.ddn_sections(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  condition jsonb NOT NULL DEFAULT '{"type":"always"}'::jsonb,
  template text NOT NULL,
  style text NOT NULL DEFAULT 'paragraph',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ddn_mapping_rules_section ON public.ddn_mapping_rules(section_id, display_order);

ALTER TABLE public.ddn_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ddn_mapping_rules_select_auth"
ON public.ddn_mapping_rules FOR SELECT
TO authenticated USING (true);

CREATE POLICY "ddn_mapping_rules_admin_insert"
ON public.ddn_mapping_rules FOR INSERT
TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ddn_mapping_rules_admin_update"
ON public.ddn_mapping_rules FOR UPDATE
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ddn_mapping_rules_admin_delete"
ON public.ddn_mapping_rules FOR DELETE
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ddn_mapping_rules_updated_at
BEFORE UPDATE ON public.ddn_mapping_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed rules
INSERT INTO public.ddn_mapping_rules (rule_key, section_id, display_order, condition, template, style) VALUES
-- planned_tests
('pt.pred_summary', 'planned_tests', 10, '{"type":"neq","field":"planned_tests.pred_systems","value":""}'::jsonb,
 'Predictive testing planned for {{planned_tests.pred_systems}}: {{planned_tests.pred_actual}}/{{planned_tests.pred_plan}} achieved ({{computed.planned_tests.pred_pct}}%).', 'paragraph'),
('pt.t1_summary', 'planned_tests', 20, '{"type":"neq","field":"planned_tests.t1_systems","value":""}'::jsonb,
 'T1 functional testing for {{planned_tests.t1_systems}}: {{planned_tests.t1_actual}}/{{planned_tests.t1_plan}} achieved ({{computed.planned_tests.t1_pct}}%).', 'paragraph'),
('pt.t2_summary', 'planned_tests', 30, '{"type":"neq","field":"planned_tests.t2_systems","value":""}'::jsonb,
 'T2 system testing for {{planned_tests.t2_systems}}: {{planned_tests.t2_actual}}/{{planned_tests.t2_plan}} achieved ({{computed.planned_tests.t2_pct}}%).', 'paragraph'),
('pt.delayed_loop', 'planned_tests', 40, '{"type":"exists","field":"planned_tests.delayed_items"}'::jsonb,
 '{{loop:planned_tests.delayed_items}}- {{name}} ({{list:reasons}}){{/loop}}', 'bullet'),

-- sec1 Superintendence
('sec1.pm_absence', 'sec1', 10, '{"type":"eq","field":"sec1.pm_attended","value":"N"}'::jsonb,
 'PM was absent again on {{date:entry_date}} (Day {{day_n}}).', 'paragraph'),
('sec1.pm_attended', 'sec1', 11, '{"type":"and","of":[{"type":"eq","field":"sec1.pm_attended","value":"Y"},{"type":"neq","field":"sec1.pm_time","value":""}]}'::jsonb,
 'PM attended site at {{sec1.pm_time}}.', 'paragraph'),
('sec1.eng_shortfall', 'sec1', 20, '{"type":"always"}'::jsonb,
 'Engineering staff onsite: {{sec1.eng_actual}} of {{sec1.eng_planned}} planned. Supervision staff: {{sec1.sup_actual}} of {{sec1.sup_planned}} planned.', 'paragraph'),
('sec1.elv_shortfall', 'sec1', 21, '{"type":"or","of":[{"type":"gt","field":"sec1.elv_eng_planned","value":0},{"type":"gt","field":"sec1.elv_sup_planned","value":0}]}'::jsonb,
 'ELV engineering staff: {{sec1.elv_eng_actual}}/{{sec1.elv_eng_planned}}. ELV supervision: {{sec1.elv_sup_actual}}/{{sec1.elv_sup_planned}}.', 'paragraph'),
('sec1.meet_0900_missed', 'sec1', 30, '{"type":"eq","field":"sec1.meet_0900","value":"N"}'::jsonb,
 'The 09:00 coordination meeting was not attended by the Contractor.', 'paragraph'),
('sec1.meet_1700_missed', 'sec1', 31, '{"type":"eq","field":"sec1.meet_1700","value":"N"}'::jsonb,
 'The 17:00 wrap-up meeting was not attended by the Contractor.', 'paragraph'),
('sec1.tbm_missed', 'sec1', 32, '{"type":"eq","field":"sec1.tbm_0730","value":"N"}'::jsonb,
 'The 07:30 Toolbox Meeting (TBM) was not held.', 'paragraph'),
('sec1.manpower_missed', 'sec1', 33, '{"type":"eq","field":"sec1.manpower_0800","value":"N"}'::jsonb,
 'The 08:00 manpower roll-call was not conducted.', 'paragraph'),
('sec1.hdec_substitution', 'sec1', 40, '{"type":"exists","field":"sec1.hdec_substitution"}'::jsonb,
 'HDEC has had to substitute the Contractor in the following PM duties: {{list:sec1.hdec_substitution}}.', 'paragraph'),

-- sec2 Progress
('sec2.delay_intro', 'sec2', 10, '{"type":"gt","field":"computed.sec2.delay_days","value":0}'::jsonb,
 'Project completion is delayed by {{computed.sec2.delay_days}} days against the contractual completion date {{date:settings.contract_completion_date}}. Accumulated LD to date: SGD {{computed.sec2.ld_accumulated}}.', 'paragraph'),
('sec2.facade_progress', 'sec2', 20, '{"type":"gt","field":"sec2.facade_cum","value":0}'::jsonb,
 'Facade installation cumulative: {{sec2.facade_cum}} panels (today +{{sec2.facade_today}}); outstanding defects: {{sec2.facade_defect}}.', 'paragraph'),
('sec2.no_24h', 'sec2', 30, '{"type":"eq","field":"sec2.op_24h","value":"N"}'::jsonb,
 '24-hour operations were not implemented despite the schedule slippage.', 'paragraph'),

-- sec3 NCR / Defects
('sec3.ncr_status', 'sec3', 10, '{"type":"always"}'::jsonb,
 'NCR status — Open: {{sec3.ncr_open}}, Closed today: {{sec3.ncr_closed_today}}, Newly raised today: {{sec3.ncr_new_today}}.', 'paragraph'),
('sec3.def_status', 'sec3', 11, '{"type":"always"}'::jsonb,
 'Defect status — Open: {{sec3.def_open}}, Closed today: {{sec3.def_closed_today}}, Newly raised today: {{sec3.def_new_today}}.', 'paragraph'),
('sec3.tc_reject', 'sec3', 20, '{"type":"eq","field":"sec3.tc_reject","value":"Y"}'::jsonb,
 'A T&C rejection was issued for {{sec3.tc_reject_system}} ({{sec3.tc_reject_level}}). Reason: {{sec3.tc_reject_reason}}.', 'paragraph'),

-- sec4 Substantial Completion
('sec4.asbuilt', 'sec4', 10, '{"type":"gt","field":"sec4.asbuilt_cum","value":0}'::jsonb,
 'As-built drawings submitted: cumulative {{sec4.asbuilt_cum}} (today +{{sec4.asbuilt_today}}).', 'paragraph'),
('sec4.om_missing', 'sec4', 20, '{"type":"or","of":[{"type":"eq","field":"sec4.om_elec","value":"N"},{"type":"eq","field":"sec4.om_elv","value":"N"}]}'::jsonb,
 'Outstanding O&M manuals: Electrical = {{sec4.om_elec}}, ELV = {{sec4.om_elv}}.', 'paragraph'),

-- sec5 Procurement
('sec5.cctv_status', 'sec5', 10, '{"type":"or","of":[{"type":"neq","field":"sec5.cctv_po","value":""},{"type":"neq","field":"sec5.cctv_eta","value":""}]}'::jsonb,
 'CCTV procurement — PO: {{sec5.cctv_po}} ({{date:sec5.cctv_po_date}}); ETA: {{sec5.cctv_eta}} ({{date:sec5.cctv_eta_date}}).', 'paragraph'),
('sec5.temp_elec', 'sec5', 30, '{"type":"eq","field":"sec5.temp_elec","value":"N"}'::jsonb,
 'Temporary electrical supply for testing remains unresolved.', 'paragraph'),

-- sec6 Work to Satisfaction
('sec6.pt_unaware', 'sec6', 10, '{"type":"eq","field":"sec6.pt_unaware","value":"Y"}'::jsonb,
 'The Contractor demonstrated lack of awareness of the planned testing programme. {{sec6.pt_unaware_detail}}', 'paragraph'),
('sec6.pt_dispute', 'sec6', 11, '{"type":"eq","field":"sec6.pt_dispute","value":"Y"}'::jsonb,
 'The Contractor disputed the planned testing programme without justification. {{sec6.pt_dispute_detail}}', 'paragraph'),
('sec6.t1_substitute', 'sec6', 20, '{"type":"gt","field":"sec6.t1_substitute","value":0}'::jsonb,
 'HDEC executed {{sec6.t1_substitute}} T1 test(s) on behalf of the Contractor.', 'paragraph'),
('sec6.mos_unlearned', 'sec6', 21, '{"type":"gt","field":"sec6.mos_unlearned","value":0}'::jsonb,
 '{{sec6.mos_unlearned}} MOS(s) were executed without prior familiarisation by the Contractor.', 'paragraph'),

-- sec7 HSE
('sec7.hse_penalty', 'sec7', 10, '{"type":"gt","field":"sec7.hse_penalty_amount","value":0}'::jsonb,
 'HSE penalty of SGD {{sec7.hse_penalty_amount}} was imposed today.', 'paragraph'),

-- sec8 Cumulative (auto)
('sec8.cum_intro', 'sec8', 1, '{"type":"always"}'::jsonb,
 'Cumulative back-charges as of {{date:entry_date}}:', 'heading'),
('sec8.cum_pm', 'sec8', 10, '{"type":"always"}'::jsonb,
 '- PM absence: {{computed.sec8.cum_pm_absent}} day(s), back-charge SGD {{computed.sec8.cum_pm_charge}}.', 'bullet'),
('sec8.cum_md', 'sec8', 20, '{"type":"always"}'::jsonb,
 '- HDEC substitution man-days: {{computed.sec8.cum_hdec_md}}; Korean expat man-days: {{computed.sec8.cum_korean_md}}.', 'bullet'),
('sec8.cum_ncrdef', 'sec8', 30, '{"type":"always"}'::jsonb,
 '- NCR/Defect external rectification: SGD {{computed.sec8.cum_def_ncr_cost}}.', 'bullet'),
('sec8.cum_hse', 'sec8', 40, '{"type":"always"}'::jsonb,
 '- HSE penalties: SGD {{computed.sec8.cum_hse_penalty}}.', 'bullet'),
('sec8.cum_ld', 'sec8', 50, '{"type":"always"}'::jsonb,
 '- Liquidated Damages: SGD {{computed.sec8.cum_ld}}.', 'bullet'),
('sec8.cum_total', 'sec8', 60, '{"type":"always"}'::jsonb,
 'AGGREGATE BACK-CHARGE TO DATE: SGD {{computed.sec8.aggregate}} (delta vs. yesterday: SGD {{computed.sec8.delta_yesterday}}).', 'paragraph');
