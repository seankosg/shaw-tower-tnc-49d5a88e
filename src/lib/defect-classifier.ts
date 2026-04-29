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

// ============================================================
// V2 — Workscope + Work Type dictionary based classifier
// ============================================================

export interface WorkscopeRow {
  id: string;
  label: string;
  full_name?: string | null;
  keywords: string[];
  match_priority: number;
  is_active: boolean;
}

export interface WorkTypeRow {
  id: string;
  name: string;
  trade?: string | null;
  sub_match: string[];
  desc_keywords: string[];
  default_main_trade: string | null;
  default_sub_trade: string | null;
  match_order: number;
  is_active: boolean;
}

export interface AliasRow {
  id: string;
  raw_label: string;
  canonical_label: string;
  is_active: boolean;
}

export interface ClassificationContextV2 {
  workscopes: WorkscopeRow[];
  workTypes: WorkTypeRow[];
  aliases: AliasRow[];
  legacyRules: ClassificationRule[];
  legacyFallbacks: DisciplineFallback[];
}

export interface ClassificationInputV2 {
  description?: string | null;
  field_discipline?: string | null;
  raw_label?: string | null;
}

export interface ClassificationResultV2 {
  main_trade: string;
  sub_trade: string;
  work_type: string;
  subcontractor: string; // workscope label or '' if none
  source: ClassificationSource;
  matched_workscope_id: string | null;
  matched_work_type_id: string | null;
}

const UNCLASSIFIED_V2: Omit<ClassificationResultV2, 'source' | 'matched_workscope_id' | 'matched_work_type_id'> = {
  main_trade: '',
  sub_trade: '',
  work_type: '',
  subcontractor: '',
};

function normalizeAlias(rawLabel: string, aliases: AliasRow[]): string {
  const trimmed = String(rawLabel ?? '').trim();
  if (!trimmed) return '';
  // Exact (case-insensitive) match against alias table
  const hit = aliases.find(
    (a) => a.is_active && a.raw_label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (hit) return hit.canonical_label;
  // Slash labels: take first token (e.g., "Puretech/KKC" -> "Puretech")
  if (trimmed.includes('/')) {
    const first = trimmed.split('/')[0].trim();
    // Recurse once on the first token to apply alias normalization
    const aliasedFirst = aliases.find(
      (a) => a.is_active && a.raw_label.toLowerCase() === first.toLowerCase(),
    );
    return aliasedFirst ? aliasedFirst.canonical_label : first;
  }
  return trimmed;
}

function pickSubcontractor(
  canonicalLabel: string,
  description: string,
  workscopes: WorkscopeRow[],
): WorkscopeRow | null {
  const active = workscopes.filter((w) => w.is_active);
  // 1. Direct label match (case-insensitive)
  if (canonicalLabel) {
    const direct = active.find((w) => w.label.toLowerCase() === canonicalLabel.toLowerCase());
    if (direct) return direct;
  }
  // 2. Keyword match against description, ordered by match_priority asc
  const desc = description.toLowerCase();
  if (!desc) return null;
  const sorted = [...active].sort((a, b) => a.match_priority - b.match_priority);
  for (const w of sorted) {
    for (const kw of w.keywords) {
      const k = String(kw ?? '').toLowerCase().trim();
      if (k && desc.includes(k)) return w;
    }
  }
  return null;
}

function pickWorkType(
  description: string,
  subcontractorLabel: string,
  workTypes: WorkTypeRow[],
): WorkTypeRow | null {
  const desc = description.toLowerCase();
  const sub = subcontractorLabel.toLowerCase();
  const sorted = [...workTypes]
    .filter((wt) => wt.is_active)
    .sort((a, b) => a.match_order - b.match_order);
  for (const wt of sorted) {
    // sub_match: matches if subcontractor label appears in any sub_match entry (case-insensitive substring)
    if (sub) {
      for (const s of wt.sub_match) {
        const sLower = String(s ?? '').toLowerCase().trim();
        if (sLower && (sub.includes(sLower) || sLower.includes(sub))) return wt;
      }
    }
    // desc_keywords
    if (desc) {
      for (const kw of wt.desc_keywords) {
        const k = String(kw ?? '').toLowerCase().trim();
        if (k && desc.includes(k)) return wt;
      }
    }
  }
  return null;
}

export function classifyDefectV2(
  input: ClassificationInputV2,
  ctx: ClassificationContextV2,
): ClassificationResultV2 {
  const description = String(input.description ?? '').trim();
  const rawLabel = String(input.raw_label ?? '').trim();
  const fieldDiscipline = String(input.field_discipline ?? '').trim();

  // STEP 1 — alias normalize
  const canonicalLabel = normalizeAlias(rawLabel, ctx.aliases);

  // STEP 2 — subcontractor
  const sub = pickSubcontractor(canonicalLabel, description, ctx.workscopes);
  const subLabel = sub?.label ?? '';

  // STEP 3 — work type
  const wt = pickWorkType(description, subLabel, ctx.workTypes);

  if (wt) {
    return {
      main_trade: wt.default_main_trade ?? '',
      sub_trade: wt.default_sub_trade ?? '',
      work_type: wt.name,
      subcontractor: subLabel,
      source: sub && !description ? 'workscope' : 'work_type_rule',
      matched_workscope_id: sub?.id ?? null,
      matched_work_type_id: wt.id,
    };
  }

  // STEP 4 — workscope-only result (no work type matched but subcontractor was identified)
  if (sub) {
    return {
      main_trade: '',
      sub_trade: '',
      work_type: '',
      subcontractor: subLabel,
      source: 'workscope',
      matched_workscope_id: sub.id,
      matched_work_type_id: null,
    };
  }

  // STEP 5 — legacy classifier fallback
  const legacy = classifyDefect(
    { description, field_discipline: fieldDiscipline },
    ctx.legacyRules,
    ctx.legacyFallbacks,
  );
  if (legacy.source !== 'unclassified') {
    return {
      main_trade: legacy.main_trade,
      sub_trade: legacy.sub_trade,
      work_type: legacy.work_type,
      subcontractor: '',
      source: legacy.source === 'rule' ? 'legacy_keyword' : 'legacy_discipline',
      matched_workscope_id: null,
      matched_work_type_id: null,
    };
  }

  // STEP 6 — unclassified
  return {
    ...UNCLASSIFIED_V2,
    source: 'unclassified',
    matched_workscope_id: null,
    matched_work_type_id: null,
  };
}

