/**
 * DDN mapping rule types.
 */

export type DdnConditionNode =
  | { type: 'always' }
  | { type: 'eq'; field: string; value: string | number | boolean }
  | { type: 'neq'; field: string; value: string | number | boolean }
  | { type: 'gt'; field: string; value: number }
  | { type: 'lt'; field: string; value: number }
  | { type: 'contains'; field: string; value: string }
  | { type: 'exists'; field: string }
  | { type: 'and'; of: DdnConditionNode[] }
  | { type: 'or'; of: DdnConditionNode[] }
  | { type: 'not'; of: DdnConditionNode };

export type DdnRuleStyle = 'paragraph' | 'bullet' | 'heading' | 'table_row';

export interface DdnMappingRule {
  id: string;
  rule_key: string;
  section_id: string;
  display_order: number;
  condition: DdnConditionNode;
  template: string;
  style: DdnRuleStyle;
  notes: string | null;
  is_active: boolean;
}

export type RenderedBlock =
  | { kind: 'paragraph'; html: string; ruleKey: string }
  | { kind: 'bullet'; items: string[]; ruleKey: string }
  | { kind: 'heading'; text: string; ruleKey: string };

export interface RenderedSection {
  id: string;
  titleEn: string;
  blocks: RenderedBlock[];
}

export interface RenderedLetter {
  letterNo: string;
  date: string;
  dayN: number | null;
  sections: RenderedSection[];
  warnings: string[];
}
