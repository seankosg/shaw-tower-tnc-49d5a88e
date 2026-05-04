// Spare part status normalization
export type SparePartStatusNorm = 'ordered' | 'stock' | 'pending' | 'short' | 'unknown';

export const SPARE_PART_STATUS_BADGE_VARIANT: Record<SparePartStatusNorm, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ordered: 'secondary',
  stock: 'default',
  pending: 'outline',
  short: 'destructive',
  unknown: 'outline',
};

export function normalizeSparePartStatus(raw: string | null | undefined): SparePartStatusNorm {
  const v = String(raw ?? '').toLowerCase().trim();
  if (!v) return 'unknown';
  if (v.includes('order')) return 'ordered';
  if (v.includes('stock') || v.includes('available')) return 'stock';
  if (v.includes('short')) return 'short';
  if (v.includes('pending') || v.includes('await')) return 'pending';
  return 'unknown';
}

export const SPARE_PART_CATEGORY_LABELS: Record<string, string> = {
  A: 'Architectural',
  B: 'Mechanical & Electrical',
  C: 'Miscellaneous',
};
