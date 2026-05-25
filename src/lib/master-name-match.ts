const COMPANY_SUFFIXES = new Set([
  'co', 'company', 'ltd', 'limited', 'pte', 'plc', 'inc', 'corp', 'corporation',
  'llc', 'group', 'engineering', 'eng', 'contractor', 'contractors', 'the', 'and',
]);

export function masterNameKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

export function normalizeMasterName(value?: string | null) {
  const words = (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word && !COMPANY_SUFFIXES.has(word));

  return words.join(' ');
}

export function masterNameSimilarity(a?: string | null, b?: string | null) {
  const left = normalizeMasterName(a);
  const right = normalizeMasterName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const leftTokens = new Set(left.split(' '));
  const rightTokens = new Set(right.split(' '));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function findSimilarMasterName<T extends { name: string }>(
  importedName: string,
  candidates: T[],
  threshold = 0.72,
) {
  return candidates
    .map((candidate) => ({ candidate, score: masterNameSimilarity(importedName, candidate.name) }))
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

/** Standard Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Find the closest master name within `maxDistance` Levenshtein edits (exclusive of 0).
 *  Compares case-insensitive trimmed forms. Returns the smallest-distance match, or null. */
export function findEditDistanceMatch<T extends { name: string }>(
  importedName: string,
  candidates: T[],
  maxDistance = 2,
): { candidate: T; distance: number } | null {
  const left = masterNameKey(importedName);
  if (!left) return null;
  let best: { candidate: T; distance: number } | null = null;
  for (const candidate of candidates) {
    const right = masterNameKey(candidate.name);
    if (!right || right === left) continue;
    if (Math.abs(right.length - left.length) > maxDistance) continue;
    const d = levenshtein(left, right);
    if (d <= maxDistance && (best === null || d < best.distance)) {
      best = { candidate, distance: d };
      if (d === 1) break;
    }
  }
  return best;
}
