// Loads ABD / OMM / Warranty rows in parallel and converts them into the
// flat stage-record shape consumed by the Document Executive Dashboard.

import { supabase } from '@/integrations/supabase/client';
import {
  asOfStartOfDay,
  buildAbdStageRecords,
  buildOmmStageRecords,
  buildWarrantyStageRecords,
  type DocsStageRecord,
} from '@/lib/docs-stage-records';

const PAGE = 1000;
async function fetchAll<T = any>(builder: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await builder().range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface ExecDashboardSnapshot {
  records: DocsStageRecord[];
  asOf: Date;
  /** Raw ABD rows (active, sub_module='as_built') for SSOT bucket distribution */
  abdRows: any[];
  /** Raw OMM rows (active) for Sub1 Status bucket distribution */
  ommRows: any[];
}

export async function loadExecutiveDashboard(opts: {
  asOf?: Date;
}): Promise<ExecDashboardSnapshot> {
  const asOf = asOfStartOfDay(opts.asOf);

  const [abdRows, ommRows, warrantyRows] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('docs_drawings')
        .select(
          'id, document_no, title, discipline, trade, team, ' +
            'subcontractor_name, hdec_pic_name, hdec_eng_name, ' +
            'sub1_planned_date, sub1_submission_date, sub1_approval_date, sub1_approval_status, ' +
            'sub2_planned_date, sub2_submission_date, sub2_approval_date, sub2_approval_status, ' +
            'sub3_planned_date, sub3_submission_date, sub3_approval_date, sub3_approval_status, ' +
            'approved_date, current_status',
        )
        .eq('sub_module', 'as_built')
        .eq('is_active', true),
    ),
    fetchAll(() =>
      supabase
        .from('docs_omm')
        .select(
          'id, sn, category, work_trade_material, trade, team, ' +
            'subcontractor_name, hdec_pic_name, hdec_eng_name, ' +
            'instruction_date, ' +
            'sub1_planned_date, sub1_actual_date, sub1_response_date, sub1_response_status, ' +
            'sub2_planned_date, sub2_actual_date, sub2_response_planned_date, sub2_response_actual_date, sub2_response_status, ' +
            'sub3_planned_date, sub3_actual_date, sub3_response_planned_date, sub3_response_actual_date, sub3_response_status, ' +
            'final_planned_date, final_actual_date, final_response_planned_date, final_response_actual_date, final_response_status',
        )
        .eq('is_active', true),
    ),
    fetchAll(() =>
      (supabase as any)
        .from('warranty_items')
        .select(
          'id, item_no, category, warranted_item, team, ' +
            'subcontractor_name, hdec_pic_name, hdec_eng_name, ' +
            'r_subcontract_date, acra_info_status, ' +
            'draft_planned_date, draft_actual_date, draft_status, ' +
            'subcon_signing_planned_date, subcon_signing_actual_date, subcon_signing_status, ' +
            'hdec_signing_planned_date, hdec_signing_actual_date, hdec_signing_status, ' +
            'final_planned_date, final_actual_date, final_status, ' +
            'current_stage, current_status',
        )
        .eq('is_active', true),
    ),
  ]);

  const records = [
    ...buildAbdStageRecords(abdRows, asOf),
    ...buildOmmStageRecords(ommRows, asOf),
    ...buildWarrantyStageRecords(warrantyRows, asOf),
  ];

  return { records, asOf, abdRows, ommRows };
}
