## 목표
대시보드 1단(Tier 1)의 **Done / Remaining / Progress** KPI 계산 기준을 현재의 **R2(Approved)** 에서 **T2(Done)** 으로 변경합니다. 클릭 시 Raw Data 필터도 동일 기준으로 일관성 있게 맞춥니다.

## 변경 사항

### 1) `src/pages/DashboardPage.tsx` — KPI 계산
- `totalDone` 계산을 `isStageDone(s, 'r2')` → `isStageDone(s, 't2')` 로 변경
- `remaining`, `progressPct` 는 `totalDone` 기반이라 자동 반영됨

### 2) `src/pages/DashboardPage.tsx` — 1단 카드 라벨/링크
- **Done 카드**:
  - sub 라벨: `"R2 Approved"` → `"T2 Done"`
  - onClick: `goSubtests({ r2_status: 'Approved' })` → `goSubtests({ t2_status: 'Done' })`
- **Remaining 카드**:
  - sub 라벨: `"R2 not Approved"` → `"T2 not Done"`
  - onClick: `goSubtests({ status: 'remaining' })` 유지 (필터 의미는 아래에서 T2 기준으로 변경)

### 3) `src/pages/SubtestList.tsx` — Remaining 필터
- `status=remaining` 의 판정을 `isStageDone(r, 'r2')` → `isStageDone(r, 't2')` 로 변경
- (필요 시 화면 표기 라벨이 있다면 "T2 not Done" 으로 통일)

## 영향 범위 / 비영향
- **영향 받음**: 1단 Done/Remaining/Progress 수치, 클릭 시 Raw Data 필터, `status=remaining` 결과 집합
- **영향 없음 (그대로 유지)**:
  - 2단 Stage Cards (Pred/T1/T2/R1/R2) — 각 단계별 카드는 본인 기준 그대로
  - 3단 Overdue/At-Risk — 이미 Pred/T1/T2 기준
  - Plan vs Actual 표, S-Curve, 그룹 집계 — 변경 없음

## 핵심 로직 (변경 후)
```ts
// DashboardPage.tsx
const totalDone   = filteredSubtests.filter(s => isStageDone(s, 't2')).length;
const remaining   = total - totalDone;
const progressPct = total ? Math.round((totalDone / total) * 1000) / 10 : 0;

// 1단 카드
<KpiCard label="Done"      sub="T2 Done"     onClick={() => goSubtests({ t2_status: 'Done' })} ... />
<KpiCard label="Remaining" sub="T2 not Done" onClick={() => goSubtests({ status: 'remaining' })} ... />

// SubtestList.tsx
if (urlStatusFilter === 'remaining' && isStageDone(r, 't2')) return false;
```
