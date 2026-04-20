

## Schedule Matrix — Stage 필터 연동 + Cum 컬럼 통합

### 결정사항 (확정)
1. **Done/Total**: Stage 필터에 따라 동적
   - `'all'` → Pred Done + T1 Done + T2 Done / subtest수 × 3
   - 단일 stage → 해당 stage Done 카운트 / subtest수
2. **Actual 정의**: 모든 stage(Pred/T1/T2)에서 `*_status === 'Done'`인 항목만 actual 카운트 (현행 유지 확인)
3. **Cum 컬럼 통합**:
   - 기존 `Cum Plan` + `Cum Actual` 두 컬럼을 1개로 합침
   - 헤더: `Actual/Plan` 또는 `Cum Actual/Plan`
   - 표시 형식: `{actual}/{plan} ({pct}%)`
   - **기간 정의**: 오늘까지(today 포함)의 Plan 대비 Actual
     - Plan: `plan_date <= today`인 항목 카운트
     - Actual: `actual_date <= today`인 항목 카운트
     - %: `(actual / plan) × 100`, plan=0이면 `—`

---

### 변경 내용

#### 1. `src/lib/schedule-utils.ts`
- `aggregateSchedule()`:
  - `doneCount` 계산을 `stageFilter` 기반으로 변경
    - `'all'` → 3 stage Done 합산
    - 단일 → 해당 stage Done
  - `total` (분모):
    - `'all'` → `items.length × 3`
    - 단일 → `items.length`
  - `cumPlan` / `cumActual` 정의를 **"오늘까지"** 로 변경
    - Plan: `plan_date && plan_date <= today` 카운트 (선택된 stagesToShow만)
    - Actual: `actual_date && actual_date <= today` 카운트 (선택된 stagesToShow만)
  - `today` 인자를 `AggregateOptions`에 추가
- `GroupRow` 인터페이스에 변경 없음 (필드 의미만 갱신)

#### 2. `src/pages/SchedulePage.tsx`
- `aggregateSchedule` 호출 시 `today` 전달
- KPI strip의 `Cum Plan` / `Cum Actual` 두 카드를 1개 카드 `Cum Actual/Plan`으로 통합
  - 표시: `{cumActual}/{cumPlan} ({pct}%)`
  - `pct < 100` → `short` accent, `> 100` → `over` accent

#### 3. `src/components/schedule/ScheduleMatrix.tsx`
- 우측 고정 컬럼:
  - 기존 `Done`, `Total`, `Cum Plan`, `Cum Actual` (4개)
  - 변경 후: `Done`, `Total`, `Actual/Plan` (3개)
- 헤더 라벨 stage별 동적:
  - `'all'` → "All Done", "Total", "Actual/Plan"
  - `'pred'/'t1'/'t2'` → 각각 "Pred Done" 등
- 그룹 행 셀:
  - `Actual/Plan` 셀: `{cumActual}/{cumPlan} (xx%)`
  - %에 색상: <100% 빨강(short), >100% 파랑(over)
  - title 툴팁: "오늘까지의 Plan 대비 Actual"
- Stage 서브 행도 동일하게 `Actual/Plan` 컬럼 적용

### 비변경
- Bucket(Day/Week), Range — 표시 범위(시간 축 셀)에만 영향
- ScheduleCell 셀 카운트 — 현행 유지 (Plan/Actual 버킷별 표시)
- Critical Watchlist, Lagging Groups — 영향 없음
- DB / Import — 영향 없음

### 검증
1. Stage='Pred' → Done = Master DB pred Done 수, Actual/Plan은 오늘까지 Pred 기준
2. Stage='T1'/'T2' → 각 stage 기준
3. Stage='All' → 3 stage 합산
4. Actual/Plan % = (오늘까지 actual_date 카운트) / (오늘까지 plan_date 카운트)
5. 기간 외 미래 항목은 분모/분자 모두 제외

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/schedule-utils.ts` | doneCount/total/cumPlan/cumActual 로직 + today 인자 |
| `src/pages/SchedulePage.tsx` | today 전달 + KPI 통합 |
| `src/components/schedule/ScheduleMatrix.tsx` | 컬럼 통합 + 동적 헤더 + %표시 |

