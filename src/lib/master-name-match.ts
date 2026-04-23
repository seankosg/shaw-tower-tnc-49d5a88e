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