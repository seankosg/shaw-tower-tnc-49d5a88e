

# Team(공종) 분류 필드 추가

## 요약
`subtests` 테이블에 `team` 컬럼(Mech/Elec/Arch/Supp)을 추가하고, Import 시 파일별로 공종을 선택하여 모든 subtest에 해당 값을 저장합니다.

---

## 1. DB 마이그레이션

`subtests` 테이블에 `team` 컬럼 추가:

```sql
CREATE TYPE public.team_type AS ENUM ('Mech', 'Elec', 'Arch', 'Supp');

ALTER TABLE public.subtests
  ADD COLUMN team public.team_type NULL;
```

---

## 2. Import 흐름에 Team 선택 추가

### ImportContext.tsx
- `ImportFileItem` 인터페이스에 `team?: string` 필드 추가
- `ImportContextValue`에 `setFileTeam(id: string, team: string)` 함수 추가
- `processFile()` 내 insert/update 시 `team` 값을 파일의 `team` 설정값으로 포함

### ImportPage.tsx
- 파일별 "Data Date" 입력 옆에 **Team 선택 드롭다운** 추가 (Mech / Elec / Arch / Supp)
- 파일이 `ready` 상태이고 team이 미선택이면 Import 실행 불가 (readyCount 조건에 team 필수 체크 추가)

---

## 3. types/enums.ts 업데이트

```typescript
export type TeamType = 'Mech' | 'Elec' | 'Arch' | 'Supp';
export const ALL_TEAMS: TeamType[] = ['Mech', 'Elec', 'Arch', 'Supp'];
export const TEAM_LABELS: Record<TeamType, string> = {
  Mech: '설비 (Mechanical)',
  Elec: '전기 (Electrical)',
  Arch: '건축 (Architecture)',
  Supp: '지원 (Support)',
};
```

---

## 4. Raw Data (SubtestList) 컬럼 추가

- `SubtestRow`에 `team` 필드 추가
- 테이블 columns에 "Team" 컬럼 추가 (multi-select 필터 지원)
- Supabase 쿼리의 select에 `team` 포함

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `supabase/migrations/` | team_type enum + subtests.team 컬럼 |
| `src/types/enums.ts` | TeamType, ALL_TEAMS, TEAM_LABELS 추가 |
| `src/contexts/ImportContext.tsx` | team 필드, setFileTeam, insert/update에 team 포함 |
| `src/pages/ImportPage.tsx` | 파일별 Team 선택 UI + team 필수 검증 |
| `src/pages/SubtestList.tsx` | Team 컬럼 + 필터 추가 |
| `src/pages/SubtestDetail.tsx` | Team 표시 (읽기 전용 또는 편집 가능) |

