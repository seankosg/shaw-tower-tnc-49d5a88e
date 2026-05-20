import type { DdnInputValue } from './schema-types';

export type AutoSource =
  | 'subtests'
  | 'subtest_change_log'
  | 'defect_items'
  | 'punch_items'
  | 'docs_drawings'
  | 'docs_omm';

export interface AutoEntry {
  /** Suggested value to apply to the field. */
  value: DdnInputValue;
  /** Where it came from (for tooltip). */
  source: AutoSource;
  /** Human-readable explanation. */
  note: string;
}

export type AutoMap = Record<string, AutoEntry>;

export interface AutoFillResult {
  map: AutoMap;
  fetchedAt: string;
  errors: string[];
}
