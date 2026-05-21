/**
 * Compress (system, level) rows into a letter-friendly one-liner.
 *
 *   [{system:'Substation 1', level:'L5'},
 *    {system:'Substation 1', level:'L6'},
 *    {system:'Substation 1', level:'L7'},
 *    {system:'Genset',       level:'L1'}]
 *   → "Substation 1 (L5–L7); Genset (L1)"
 *
 * Rules:
 *  - group by system name
 *  - within a group, sort levels and collapse 4+ consecutive levels into "Lx–Ly"
 *  - join groups with "; "
 *  - if final string > maxLen, append " … +N more"
 */

export interface SystemRow {
  system: string | null;
  level: string | null;
}

export interface SummarizeOptions {
  maxLen?: number;
}

function levelNum(l: string): number | null {
  const m = /^L?(\d+)$/i.exec(l.trim());
  return m ? parseInt(m[1], 10) : null;
}

function compressLevels(levels: string[]): string {
  const uniq = Array.from(new Set(levels.filter(Boolean)));
  if (uniq.length === 0) return '';
  // Try numeric range compression
  const nums = uniq.map(levelNum);
  if (nums.every((n) => n !== null)) {
    const sorted = (nums as number[]).slice().sort((a, b) => a - b);
    const parts: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      // close current run
      if (start === prev) parts.push(`L${start}`);
      else if (prev - start >= 3) parts.push(`L${start}–L${prev}`);
      else {
        for (let v = start; v <= prev; v++) parts.push(`L${v}`);
      }
      if (cur !== undefined) {
        start = cur;
        prev = cur;
      }
    }
    return `(${parts.join(', ')})`;
  }
  // Non-numeric levels — just list as-is sorted
  return `(${uniq.slice().sort().join(', ')})`;
}

/**
 * System-name-only summary: dedupe + sort + comma-join.
 * Levels and counts are intentionally omitted (letter-friendly).
 */
export function summarizeSystemNames(rows: SystemRow[], opts: SummarizeOptions = {}): string {
  const maxLen = opts.maxLen ?? 120;
  const names = Array.from(
    new Set(
      rows
        .map((r) => (r.system ?? '').trim())
        .filter((s) => s.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return '';
  const full = names.join(', ');
  if (full.length <= maxLen) return full;
  let out = '';
  let kept = 0;
  for (const name of names) {
    const candidate = out ? `${out}, ${name}` : name;
    if (candidate.length > maxLen - 16) break;
    out = candidate;
    kept++;
  }
  const remaining = names.length - kept;
  return remaining > 0 ? `${out} … +${remaining} systems` : out;
}

export function summarizeSystems(rows: SystemRow[], opts: SummarizeOptions = {}): string {
  const maxLen = opts.maxLen ?? 120;
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const sys = (r.system ?? '').trim();
    const lvl = (r.level ?? '').trim();
    if (!sys && !lvl) continue;
    const key = sys || '(unknown)';
    const arr = groups.get(key) ?? [];
    if (lvl) arr.push(lvl);
    groups.set(key, arr);
  }

  const parts: string[] = [];
  for (const [sys, levels] of groups) {
    const compressed = compressLevels(levels);
    parts.push(compressed ? `${sys} ${compressed}` : sys);
  }
  const full = parts.join('; ');
  if (full.length <= maxLen) return full;

  // Truncate but keep complete system groups
  let out = '';
  let kept = 0;
  for (const p of parts) {
    const candidate = out ? `${out}; ${p}` : p;
    if (candidate.length > maxLen - 12) break;
    out = candidate;
    kept++;
  }
  const remaining = parts.length - kept;
  return remaining > 0 ? `${out} … +${remaining} more` : out;
}
