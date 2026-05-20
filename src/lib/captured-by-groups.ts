// Captured By 인물 → 그룹 매핑.
// 정확 매칭 우선, 실패 시 별칭/부분일치(소문자) fallback. 미매칭은 'Other'.

export const CAPTURED_BY_GROUPS = ['Arch', 'Facade', 'MEP', 'Other'] as const;
export type CapturedByGroup = (typeof CAPTURED_BY_GROUPS)[number];

interface GroupDef {
  group: Exclude<CapturedByGroup, 'Other'>;
  exact: string[];
  aliases: string[]; // 소문자 부분일치
}

const GROUP_DEFS: GroupDef[] = [
  {
    group: 'Arch',
    exact: [
      'Penn Theen',
      'Theepa Vishali Kanisan',
      'Kuan Wei Wong',
      'Nick Cranney',
      'Mani Kamalabathan',
      'Mohammad Hossain',
      'Rasyid Suwandi',
      'Minxian Lee',
      'Chin Siong Lim',
    ],
    aliases: ['penn', 'theepa', 'kuan', 'nick', 'mani', 'imam', 'hossain', 'rasyid', 'minxian', 'chin siong'],
  },
  {
    group: 'Facade',
    exact: ['Merlin Sesaiyan', 'Lawrence Lau'],
    aliases: ['merlin', 'lawrence'],
  },
  {
    group: 'MEP',
    exact: ['Sahari Bin Sam', 'Derrick Tan', 'Boon Ken Lau', 'Audrey Chin'],
    aliases: ['sahari', 'derrick', 'boon ken', 'beca boon', 'audrey', 'beca chin', 'beca'],
  },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const EXACT_LOOKUP = new Map<string, CapturedByGroup>();
for (const def of GROUP_DEFS) {
  for (const name of def.exact) EXACT_LOOKUP.set(norm(name), def.group);
}

export function getCapturedByGroup(name: string | null | undefined): CapturedByGroup | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  const hit = EXACT_LOOKUP.get(n);
  if (hit) return hit;
  for (const def of GROUP_DEFS) {
    if (def.aliases.some((a) => n.includes(a))) return def.group;
  }
  return 'Other';
}

// 특정 그룹에 속하는 알려진 인물 이름 (Raw Data IN 필터용).
export function getNamesInGroup(group: CapturedByGroup, allNames: string[]): string[] {
  return allNames.filter((n) => getCapturedByGroup(n) === group);
}
