import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/enums';

export interface DocsFieldConfigRow {
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
  sub1_planned_date: 'Cycle 1 Planned',
  sub1_submission_date: 'Cycle 1 Submitted',
  sub1_approval_date: 'Cycle 1 Planned Response',
  sub1_actual_response_date: 'Cycle 1 Actual Response',
  sub1_approval_status: 'Cycle 1 Status (A/B/C)',
  sub2_planned_date: 'Cycle 2 Planned',
  sub2_submission_date: 'Cycle 2 Submitted',
  sub2_approval_date: 'Cycle 2 Planned Response',
  sub2_actual_response_date: 'Cycle 2 Actual Response',
  sub2_approval_status: 'Cycle 2 Status (A/B/C)',
  sub3_planned_date: 'Cycle 3 Planned',
  sub3_submission_date: 'Cycle 3 Submitted',
  sub3_approval_date: 'Cycle 3 Planned Response',
  sub3_actual_response_date: 'Cycle 3 Actual Response',
  sub3_approval_status: 'Cycle 3 Status (A/B/C)',
  remarks: 'Remarks',
  risk: 'Risk',
  cycle_progress: 'Cycle Progress',
  overall_status: 'Overall Status',
  updated_at: 'Updated At',
  created_at: 'Created At',
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

export function useDocsFieldConfig() {
  const [fields, setFields] = useState<DocsFieldConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('docs_field_config')
        .select('*')
        .order('sort_order', { ascending: true });
      if (!cancelled) {
        setFields((data ?? []) as DocsFieldConfigRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.field_name, field])), [fields]);

  const isFieldVisible = (fieldName: string) => {
    if (fieldName === 'document_no') return true; // always visible (anchor column)
    const field = fieldMap.get(fieldName);
    return field?.is_enabled ?? true;
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

  return {
    fields,
    loading,
    isFieldVisible,
    isFieldRequired,
    getLabel,
    getSourceLabel,
    getSourceOrigin,
    sortFieldNames,
  };
}
