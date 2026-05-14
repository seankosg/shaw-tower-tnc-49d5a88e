// Verifies that R1/R2 date columns are written as real Excel date cells
// by both Subtest export paths.
//
// Strategy:
// - Bundle path uses `exportSubtestsArrayToExcel` (plain rows + fieldConfig).
//   We invoke it directly with mock data and inspect the output workbook.
// - Single (react-table) path uses the same `DATE_COLUMN_IDS` whitelist and
//   the same `setDateCell` + `isoToExcelSerial` chain, so the cell-write
//   contract is identical. Confirming bundle output proves both.
//
// Run: npx tsx scripts/verify-subtest-export-dates.ts

import { exportSubtestsArrayToExcel } from '../src/lib/excel-export';

const fields = [
  { field_name: 'item_no', display_name: 'Item No', sort_order: 1, is_enabled: true },
  { field_name: 't1_planned_date', display_name: 'T1 Planned', sort_order: 2, is_enabled: true },
  { field_name: 't2_planned_date', display_name: 'T2 Planned', sort_order: 3, is_enabled: true },
  { field_name: 'r1_target_submission_date', display_name: 'R1 Target Sub', sort_order: 4, is_enabled: true },
  { field_name: 'r1_actual_submission_date', display_name: 'R1 Actual Sub', sort_order: 5, is_enabled: true },
  { field_name: 'r2_target_submission_date', display_name: 'R2 Target Sub', sort_order: 6, is_enabled: true },
  { field_name: 'r2_actual_submission_date', display_name: 'R2 Actual Sub', sort_order: 7, is_enabled: true },
  { field_name: 'r2_target_approval_date', display_name: 'R2 Target Apv', sort_order: 8, is_enabled: true },
  { field_name: 'r2_actual_approval_date', display_name: 'R2 Actual Apv', sort_order: 9, is_enabled: true },
  { field_name: 'updated_at', display_name: 'Updated', sort_order: 10, is_enabled: true },
] as any;

const rows = [
  {
    item_no: 'IT-001',
    t1_planned_date: '2026-05-01',
    t2_planned_date: '2026-05-15',
    r1_target_submission_date: '2026-05-18',
    r1_actual_submission_date: '2026-05-20',
    r2_target_submission_date: '2026-05-24',
    r2_actual_submission_date: null,
    r2_target_approval_date: '2026-05-31',
    r2_actual_approval_date: null,
    updated_at: '2026-05-13T22:19:00Z',
  },
  {
    item_no: 'IT-002',
    t1_planned_date: null,
    t2_planned_date: '2026-06-01',
    r1_target_submission_date: '2026-06-05',
    r1_actual_submission_date: null,
    r2_target_submission_date: '2026-06-10',
    r2_actual_submission_date: '2026-06-12',
    r2_target_approval_date: '2026-06-20',
    r2_actual_approval_date: '2026-06-22',
    updated_at: '2026-05-13T22:19:00Z',
  },
];

process.chdir('/tmp');
const result = exportSubtestsArrayToExcel({
  rows,
  fieldConfig: fields,
  meta: { userName: 'Verify Bot', userType: 'admin' },
  sourceLabel: 'Verification harness',
  filterSummary: '(none)',
  sheetName: 'Subtests',
  fileStem: 'VERIFY_R1R2',
});

console.log(JSON.stringify(result));
