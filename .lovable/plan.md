## 배경

T&C 대시보드 "계획 및 실적" 표 — Data Date / Today 섹션의 8개 숫자 셀(stage별 Plan / Actual / Δ / Delay) 모두 클릭 시 SubtestList(`/tc/raw-data`)로 이동해 해당 항목들을 보여줘야 합니다.

코드 검토 결과:
- **Plan / Actual / Delay** 셀은 이미 클릭 핸들러가 연결되어 있고, SubtestList에 대응하는 URL 필터(`*_planned_on`, `*_actual_on`, `*_delay_on`)도 구현되어 있어 라우팅이 정상 동작해야 합니다.
- **Δ 셀** (Data Date Δ line 1071, Today Δ line 1084) 은 클릭 불가능한 `VarianceCell`로 렌더되어 클릭이 아예 안 됩니다.

사용자 진술 "현재는 Delay만 가능"은 (a) Δ 셀이 실제로 클릭 안 되는 점 (b) Plan/Actual 셀의 어포던스가 약하거나 일부 케이스에서 동작 안 하는 점 — 둘 다를 가리킬 수 있습니다. 본 plan은 둘 다 해결합니다.

## 변경 내용

### 1. Δ 셀 라우팅 (`src/pages/DashboardPage.tsx`)

사용자 결정대로 **Δ 부호에 따라 다른 목록**으로 이동:
- `Δ < 0` (부족): "그 일자에 plan AND not done" → 기존 `<stage>_delay_on` 파라미터 (Delay 셀과 동일 결과).
- `Δ > 0` (초과): "그 일자에 actual AND 그 일자 plan 아님" → 신규 `<stage>_actual_unplanned_on` 파라미터.
- `Δ = 0`: 클릭 비활성 (텍스트 렌더).

`StageDef`에 `actualUnplannedOn?: string` 필드 추가 → pred/t1/t2 정의에 각각 `pred_actual_unplanned_on`, `t1_actual_unplanned_on`, `t2_actual_unplanned_on` 매핑.

Data Date Δ 셀:
```tsx
<ClickVariance
  value={dataDateD}
  onClick={
    dataDateD < 0 && st.delayOn
      ? () => go(r.key, { [st.delayOn!]: dataDate })
      : dataDateD > 0 && st.actualUnplannedOn
        ? () => go(r.key, { [st.actualUnplannedOn!]: dataDate })
        : undefined
  }
/>
```

Today Δ 셀: 동일 패턴, `dataDate` → `today`.

### 2. SubtestList 신규 필터 (`src/pages/SubtestList.tsx`)

세 개의 신규 URL 파라미터를 처리:
- `pred_actual_unplanned_on`
- `t1_actual_unplanned_on`
- `t2_actual_unplanned_on`

필터 로직 (기존 `urlT1ActualOn` 처리 라인 부근에 추가):
```ts
if (urlPredActualUnplannedOn && !(r.pred_actual_date === urlPredActualUnplannedOn && r.pred_planned_date !== urlPredActualUnplannedOn)) return false;
if (urlT1ActualUnplannedOn  && !(r.t1_actual_date  === urlT1ActualUnplannedOn  && r.t1_planned_date  !== urlT1ActualUnplannedOn))  return false;
if (urlT2ActualUnplannedOn  && !(r.t2_actual_date  === urlT2ActualUnplannedOn  && r.t2_planned_date  !== urlT2ActualUnplannedOn))  return false;
```

### 3. Plan / Actual 셀 동작 보장

기존 핸들러는 그대로 유지(`<stage>_planned_on=<date>` / `<stage>_actual_on=<date>`로 이동). 추가로:

- `ClickNum`의 시각적 어포던스 강화: 0이 아닌 값에 옅은 underline 힌트 추가하여 클릭 가능함을 명확히 표시 (hover 시 underline은 그대로). 0 값은 muted 유지.

```tsx
className={cn(
  'tabular-nums',
  zeroClass,
  onClick && value !== 0 && 'underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-foreground'
)}
```

- 그룹화가 `none` 등일 때 `keyToFilterValue` 처리가 빠지지 않는지 spot check (현재 코드는 `value && value !== NONE_LABEL`일 때만 `groupParam`을 추가하므로 안전).

### 4. 비변경 사항

- 헤더 합계, 정렬, 다른 KpiCard는 변경 없음.
- Cumulative 섹션의 Plan/Actual/Δ 셀(이미 클릭 가능)은 변경 없음.
- `defect-dashboard`는 사용자가 요청하지 않았으므로 변경 없음.

## 영향 받는 파일

- `src/pages/DashboardPage.tsx` — Data Date Δ / Today Δ 셀을 `ClickVariance`로 교체, `StageDef.actualUnplannedOn` 필드 추가, `ClickNum` 어포던스 개선
- `src/pages/SubtestList.tsx` — `*_actual_unplanned_on` 3개 URL 파라미터 처리

## 검증

- `bunx vitest run` 통과
- 표의 8개 셀(Plan/Actual/Δ/Delay × Data Date/Today) 모두 클릭 시 SubtestList로 이동하고 해당 행이 필터되어 표시
- Δ 음수 클릭 = Delay 클릭과 동일 결과
- Δ 양수 클릭 = 그 일자 actual인데 그 일자 plan은 아니었던 항목만 표시
- Δ = 0 셀은 클릭 비활성

## 후속 확인 (사용자에게)

만약 위 변경 적용 후에도 특정 셀이 클릭되지 않는다면, 어떤 stage / 어떤 그룹화(System/Team/Subcontractor 등)에서 발생하는지 알려주시면 `go` 함수의 라우팅을 추가 점검하겠습니다.
