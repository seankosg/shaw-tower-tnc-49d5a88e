import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/enums';
import { isAllowedByRoles } from '@/lib/field-role-gate';

export type DocsSubModule = 'as_built' | 'omm' | 'warranty' | 'spare_part';

export interface DocsFieldConfigRow {
  id: string;
  field_name: string;
  display_name: string;
  is_enabled: boolean;
  is_required: boolean;
  sort_order: number;
  original_header: string | null;
  source_origin: string;
  sub_module: DocsSubModule;
  visible_to_roles: AppRole[] | null;
  editable_to_roles: AppRole[] | null;
}

export const DOCS_DEFAULT_FIELD_LABELS: Record<string, string> = {
  document_no: 'Document No',
  revision: 'Revision',
  title: 'Title',
  trade: 'Trade',
  discipline: 'Discipline',
  sheet_name: 'Sheet Name',
  series: 'Series',
  level_location: 'Level / Location',
  document_type: 'Document Type',
  organisation_raw: 'Organisation',
  subcontractor_name: 'Subcontractor',
  aconex_status: 'Aconex Status',
  current_status: 'Current Status',
  is_submitted: 'Submitted',
  transmittal_number: 'Transmittal No',
  submitted_date: 'Submitted Date',
  approved_date: 'Approved Date',
  transmittal_due_date: 'Transmittal Due',
  days_due: 'Days Due',
  sub1_planned_date: '1st Planned Submission',
  sub1_submission_date: '1st Actual Submission',
  sub1_approval_date: '1st Planned Response',
  sub1_actual_response_date: '1st Actual Response',
  sub1_approval_status: '1st Status (A/B/C)',
  sub2_planned_date: '2nd Planned Submission',
  sub2_submission_date: '2nd Actual Submission',
  sub2_approval_date: '2nd Planned Response',
  sub2_actual_response_date: '2nd Actual Response',
  sub2_approval_status: '2nd Status (A/B/C)',
  sub3_planned_date: '3rd Planned Submission',
  sub3_submission_date: '3rd Actual Submission',
  sub3_approval_date: '3rd Planned Response',
  sub3_actual_response_date: '3rd Actual Response',
  sub3_approval_status: '3rd Status (A/B/C)',
  remarks: 'Remarks',
  risk: 'Risk',
  cycle_progress: 'Progress',
  overall_status: 'Overall Status',
  updated_at: 'Updated At',
  created_at: 'Created At',
  // OMM-specific labels
  team: 'Team',
  sn: 'No',
  category: 'Sub-category',
  category_group: 'Category',
  section: 'Section',
  work_trade_material: 'Work Trade / Material',
  hdec_pic_name: 'HDEC PIC',
  hdec_eng_name: 'HDEC ENG',
  training_required: 'Training',
  instruction_date: 'Instruction Date',
  pdf_required_qty: 'PDF Required',
  pdf_actual_qty: 'PDF Actual',
  hardcopy_required_qty: 'Hardcopy Required',
  hardcopy_actual_qty: 'Hardcopy Actual',
  draft_planned_date: 'Draft Planned',
  draft_actual_date: 'Draft Actual',
  draft_response_date: 'Draft Response Date',
  draft_response_status: 'Draft Response Status',
  final_planned_date: 'Final Planned',
  final_actual_date: 'Final Actual',
  final_response_planned_date: 'Final Response Planned',
  final_response_actual_date: 'Final Response Actual',
  final_response_status: 'Final Response Status',
  current_stage: 'Stage',
  // Spare Part labels
  item_no: 'Item No',
  level: 'Level',
  sn_outline: 'S/N Outline',
  sub_category: 'Sub-category',
  parent_item: 'Parent Item',
  spec_ref: 'Spec Ref',
  material: 'Material Description',
  location: 'Location',
  floor_level: 'Floor Level',
  item_type: 'Type',
  specification: 'Specification',
  size: 'Size',
  spares_requirements: 'Spares Requirements',
  unit: 'Unit',
  spares_quantity: 'Quantity',
  storage_area_required: 'Storage Area',
  material_lead_time: 'Material Lead Time',
  planned_confirm_date: 'Planned Confirmation Date',
  actual_confirm_date: 'Actual Confirmation Date',
  direction_to_subcon_date: 'Direction to Subcon Date',
  eta_date: 'ETA Date',
  planned_po_date: 'Planned PO Issuance Date',
  actual_po_date: 'Actual PO Issuance Date',
  po_status: 'PO Status',
  planned_delivery_date: 'Planned Delivery Date',
  actual_delivery_date: 'Actual Delivery Date',
  status: 'Status',
};

