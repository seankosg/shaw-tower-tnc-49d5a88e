## Baseline / Remaining 토글 구현 플랜 (최종본)

### 토글 위치
- **Dashboard**: `Other: Plan vs Actual - Summary` 카드 헤더 우측
- **Progress**: 툴바의 **Lookup** ToolbarGroup **바로 아래**에 새로운 `ToolbarGroup label="Plan Mode"`

### 공통 사양
- 라벨: `Baseline` / `Remaining`
- 기본값: `Remaining`
- 컴포넌트: `ToggleGroup` (single, size sm)

### 페이지 간 동기화 (신규 요구사항)
Dashboard와 Progress의 토글 상태를 양방향 동기화:

- **저장소**: `localStorage` 키 `defect:planMode` (단일 source of truth)
- **공용 훅**: `src/hooks/usePlanMode.ts` 신규 생성
  - 초기값: `localStorage` → 없으면 `'remaining'`
  - 변경 시 `localStorage.setItem` + `window.dispatchEvent(new Event('planmode-change'))`
  - `storage` 이벤트(다른 탭) + `planmode-change` 이벤트(같은 탭, 다른 페이지)를 구독해 자동 재렌더
  - 시그니처: `const [planMode, setPlanMode] = usePlanMode();`
- **URL 동기화**: 페이지별 `plan_mode` 쿼리도 함께 유지 (북마크/공유용)
  - 마운트 시 URL 값이 있으면 그것으로 localStorage 갱신(URL 우선)
  - 토글 변경 시 URL과 localStorage 모두 업데이트
  - 기본값(`remaining`)일 때는 쿼리 파라미터 생략

### 적용 범위 (로직)
플랜 셀 / Cumulative Plan 모두에 동일 규칙 적용:
- `Baseline`: 기존 로직 (planned_date 있으면 카운트)
- `Remaining`: `count_plan(item, s) iff planned_date(s) && !isStageActualUpTo(item, s, asOfDate)`

### 변경 파일
1. **`src/hooks/usePlanMode.ts`** (신규)
   - localStorage + 커스텀 이벤트 기반 동기화 훅
2. **`src/lib/defect-schedule-utils.ts`**
   - `DefectAggregateOptions.planMode?: 'baseline' | 'remaining'` (default `baseline`)
   - 셀/누적 플랜 누적 분기 추가
3. **`src/lib/defect-dashboard-utils.ts`**
   - `aggregateDefectPlanActualByGroup`에 동일 옵션/분기 추가
4. **`src/pages/DefectProgressPage.tsx`**
   - `usePlanMode()` 사용 + URL `plan_mode` sync
   - Lookup 아래 `<ToolbarGroup label="Plan Mode">` 배치
   - `aggregateDefectSchedule` 호출 + **상단 KPI 블록**(`cumPlan` 등)에도 `planMode` 반영 (A안)
   - 헤더 부제목에 현재 모드 라벨 표시
5. **`src/pages/DefectDashboardPage.tsx`**
   - `usePlanMode()` 사용 + URL `plan_mode` sync
   - `Plan vs Actual - Summary` CardHeader 우측에 ToggleGroup 배치
   - 7개 `aggregateDefectPlanActualByGroup` 호출 + `(baseline)` 라벨 동적화
6. **Excel exports**
   - `defect-schedule-excel-export.ts`, `defect-dashboard-excel-export.ts` 헤더/시트명에 현재 `planMode` 반영

### 동기화 동작 시나리오
- Dashboard에서 `Baseline → Remaining` 변경 → 같은 탭의 Progress 탭으로 이동 시 즉시 Remaining 적용
- Progress 열린 상태에서 다른 탭(Dashboard)에서 변경 → `storage` 이벤트로 자동 갱신
- 새 세션/새 사용자 → localStorage 없음 → `remaining` 기본값

### 영향 없는 영역 (의도적 baseline 고정)
S-Curve, Top Overdue, Critical Watchlist, AlertBanner, Pie chart, KPI Card, diffMetrics.

### 필터 호환성
Progress(team/group_by/bucket/stage_view/asof_mode/range/hide_past), Dashboard(team/sub-trade/breakdownTab) 모두 aggregate 입력에 반영되어 `planMode`와 일관 동작.

### 테스트
- 기존 `defect-dashboard-utils.test.ts` 통과 확인 (default baseline 유지)
- Remaining 모드: 완료된 stage가 plan 셀/누적에서 제외되는지 검증 케이스 추가
