// Rule-based defect classifier (no AI). Used during Import and Detail Auto-classify.

export type ClassificationSource =
  | 'rule'
  | 'discipline'
  | 'manual'
  | 'unclassified'
  | 'workscope'
  | 'work_type_rule'
  | 'legacy_keyword'
  | 'legacy_discipline';

export interface ClassificationRule {
  id: string;
  keyword: string;
  main_trade: string;
  sub_trade: string;
  work_type: string;
  priority: number;
  is_active: boolean;
}

export interface DisciplineFallback {
  id: string;
  field_discipline: string; // stored lowercase
  main_trade: string;
  sub_trade: string;
  work_type: string;
  is_active: boolean;
  created_at?: string | null;
}

export interface ClassificationInput {
  description?: string | null;
  field_discipline?: string | null;
}

export interface ClassificationResult {
  main_trade: string;
  sub_trade: string;
  work_type: string;
  source: ClassificationSource;
  matched_id: string | null;
}

const UNCLASSIFIED: Omit<ClassificationResult, 'source' | 'matched_id'> = {
  // Unmatched defects keep blank trade fields. The 'unclassified' source value
  // (returned alongside) is what drives stats, filters, and summary cards —
  // never write a placeholder string into the trade columns themselves.
  main_trade: '',
  sub_trade: '',
  work_type: '',
};

/**
 * Sort rules: priority asc, then keyword length desc (longer/more specific first).
 */
export function sortRules(rules: ClassificationRule[]): ClassificationRule[] {
  return [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.keyword.length - a.keyword.length;
    });
}

function matchRule(descLower: string, rules: ClassificationRule[]): ClassificationRule | null {
  for (const rule of rules) {
    const kw = String(rule.keyword ?? '').toLowerCase().trim();
    if (!kw) continue;
    if (descLower.includes(kw)) return rule;
  }
  return null;
}

/**
 * Bidirectional substring match for Field Discipline.
 * Multiple matches: prefer longer field_discipline, then earliest created_at.
 */
function matchDiscipline(disciplineLower: string, fallbacks: DisciplineFallback[]): DisciplineFallback | null {
  const candidates = fallbacks
    .filter((fb) => fb.is_active)
    .filter((fb) => {
      const fd = String(fb.field_discipline ?? '').toLowerCase().trim();
      if (!fd) return false;
      return disciplineLower.includes(fd) || fd.includes(disciplineLower);
    });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const lenDiff = String(b.field_discipline).length - String(a.field_discipline).length;
    if (lenDiff !== 0) return lenDiff;
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });
  return candidates[0];
}

export function classifyDefect(
  input: ClassificationInput,
  rules: ClassificationRule[],
  fallbacks: DisciplineFallback[],
): ClassificationResult {
  const desc = String(input.description ?? '').toLowerCase().trim();
  const discipline = String(input.field_discipline ?? '').toLowerCase().trim();

  if (desc) {
    const sorted = sortRules(rules);
    const hit = matchRule(desc, sorted);
    if (hit) {
      return {
        main_trade: hit.main_trade,
        sub_trade: hit.sub_trade,
        work_type: hit.work_type,
        source: 'rule',
        matched_id: hit.id,
      };
    }
  }

  if (discipline) {
    const fb = matchDiscipline(discipline, fallbacks);
    if (fb) {
      return {
        main_trade: fb.main_trade,
        sub_trade: fb.sub_trade,
        work_type: fb.work_type,
        source: 'discipline',
        matched_id: fb.id,
      };
    }
  }

  return { ...UNCLASSIFIED, source: 'unclassified', matched_id: null };
}
