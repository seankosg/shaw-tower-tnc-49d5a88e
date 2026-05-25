import { supabase } from '@/integrations/supabase/client';
import { findEditDistanceMatch, masterNameKey } from '@/lib/master-name-match';

export interface SubMaster {
  id: string;
  name: string;
  type: string | null;
  parent_subcontractor_id: string | null;
}

export interface SubMasterMaps {
  /** All sub-type masters (for similarity search). */
  subMasters: SubMaster[];
  /** lowerName -> canonical sub name. */
  subCanonical: Map<string, string>;
  /** "parentLowerCanonical::subsubLower" -> canonical subsub name. */
  subsubCanonical: Map<string, string>;
  /** subsub masters with resolved parentName for scoped similarity. */
  subsubMasters: Array<SubMaster & { parentName: string | null }>;
}

/** Fetch active subcontractor_master and build canonical lookup maps. */
export async function fetchSubMasterMaps(): Promise<SubMasterMaps> {
  const { data } = await (supabase as any)
    .from('subcontractor_master')
    .select('id, name, type, parent_subcontractor_id')
    .eq('is_active', true);
  const masters = ((data ?? []) as SubMaster[]);

  const subMasters = masters.filter((m) => (m.type ?? 'sub') === 'sub');
  const subIdToName = new Map(subMasters.map((m) => [m.id, m.name]));

  const subCanonical = new Map<string, string>();
  for (const m of subMasters) {
    const k = masterNameKey(m.name);
    if (k && !subCanonical.has(k)) subCanonical.set(k, m.name);
  }

  const subsubMasters = masters
    .filter((m) => m.type === 'subsub')
    .map((m) => ({ ...m, parentName: m.parent_subcontractor_id ? subIdToName.get(m.parent_subcontractor_id) ?? null : null }));

  const subsubCanonical = new Map<string, string>();
  for (const m of subsubMasters) {
    const key = `${masterNameKey(m.parentName)}::${masterNameKey(m.name)}`;
    if (!subsubCanonical.has(key)) subsubCanonical.set(key, m.name);
  }

  return { subMasters, subCanonical, subsubCanonical, subsubMasters };
}

/** Replace `subcontractor_name` / `subsub_name` (if present on the row shape) with
 *  the master's canonical casing when an exact case-insensitive match exists.
 *  Mutates `rows` in place. Returns total replacement count. */
export function normalizeRowsAgainstMaster<
  T extends { subcontractor_name?: string | null; subsub_name?: string | null },
>(rows: T[], maps: SubMasterMaps): number {
  let replaced = 0;
  for (const row of rows) {
    const subKey = masterNameKey(row.subcontractor_name);
    if (subKey && maps.subCanonical.has(subKey)) {
      const canonical = maps.subCanonical.get(subKey)!;
      if (row.subcontractor_name && row.subcontractor_name !== canonical) {
        row.subcontractor_name = canonical;
        replaced++;
      }
    }
    if ('subsub_name' in row) {
      const parentName = row.subcontractor_name ?? null;
      const subsubKey = `${masterNameKey(parentName)}::${masterNameKey(row.subsub_name)}`;
      if (row.subsub_name && maps.subsubCanonical.has(subsubKey)) {
        const canonical = maps.subsubCanonical.get(subsubKey)!;
        if (row.subsub_name !== canonical) {
          row.subsub_name = canonical;
          replaced++;
        }
      }
    }
  }
  return replaced;
}

export type SimilarDecisionAction = 'use_existing' | 'register_new';
export interface SimilarMasterDecision {
  key: string;
  kind: 'subcontractor' | 'subsub';
  importedName: string;
  existingName: string;
  parentName?: string | null;
  distance: number;
  action?: SimilarDecisionAction;
}

/** Detect imported names that don't exist as exact master entries but are within
 *  `maxDistance` (default 2) edits of an existing master. */
export function detectEditDistanceDecisions<
  T extends { subcontractor_name?: string | null; subsub_name?: string | null },
