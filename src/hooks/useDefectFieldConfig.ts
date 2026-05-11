import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/enums';
import { isAllowedByRoles } from '@/lib/field-role-gate';

export interface DefectFieldConfigRow {
  id: string;
  field_name: string;
  display_name: string;
  is_enabled: boolean;
  is_required: boolean;
  sort_order: number;
  original_header: string | null;
  source_origin: string;
  visible_to_roles: AppRole[] | null;
  editable_to_roles: AppRole[] | null;
}

export const DEFECT_DEFAULT_FIELD_LABELS: Record<string, string> = {
  issue_no: 'Issue No',
  subcontractor_issue_no: 'Subcontractor Issue No',
  subcontractor_issue_source: 'Subcontractor Issue Source',
  team: 'Team',
  main_trade: 'Main Trade',
  sub_trade: 'Sub Trade',
  trade_detail: 'Trade Detail',
  area_type: 'Type',
  area_level: 'Level',
  area_location: 'Location',
  area_raw: 'Area (Raw)',
  description: 'Description',
  defect_type: 'Defect Type',
  status: 'Status',
  priority: 'Priority',
  subcontractor_name: 'Subcontractor',
  subsub_name: 'Sub-Subcontractor',
  hdec_pic_name: 'HDEC PIC',
  hdec_eng_name: 'HDEC Eng',
  planned_start_date: 'Planned Start Date',
  planned_completion_date: 'Planned Completion Date',
  planned_closure_date: 'Planned Closure Date',
  actual_start_date: 'Actual Start Date',
  actual_completion_date: 'Actual Completion Date',
  actual_closure_date: 'Actual Closure Date',
  planned_progress_pct: 'Planned Progress %',
  actual_progress_pct: 'Actual Progress %',
  completion_status: 'Completion Status',
  closure_status: 'Closure Status',
  remarks: 'Remarks',
  hdec_comments: 'HDEC Comments',
  aconex_comments: 'Aconex Comments',
  work_type: 'Work Type',
  classification_source: 'Classification Source',
  classified_at: 'Classified At',
};

/** Canonical 3-value origin labels used across the UI. */
export const SOURCE_LABELS: Record<'hdec' | 'aconex' | 'system', string> = {
  hdec: 'HDEC',
  aconex: 'Aconex',
  system: 'System',
};

/** Map any legacy `source_origin` value to the canonical 3-value set. */
export function normalizeSourceOrigin(value: string | null | undefined): 'hdec' | 'aconex' | 'system' {
  const v = String(value ?? '').toLowerCase();
  if (v === 'hdec' || v === 'hdec_added') return 'hdec';
  if (v === 'aconex' || v === 'll_original') return 'aconex';
  return 'system';
}

export function useDefectFieldConfig() {
  const [fields, setFields] = useState<DefectFieldConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('defect_field_config')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!cancelled) {
        setFields((data ?? []) as DefectFieldConfigRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.field_name, field])), [fields]);

  const isFieldVisible = (fieldName: string, userRoles: AppRole[] = []) => {
    if (fieldName === 'issue_no') return true;
    const field = fieldMap.get(fieldName);
    if (field && field.is_enabled === false) return false;
    return isAllowedByRoles(field?.visible_to_roles ?? null, userRoles);
  };

  /**
   * Field-level edit gate based on `editable_to_roles` config.
   * - If `editable_to_roles` is null/empty → editable by anyone with row write permission (default)
   * - admin always allowed
   */
  const isFieldEditable = (fieldName: string, userRoles: AppRole[]) =>
    isAllowedByRoles(fieldMap.get(fieldName)?.editable_to_roles ?? null, userRoles);

  const isFieldRequired = (fieldName: string) => fieldMap.get(fieldName)?.is_required ?? false;
  const getLabel = (fieldName: string) => fieldMap.get(fieldName)?.display_name || DEFECT_DEFAULT_FIELD_LABELS[fieldName] || fieldName;
  const getOrder = (fieldName: string) => fieldMap.get(fieldName)?.sort_order ?? 9999;

  /** Return canonical source label ('HDEC' | 'Aconex' | 'System') for a field. */
  const getSourceLabel = (fieldName: string): string => {
    const row = fieldMap.get(fieldName);
    return SOURCE_LABELS[normalizeSourceOrigin(row?.source_origin)];
  };

  /** Return raw origin token ('hdec' | 'aconex' | 'system') for a field. */
  const getSourceOrigin = (fieldName: string): 'hdec' | 'aconex' | 'system' =>
    normalizeSourceOrigin(fieldMap.get(fieldName)?.source_origin);

  /**
   * Return all `payload_*` field config rows, each annotated with its
   * `original_header` (used to look up the value in `raw_payload`).
   * Filters out rows with `is_enabled = false`.
   */
  const getRawPayloadFieldsForDisplay = (): DefectFieldConfigRow[] =>
    fields.filter((f) => f.field_name.startsWith('payload_') && f.is_enabled && f.original_header);

  const sortFieldNames = (fieldNames: string[]) => [...fieldNames].sort((a, b) => getOrder(a) - getOrder(b));

  return {
    fields,
    loading,
    isFieldVisible,
    isFieldRequired,
    getLabel,
    getSourceLabel,
    getSourceOrigin,
    getRawPayloadFieldsForDisplay,
    sortFieldNames,
  };
}
