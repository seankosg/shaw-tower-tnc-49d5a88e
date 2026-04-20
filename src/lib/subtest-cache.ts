// Module-scope cache for subtest list data.
// Allows instant render on revisit while a background refresh runs.

export interface CachedSubtest {
  id: string;
  subtest_id: string;
  item_no: string;
  mos_code: string;
  level: string | null;
  equipment: string | null;
  description: string | null;
  t1_planned_date: string | null;
  t1_actual_date: string | null;
  t1_status: any;
  t2_planned_date: string | null;
  t2_actual_date: string | null;
  t2_status: any;
  predecessor_status_raw: string | null;
  pred_status: any;
  pred_planned_date: string | null;
  pred_actual_date: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  data_source_type: any;
  updated_at: string;
  system_code: string;
}

let cache: CachedSubtest[] | null = null;
let cacheAt = 0;

export function getSubtestCache(): { data: CachedSubtest[] | null; ageMs: number } {
  return { data: cache, ageMs: cache ? Date.now() - cacheAt : Infinity };
}

export function setSubtestCache(rows: CachedSubtest[]) {
  cache = rows;
  cacheAt = Date.now();
}

export function invalidateSubtestCache() {
  cache = null;
  cacheAt = 0;
}