>(rows: T[], maps: SubMasterMaps, maxDistance = 2): SimilarMasterDecision[] {
  const exactSubs = new Set(maps.subMasters.map((m) => masterNameKey(m.name)));
  const exactSubsubs = new Set(maps.subsubMasters.map((m) => `${masterNameKey(m.parentName)}::${masterNameKey(m.name)}`));
  const decisions = new Map<string, SimilarMasterDecision>();

  for (const row of rows) {
    const subName = row.subcontractor_name?.trim();
    if (subName && !exactSubs.has(masterNameKey(subName))) {
      const k = `sub:${masterNameKey(subName)}`;
      if (!decisions.has(k)) {
        const match = findEditDistanceMatch(subName, maps.subMasters, maxDistance);
        if (match) {
          decisions.set(k, {
            key: k, kind: 'subcontractor',
            importedName: subName, existingName: match.candidate.name,
            distance: match.distance,
          });
        }
      }
    }

    const subsubName = row.subsub_name?.trim();
    if (subsubName) {
      // Use the (possibly suggested) parent for subsub scope.
      const parentDecision = decisions.get(`sub:${masterNameKey(subName)}`);
      const parentName = (parentDecision?.existingName ?? subName)?.trim() || null;
      if (parentName && !exactSubsubs.has(`${masterNameKey(parentName)}::${masterNameKey(subsubName)}`)) {
        const k = `subsub:${masterNameKey(parentName)}::${masterNameKey(subsubName)}`;
        if (!decisions.has(k)) {
          const candidates = maps.subsubMasters.filter((m) => masterNameKey(m.parentName) === masterNameKey(parentName));
          const match = findEditDistanceMatch(subsubName, candidates, maxDistance);
          if (match) {
            decisions.set(k, {
              key: k, kind: 'subsub',
              importedName: subsubName, existingName: match.candidate.name,
              parentName, distance: match.distance,
            });
          }
        }
      }
    }
  }
  return [...decisions.values()];
}

/** Apply user's per-decision action to a row, producing the final names to import.
 *  Decisions are looked up by the lowercase key. `register_new` (or undefined) keeps the imported name. */
export function applyDecisionsToRow<
  T extends { subcontractor_name?: string | null; subsub_name?: string | null },
>(row: T, decisions: SimilarMasterDecision[]): T {
  if (decisions.length === 0) return row;
  const byKey = new Map(decisions.map((d) => [d.key, d]));
  const subKey = `sub:${masterNameKey(row.subcontractor_name)}`;
  const subDecision = byKey.get(subKey);
  const mappedSub = subDecision?.action === 'use_existing' ? subDecision.existingName : row.subcontractor_name;
  const subsubKey = `subsub:${masterNameKey(mappedSub)}::${masterNameKey(row.subsub_name)}`;
  const subsubDecision = byKey.get(subsubKey);
  const mappedSubsub = subsubDecision?.action === 'use_existing' ? subsubDecision.existingName : row.subsub_name;
  return { ...row, subcontractor_name: mappedSub, subsub_name: mappedSubsub };
}

/** In-place variant of {@link applyDecisionsToRow} for a row array. */
export function applyDecisionsInPlace<
  T extends { subcontractor_name?: string | null; subsub_name?: string | null },
>(rows: T[], decisions: SimilarMasterDecision[]): void {
  if (decisions.length === 0) return;
  const byKey = new Map(decisions.map((d) => [d.key, d]));
  for (const row of rows) {
    const subKey = `sub:${masterNameKey(row.subcontractor_name)}`;
    const subDecision = byKey.get(subKey);
    if (subDecision?.action === 'use_existing') row.subcontractor_name = subDecision.existingName;
    const subsubKey = `subsub:${masterNameKey(row.subcontractor_name)}::${masterNameKey(row.subsub_name)}`;
    const subsubDecision = byKey.get(subsubKey);
    if (subsubDecision?.action === 'use_existing') row.subsub_name = subsubDecision.existingName;
  }
}