export const DOCS_SOURCE_LABELS: Record<'hdec' | 'aconex' | 'system', string> = {
  hdec: 'HDEC',
  aconex: 'Aconex',
  system: 'System',
};

export function normalizeDocsSourceOrigin(value: string | null | undefined): 'hdec' | 'aconex' | 'system' {
  const v = String(value ?? '').toLowerCase();
  if (v === 'hdec' || v === 'hdec_added') return 'hdec';
  if (v === 'aconex' || v === 'll_original') return 'aconex';
  return 'system';
}

export function useDocsFieldConfig(subModule: DocsSubModule = 'as_built') {
  const [fields, setFields] = useState<DocsFieldConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      const { data } = await (supabase as any)
        .from('docs_field_config')
        .select('*')
        .eq('sub_module', subModule)
        .order('sort_order', { ascending: true });
      if (!cancelled) {
        setFields((data ?? []) as DocsFieldConfigRow[]);
        setLoading(false);
      }
    };
    fetchAll();

    const channel = supabase
      .channel(`docs-field-config-${subModule}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'docs_field_config', filter: `sub_module=eq.${subModule}` },
        () => { fetchAll(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [subModule]);

  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.field_name, field])), [fields]);

  const isFieldVisible = (fieldName: string, userRoles: AppRole[] = []) => {
    if (fieldName === 'document_no') return true; // always visible (anchor column)
    const field = fieldMap.get(fieldName);
    if (field && field.is_enabled === false) return false;
    return isAllowedByRoles(field?.visible_to_roles ?? null, userRoles);
  };

  const isFieldRequired = (fieldName: string) => fieldMap.get(fieldName)?.is_required ?? false;
  const getLabel = (fieldName: string) =>
    fieldMap.get(fieldName)?.display_name || DOCS_DEFAULT_FIELD_LABELS[fieldName] || fieldName;
  const getOrder = (fieldName: string) => fieldMap.get(fieldName)?.sort_order ?? 9999;

  const getSourceLabel = (fieldName: string): string =>
    DOCS_SOURCE_LABELS[normalizeDocsSourceOrigin(fieldMap.get(fieldName)?.source_origin)];

  const getSourceOrigin = (fieldName: string): 'hdec' | 'aconex' | 'system' =>
    normalizeDocsSourceOrigin(fieldMap.get(fieldName)?.source_origin);

  const sortFieldNames = (fieldNames: string[]) => [...fieldNames].sort((a, b) => getOrder(a) - getOrder(b));

  /**
   * Field-level edit gate based on `editable_to_roles` config.
   * - If `editable_to_roles` is null/empty → editable by anyone with row write permission (default)
   * - Otherwise → only listed roles are allowed (admin always)
   */
  const isFieldEditable = (fieldName: string, userRoles: AppRole[]) => {
    const cfg = fieldMap.get(fieldName);
    const allowed = cfg?.editable_to_roles;
    if (!allowed || allowed.length === 0) return true;
    if (userRoles.includes('admin')) return true;
    return userRoles.some((r) => allowed.includes(r));
  };

  return {
    fields,
    loading,
    isFieldVisible,
    isFieldRequired,
    isFieldEditable,
    getLabel,
    getSourceLabel,
    getSourceOrigin,
    sortFieldNames,
  };
}
