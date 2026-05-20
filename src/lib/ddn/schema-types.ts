/**
 * Daily Default Notice — schema types (mirrors ddn_* tables).
 */

export type DdnDataType =
  | 'text'
  | 'number'
  | 'date'
  | 'time'
  | 'radio_yn'
  | 'radio'
  | 'checkbox_multi'
  | 'textarea'
  | 'computed'
  | 'repeatable_group'
  | 'heading';

export type DdnFieldWidth = 'full' | 'half' | 'third' | 'quarter';

export interface DdnConditional {
  field_key: string;
  /** 'equals' compares scalar; 'contains' checks membership in array (for checkbox_multi parents) */
  equals?: string;
  contains?: string;
}

export interface DdnSection {
  id: string;
  title_ko: string;
  title_en: string | null;
  display_order: number;
  collapsible: boolean;
  is_active: boolean;
}

export interface DdnFieldOption {
  id: string;
  field_id: string;
  value: string;
  label_ko: string;
  label_en: string | null;
  display_order: number;
  is_active: boolean;
}

export interface DdnField {
  id: string;
  section_id: string;
  field_key: string;
  label_ko: string;
  label_en: string | null;
  help_text: string | null;
  data_type: DdnDataType;
  unit: string | null;
  required: boolean;
  default_value: unknown;
  validation: { min?: number; max?: number; pattern?: string } | null;
  conditional_on: DdnConditional | null;
  display_order: number;
  width: DdnFieldWidth;
  is_active: boolean;
  options?: DdnFieldOption[];
}

export interface DdnSettings {
  id: 'singleton';
  master_notice_ref: string | null;
  master_notice_date: string | null;
  day1_date: string | null;
  letter_no_prefix: string | null;
  letter_no_next: number | null;
  pm_absence_start_date: string | null;
  contract_completion_date: string | null;
  ld_daily_rate_sgd: number | null;
  ld_cap_sgd: number | null;
  pm_daily_rate_sgd: number | null;
  hdec_manday_rate_sgd: number | null;
  hdec_korean_md_rate_sgd: number | null;
  admin_overhead_pct: number | null;
  avg_ncr_external_cost: number | null;
  avg_def_external_cost: number | null;
  updated_at: string;
}

export type DdnInputValue =
  | string
  | number
  | boolean
  | string[]
  | DdnDelayedItem[]
  | null;

export interface DdnDelayedItem {
  name: string;
  reasons: string[];
  other_reason?: string;
}

export type DdnInputs = Record<string, DdnInputValue>;

export interface DdnEntry {
  id: string;
  entry_date: string;
  letter_no: string | null;
  day_n: number | null;
  status: 'draft' | 'finalized' | 'sent';
  inputs: DdnInputs;
  generated_letter_html: string | null;
  generated_docx_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
