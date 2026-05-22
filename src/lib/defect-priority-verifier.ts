/**
 * HDEC Priority Verification engine.
 *
 * Trigger conditions (all must hold to run classification):
 *   1. Import row's `priority` equals "Cat A - Major Defect (Before SC)".
 *   2. Existing DB row's `closure_status` is NOT "Done".
 *   3. Import row's `status` is NOT "Closed".
 *
 * Outcomes:
 *   - Eligible row → returns { hdec_verification, hdec_reason } based on first matching rule.
 *   - Priority is not Cat A (or moved away from Cat A) → returns null/null (CLEAR policy).
 *   - Gated by Closed/Done → returns "preserve" so caller keeps existing values.
 */

import { supabase } from '@/integrations/supabase/client';

export const VERIFICATION_VALUES = {
  CAT_A: 'Cat A - Major Defect (Before SC)',
  CAT_B: 'Cat B - Minor Defect',
  REVIEW: 'Review Needed',
} as const;

export const CAT_A_PRIORITY_VALUE = 'Cat A - Major Defect (Before SC)';

type Verdict = 'cat_a_major' | 'review_needed' | 'cat_b_minor';
type MatchType = 'contains_any' | 'contains_all' | 'regex';

export interface VerificationRule {
  id: string;
  verdict: Verdict;
  step: number;
  order_no: number;
  match_type: MatchType;
  keywords: string[];
  exclude_keywords: string[] | null;
  category: string;
  explanation: string;
}

const VERDICT_TO_LABEL: Record<Verdict, string> = {
  cat_a_major: VERIFICATION_VALUES.CAT_A,
  review_needed: VERIFICATION_VALUES.REVIEW,
  cat_b_minor: VERIFICATION_VALUES.CAT_B,
};

let cachedRules: VerificationRule[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60_000;

export async function loadVerificationRules(force = false): Promise<VerificationRule[]> {
  const now = Date.now();
  if (!force && cachedRules && now - cachedAt < CACHE_TTL_MS) return cachedRules;
  const { data, error } = await (supabase as any)
    .from('defect_priority_verification_rules')
    .select('*')
    .eq('is_active', true)
    .order('step', { ascending: true })
    .order('order_no', { ascending: true });
  if (error) {
    console.warn('[priority-verifier] failed to load rules:', error.message);
    return cachedRules ?? [];
  }
  cachedRules = (data ?? []).map((r: any) => ({
    id: r.id,
    verdict: r.verdict,
    step: r.step,
    order_no: r.order_no,
    match_type: r.match_type,
    keywords: Array.isArray(r.keywords) ? r.keywords.map((k: any) => String(k).toLowerCase()) : [],
    exclude_keywords: Array.isArray(r.exclude_keywords)
      ? r.exclude_keywords.map((k: any) => String(k).toLowerCase())
      : null,
    category: r.category,
    explanation: r.explanation,
  }));
  cachedAt = now;
  return cachedRules;
}

export function invalidateVerificationRulesCache(): void {
  cachedRules = null;
  cachedAt = 0;
}

function ruleMatches(rule: VerificationRule, hay: string): boolean {
  // Exclusion always blocks the match.
  if (rule.exclude_keywords && rule.exclude_keywords.some((kw) => kw && hay.includes(kw))) {
    return false;
  }
  if (rule.match_type === 'contains_all') {
    return rule.keywords.length > 0 && rule.keywords.every((kw) => kw && hay.includes(kw));
  }
  if (rule.match_type === 'regex') {
    try {
      return rule.keywords.some((kw) => kw && new RegExp(kw, 'i').test(hay));
    } catch {
      return false;
    }
  }
  // contains_any (default). Empty keyword list = fallback catch-all (last Minor rule).
  if (rule.keywords.length === 0) return true;
  return rule.keywords.some((kw) => kw && hay.includes(kw));
}

export interface VerifyInput {
  priority: string | null | undefined;
  description: string | null | undefined;
  issueDescription?: string | null | undefined;
  importStatus: string | null | undefined;
  existingClosureStatus: string | null | undefined;
}

export type VerifyOutcome =
  | { action: 'set'; verification: string; reason: string; rule_id: string; step: number; category: string }
  | { action: 'clear' } // priority is not Cat A → null both columns
  | { action: 'preserve' } // gated (Closed / Done) → keep existing values
  | { action: 'no_match' }; // eligible but no rule matched and no fallback

/**
 * Pure-function classifier. Caller passes pre-loaded rules so this runs synchronously
 * during the import loop without re-querying per row.
 */
export function verifyPriority(input: VerifyInput, rules: VerificationRule[]): VerifyOutcome {
  const priority = (input.priority ?? '').trim();
  const isCatA = priority === CAT_A_PRIORITY_VALUE;

  // (Q4) Clear policy: row is no longer Cat A → wipe both fields.
  if (!isCatA) return { action: 'clear' };

  // Gates: Closed import status OR existing Done closure_status → preserve current values.
  const importClosed = (input.importStatus ?? '').trim().toLowerCase() === 'closed';
  const existingDone = (input.existingClosureStatus ?? '').trim().toLowerCase() === 'done';
  if (importClosed || existingDone) return { action: 'preserve' };

  // Concatenate Description + Issue Description (case-insensitive) for keyword matching.
  const descPart = (input.description ?? '').toString().toLowerCase();
  const issuePart = (input.issueDescription ?? '').toString().toLowerCase();
  const desc = [descPart, issuePart].filter((s) => s.trim()).join('\n');
  if (!desc.trim()) return { action: 'no_match' };

  for (const rule of rules) {
    if (ruleMatches(rule, desc)) {
      return {
        action: 'set',
        verification: VERDICT_TO_LABEL[rule.verdict],
        reason: rule.explanation,
        rule_id: rule.id,
        step: rule.step,
        category: rule.category,
      };
    }
  }
  return { action: 'no_match' };
}
