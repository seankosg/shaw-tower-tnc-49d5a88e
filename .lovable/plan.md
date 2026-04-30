## 목표

**Defect Dashboard → Plan vs Actual S-Curve** 차트 개선:

1. **일자별 Plan 물량을 세로 막대그래프**로 표시 (단일 Stage 모드)
2. **All Stage 모드**: 한 막대에 Start/Completion/Closure를 **누적(Stacked)** 형태로, 스테이지별 색상으로 표현
3. **Group 필터를 토글 버튼**으로 변경 (Bucket 필터와 동일 패턴)
4. **Stage 필터에 "All" 추가**
5. **Y축 단위는 데이터 Max 값에 따라 자동 스케일링** (시인성 극대화)

---

## 1. 일자별 Plan 막대 (단일 Stage 모드)

현재 차트:
- 누적 Plan 라인 (점선) + 누적 Actual 라인 (실선)
- 하단 Variance 막대 서브차트

**추가**: 메인 차트에 **버킷별 Plan 증분(=하루/주간 물량)을 세로 막대**로 라인 뒤에 렌더링.
- 좌측 Y축 = 누적 카운트 (라인용)
- 우측 Y축 = 버킷별 카운트 (막대용)
- Plan 막대: 옅은 회색 / Actual 막대: primary 톤 옅은 색 (좌우 나란히)

**Y축 자동 스케일링**: Recharts 기본 동작이 자동이지만, 명시적으로 `domain={['auto', 'auto']}` + `allowDecimals={false}` 적용하여 정수 단위로 깔끔하게 표시.

---

## 2. All Stage 모드 — 누적 Stacked Bar

Stage = All일 때 일자별 Plan 막대는 **하나의 막대 안에 3개 스테이지를 누적**하여 색상으로 구분:

```
   ┌─────┐
   │ Cl  │  ← Closure Plan (에메랄드)
   │─────│
   │ Cmp │  ← Completion Plan (황색)
   │─────│
   │ Str │  ← Start Plan (파랑)
   └─────┘
   2026-04-25
```

- 각 버킷마다: `planned_start_date == bucket` 건수 + `planned_completion_date == bucket` 건수 + `planned_closure_date == bucket` 건수를 누적.
- 막대 총 높이 = "그날 발생할 모든 액션의 총 물량" → 일별 작업 부하 가시화.
- Recharts `<Bar dataKey="planStart" stackId="plan" />`, `<Bar dataKey="planCompletion" stackId="plan" />`, `<Bar dataKey="planClosure" stackId="plan" />` 사용.

**Actual 막대도 동일하게 stacked**: 별도 stackId="actual"로 옆에 나란히 배치 (`barCategoryGap` 조정).

**누적 라인**도 3개 스테이지 모두 표시 (지난 turn에서 합의한 색상 체계):

| Stage      | 누적 Plan 라인 | 누적 Actual 라인 | Stacked 막대 색 |
|------------|----------------|------------------|-----------------|
| Start      | 회색 점선      | 파란색 실선      | 옅은 파랑       |
| Completion | 회색 점선      | 황색 실선        | 옅은 황색       |
| Closure    | 회색 점선      | 에메랄드 실선    | 옅은 에메랄드   |

All 모드 규칙:
- **Group 분해 자동 비활성화** (`None` 강제) — 시리즈 폭증 방지. 안내 문구 표시.
- **Variance 서브차트**: 스테이지별 3개 색상 막대를 버킷마다 그룹 표시.
- **KPI 스트립**: Start / Completion / Closure 3개 미니 타일 (누적 Plan, 누적 Actual, Δ%).
- **버킷 클릭 드릴다운**: `planned_completion_date` 기준으로 Raw Data 이동.

---

## 3. Group 필터 → 토글 버튼

`<Select>` 드롭다운(307–317행)을 `<ToggleGroup type="single">`로 교체:
- 버튼: `None` · `Team` · `Subcontractor` · `Sub-Sub` · `HDEC PIC` · `HDEC ENG` · `Level` · `Main Trade` · `Sub Trade` · `Work Type`
- 스타일은 기존 Stage 토글과 동일 (`h-8 px-2 text-xs data-[state=on]:bg-primary`)
- `flex-wrap`으로 줄바꿈 자동 처리

---

## 4. Stage 필터 — "All" 추가

`Start | Comp | Close | All` 4개 토글. URL `stage_view` 파라미터에 `all` 값 추가 (기본값 `completion` 유지).

---

## 5. Y축 자동 스케일링

모든 차트 (메인 누적 라인, 일자별 막대, Variance)에 다음 적용:
- `domain={['auto', 'auto']}` — Recharts가 데이터 Max 기준 자동 스케일
- `allowDecimals={false}` — 정수 카운트라 소수점 제거
- `tickCount={6}` — 적절한 눈금 개수
- Variance 차트는 0을 중심으로 대칭 표시 (`domain={[(min) => Math.floor(min*1.1), (max) => Math.ceil(max*1.1)]}`)

---

## 기술 변경 사항

### `src/lib/defect-dashboard-utils.ts`
- 신규 함수 `buildDefectSCurveAllStages(items, options)` 추가:
  ```ts
  {
    buckets: string[];
    bucketLabels: string[];
    todayIndex: number;
    byStage: Record<DefectScheduleStage, DefectSCurveSeries>;
  }
  ```
  내부적으로 기존 `buildDefectSCurve`를 3개 스테이지에 대해 호출.
- 단일 스테이지용 `buildDefectSCurve` 시그니처 변경 없음.

### `src/pages/DefectDashboardPage.tsx`
- Group `<Select>` (307–317행) → `<ToggleGroup>` 교체.
- Stage `<ToggleGroup>` (299행)에 `'all'` 옵션 추가.
- `scurveStage === 'all'`일 때 `groupBy = null` 강제 + `SCurveChartsAllStages` 렌더링.
- `SCurveCharts` 업데이트 (782–906행):
  - 우측 Y축 `<YAxis yAxisId="bar" orientation="right" allowDecimals={false} />` 추가.
  - `<Bar dataKey="planInc" />`, `<Bar dataKey="actualInc" />` 2개 추가 (라인보다 먼저 JSX 배치).
  - `data.map`에서 이전 행과의 차이로 `planInc`, `actualInc` 계산.
- 신규 `SCurveChartsAllStages` 컴포넌트:
  - 데이터: `{ bucketLabel, planStart, planCompletion, planClosure, actualStart, actualCompletion, actualClosure, cumPlan_*, cumActual_* }`.
  - Stacked Bar (`stackId="plan"`) 3개 + Stacked Bar (`stackId="actual"`) 3개 (좌우 나란히).
  - 누적 라인 6개 (Plan 점선 3 + Actual 실선 3).
  - Variance 서브차트는 스테이지별 3색 막대 그룹.

---

## 범위 제외

- Progress 페이지 / T&C 대시보드는 변경 없음 (Defect Dashboard 한정).

---

## 수정 파일

- `src/lib/defect-dashboard-utils.ts`
- `src/pages/DefectDashboardPage.tsx`
