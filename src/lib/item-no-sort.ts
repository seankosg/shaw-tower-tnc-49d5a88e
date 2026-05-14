// Natural sort for Subtest Item No values.
//
// Supported shapes:
//   "Elec-001"           → prefix="Elec", num=1,   lvl=0
//   "Elec-197"           → prefix="Elec", num=197, lvl=0     (parent)
//   "Elec-197/L2"        → prefix="Elec", num=197, lvl=2     (level child)
//   "Elec-197/L32"       → prefix="Elec", num=197, lvl=32
//   "Elec-197/RF"        → prefix="Elec", num=197, lvl=9000  (roof at top)
//   "Elec-197/B1"        → prefix="Elec", num=197, lvl=-1    (basement below L1)
//   anything else        → fallback to raw string
//
// Children sort right after their parent, in ascending level order.
export interface ItemNoParts {
  prefix: string;
  num: number;
  lvl: number;
  raw: string;
}

export function parseItemNoForSort(value: unknown): ItemNoParts {
  const raw = value == null ? '' : String(value);
  const m = raw.match(/^([A-Za-z]+)-(\d+)(?:\/(.+))?$/);
  if (!m) return { prefix: raw, num: -1, lvl: 0, raw };
  const prefix = m[1];
  const num = parseInt(m[2], 10);
  const tail = (m[3] ?? '').trim();
  let lvl = 0;
  if (tail) {
    const lm = tail.match(/^L(\d+)$/i);
    const bm = tail.match(/^B(\d+)$/i);
    if (lm) lvl = parseInt(lm[1], 10);
    else if (bm) lvl = -parseInt(bm[1], 10);
    else if (/^RF$/i.test(tail)) lvl = 9000;
    else if (/^MEZZ?$/i.test(tail)) lvl = 8000;
    else lvl = 9999; // unknown suffix → bottom of group
  }
  return { prefix, num, lvl, raw };
}

export function compareItemNo(a: unknown, b: unknown): number {
  const A = parseItemNoForSort(a);
  const B = parseItemNoForSort(b);
  if (A.prefix !== B.prefix) return A.prefix.localeCompare(B.prefix);
  if (A.num !== B.num) return A.num - B.num;
  if (A.lvl !== B.lvl) return A.lvl - B.lvl;
  return A.raw.localeCompare(B.raw);
}
