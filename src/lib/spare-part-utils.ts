// Spare Part shared types + helpers (mirrors defect-utils.ts pattern).

export interface SparePartItem {
  id: string;
  project_id: string | null;
  sn: string | null;
  level: string | null;
  sn_outline: string | null;
  category: string | null;
  sub_category: string | null;
  parent_item: string | null;
  material: string | null;
  spec_ref: string | null;
  location: string | null;
  floor_level: string | null;
  item_type: string | null;
  specification: string | null;
  size: string | null;
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  status: string | null;
  po_status: string | null;
  material_lead_time: string | null;
  planned_confirm_date: string | null;
  actual_confirm_date: string | null;
  direction_to_subcon_date: string | null;
  eta_date: string | null;
  planned_po_date: string | null;
  actual_po_date: string | null;
  planned_delivery_date: string | null;
  actual_delivery_date: string | null;
  subcontractor_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  team: string | null;
  trade: string | null;
  remarks: string | null;
  data_source_type: string | null;
  source_upload_id: string | null;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
  created_at?: string;
  row_version: number;
}

export const SPARE_PART_RAW_FIELDS = [
  'category',
  'sn',
  'level',
  'parent_item',
  'sub_category',
  'material',
  'spec_ref',
  'location',
  'floor_level',
  'item_type',
  'specification',
  'size',
  'spares_requirements',
  'unit',
  'spares_quantity',
  'storage_area_required',
  'status',
  'material_lead_time',
  'planned_confirm_date',
  'actual_confirm_date',
  'direction_to_subcon_date',
  'planned_po_date',
  'actual_po_date',
  'po_status',
  'eta_date',
  'planned_delivery_date',
  'actual_delivery_date',
  'subcontractor_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'team',
  'trade',
  'remarks',
  'updated_at',
  'created_at',
] as const;

export const SPARE_PART_DATE_FIELDS = new Set<string>([
  'planned_confirm_date',
  'actual_confirm_date',
  'direction_to_subcon_date',
  'eta_date',
  'planned_po_date',
  'actual_po_date',
  'planned_delivery_date',
  'actual_delivery_date',
]);

export const SPARE_PART_TEXT_FIELDS = new Set<string>([
  'sn',
  'parent_item',
  'material',
  'spec_ref',
  'specification',
  'spares_requirements',
  'storage_area_required',
  'remarks',
  'sn_outline',
]);

export const SPARE_PART_DATETIME_FIELDS = new Set<string>(['updated_at', 'created_at']);

export const SPARE_PART_SEARCH_FIELDS = [
  'sn',
  'category',
  'sub_category',
  'parent_item',
  'material',
  'spec_ref',
  'location',
  'floor_level',
  'item_type',
  'specification',
  'size',
  'spares_requirements',
  'storage_area_required',
  'status',
  'po_status',
  'subcontractor_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'team',
  'trade',
  'remarks',
  'material_lead_time',
] as const;

/** A spare part is overdue if planned delivery has passed and there is no actual delivery. */
export function isOverdueSparePart(
  item: Pick<SparePartItem, 'planned_delivery_date' | 'actual_delivery_date' | 'eta_date'>,
  asOf: string,
): boolean {
  if (item.actual_delivery_date) return false;
  const target = item.planned_delivery_date ?? item.eta_date ?? null;
  if (!target) return false;
  return String(target).slice(0, 10) < String(asOf).slice(0, 10);
}

/** Procurement is at-risk if PO is not yet issued and planned PO date is within `days` of asOf. */
export function isAtRiskSparePart(
  item: Pick<SparePartItem, 'planned_po_date' | 'actual_po_date' | 'planned_delivery_date' | 'actual_delivery_date'>,
  asOf: string,
  days = 7,
): boolean {
  const target = String(asOf).slice(0, 10);
  if (!item.actual_po_date && item.planned_po_date) {
    const planned = String(item.planned_po_date).slice(0, 10);
    const diff = Math.floor((new Date(planned).getTime() - new Date(target).getTime()) / 86400000);
    if (diff >= 0 && diff <= days) return true;
  }
  if (!item.actual_delivery_date && item.planned_delivery_date) {
    const planned = String(item.planned_delivery_date).slice(0, 10);
    const diff = Math.floor((new Date(planned).getTime() - new Date(target).getTime()) / 86400000);
    if (diff >= 0 && diff <= days) return true;
  }
  return false;
}

export function isDeliveryComplete(
  item: Pick<SparePartItem, 'actual_delivery_date'>,
): boolean {
  return Boolean(item.actual_delivery_date);
}

/** Procurement progress 0-4 (Confirm → Direction → PO → ETA → Delivery). */
export function procurementProgressLevel(
  item: Pick<SparePartItem,
    'actual_confirm_date' | 'direction_to_subcon_date' | 'actual_po_date' | 'eta_date' | 'actual_delivery_date'
  >,
): number {
  if (item.actual_delivery_date) return 5;
  if (item.eta_date) return 4;
  if (item.actual_po_date) return 3;
  if (item.direction_to_subcon_date) return 2;
  if (item.actual_confirm_date) return 1;
  return 0;
}

export const PROCUREMENT_PROGRESS_LABEL: Record<number, string> = {
  0: 'Not Started',
  1: 'Confirmed',
  2: 'Directed',
  3: 'PO Issued',
  4: 'ETA Set',
  5: 'Delivered',
};

export function procurementProgressLabel(item: Parameters<typeof procurementProgressLevel>[0]): string {
  return PROCUREMENT_PROGRESS_LABEL[procurementProgressLevel(item)];
}
