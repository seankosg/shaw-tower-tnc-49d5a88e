import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/enums';

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
  description: 'Description',
  defect_type: 'Defect Type',
  status: 'Status',
  priority: 'Priority',
  subcontractor_name: 'Subcontractor',
  subsub_name: 'Sub-Subcontractor',
  hdec_pic_name: 'HDEC PIC',
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
  work_type: 'Work Type',
  classification_source: 'Classification Source',
};

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

  const isFieldVisible = (fieldName: string) => {
    if (fieldName === 'issue_no') return true;
    const field = fieldMap.get(fieldName);
    return field?.is_enabled ?? true;
  };

  const isFieldRequired = (fieldName: string) => fieldMap.get(fieldName)?.is_required ?? false;
  const getLabel = (fieldName: string) => fieldMap.get(fieldName)?.display_name || DEFECT_DEFAULT_FIELD_LABELS[fieldName] || fieldName;
  const getOrder = (fieldName: string) => fieldMap.get(fieldName)?.sort_order ?? 9999;

  const sortFieldNames = (fieldNames: string[]) => [...fieldNames].sort((a, b) => getOrder(a) - getOrder(b));

  return { fields, loading, isFieldVisible, isFieldRequired, getLabel, sortFieldNames };
}
