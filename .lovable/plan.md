## Critical Level Summary 컴포넌트 (OMM Stage Progress 스타일)

Punch Dashboard에 Critical Level별로 그룹화된 카드 묶음을 추가합니다. 각 그룹은 OMM Executive Dashboard의 "Stage Progress" 1st Status 카드처럼 **좌측 accent bar + chip 그리드** 패턴을 그대로 차용해 4 gate의 Approved / Pending 현황을 보여줍니다.

### 데이터 규칙

- **Approved 처리 (Pre-Engineering 완료 간주)**
  - Approval 계열(`material_approval_status`, `drawing_approval_status`, `mos_approval_status`): `approved` 또는 `not_required`
  - Procurement(`material_procurement_status`): `secured` 또는 `not_required`
- **Pending 처리**
  - Approval 계열: `pending`
  - Procurement: `pending` 또는 `partially_secured`
- 각 gate에서 Approved + Pending = 그룹 Total
- Critical Level 정렬: High → mid-High → Medium → mid-Low → Low → Unspecified

### UI 구조 (OMM 스타일 차용)

`PunchDashboardPage.tsx`의 Data Quality 카드 위에 단일 카드 **"Critical Level Summary"** 추가. 카드 헤더 아래에 Critical Level 그룹 카드를 `grid sm:grid-cols-2 xl:grid-cols-3 gap-3`로 배치합니다.

각 그룹 카드는 OMM `OmmSubStatusCard`와 동일한 외관:

```text
┌─ ▌(accent bar) ────────────────────────────────┐
│ High                              12 items     │
│ Earliest 2026-04-01 · Latest 2026-06-30        │
│ ┌────┬────┬────┬────┐                          │
│ │MTL │PROC│DWG │MOS │   (라벨, 상단)          │
│ │10/12│ 8/12│12/12│11/12│ (Approved/Total)    │
│ └────┴────┴────┴────┘                          │
└────────────────────────────────────────────────┘
```

- accent bar 색상은 Critical Level별 매핑 (High=red, mid-High=orange, Medium=amber, mid-Low=sky, Low=emerald, Unspecified=muted)
- 4 gate chip 톤은 OMM과 동일한 의미 색상 사용: gate가 **all approved** → emerald 톤, **pending 존재** → amber 톤, **pending 다수(>50%)** → rose 톤
- chip 클릭 시 해당 critical level + gate pending 필터로 RawData 이동 (`?criticalLevel=High&gate=material_approval&status=pending`)
- 카드 본문 클릭 시 해당 critical level만 필터로 RawData 이동 (`?criticalLevel=High`)
- 그룹에 항목이 0개이면 카드 자체를 렌더하지 않음

### 기술 구현

**`src/lib/punch-dashboard-utils.ts`** 추가:

```ts
export const CRITICAL_LEVEL_ORDER = ['High','mid-High','Medium','mid-Low','Low','Unspecified'] as const;
export type CriticalLevel = typeof CRITICAL_LEVEL_ORDER[number];

export type GateKey = 'material_approval' | 'procurement' | 'drawing_approval' | 'mos_approval';
export interface GateCount { approved: number; pending: number; total: number; }

export interface CriticalLevelSummary {
  level: CriticalLevel;
  total: number;
  earliestStart: string | null;
  latestFinish: string | null;
  gates: Record<GateKey, GateCount>;
}

export function summarizeByCriticalLevel(items: PunchItem[]): CriticalLevelSummary[];
```

- 헬퍼: `isApprovalApproved(v) = v==='approved'||v==='not_required'`, `isProcurementApproved(v) = v==='secured'||v==='not_required'`
- null/빈 `critical_level`은 `Unspecified` 버킷

**`src/pages/PunchDashboardPage.tsx`**:
- `summarizeByCriticalLevel(items)` useMemo
- 새 `CriticalLevelGroupCard` 서브 컴포넌트 (OMM `OmmSubStatusCard`의 마크업/클래스 패턴을 복제)
- 4 gate 라벨: `MTL`, `PROC`, `DWG`, `MOS` (전체 라벨은 `title` tooltip)
- 기존 `go()` 헬퍼로 RawData 라우팅

### 변경 파일

- `src/lib/punch-dashboard-utils.ts`
- `src/pages/PunchDashboardPage.tsx`

DB/RLS/백엔드 변경 없음.
