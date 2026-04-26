## 배경

T&C 대시보드에 적용한 변경(모든 Data Date / Today 셀 클릭 가능, Δ 부호별 라우팅, 클릭 어포던스 강화)을 Defect Management 대시보드에도 동일하게 적용합니다.

현재 Defect Dashboard 상태 (`src/pages/DefectDashboardPage.tsx`):
- **Plan / Actual / Delay** 셀: 이미 클릭 가능 (각각 `dateField+dateStart+dateEnd`, `dateField+dateStart+dateEnd+doneParam`, `dueOn+stage` 라우팅).
- **Δ 셀** (Data Date Δ line 516, Today Δ line 530): `VarianceCell`로 클릭 불가.
- 누적(To Data Date) Δ (line 505)는 사용자 요청 범위가 아니므로 변경 안 함.

## 변경 내용

### 1. DefectRawDataPage 신규 필터 (`src/pages/DefectRawDataPage.tsx`)

신규 URL 파라미터 `unplannedActualOn` (+ 기존 `stage` 파라미터 재사용):
- 의미: "해당 stage의 `actual_<stage>_date == unplannedActualOn` AND `planned_<stage>_date != unplannedActualOn`" (그 날 실적은 났는데 그 날 계획에는 없던 항목 = 미계획 실적/조기 완료).
- `start` / `completion` / `closure` stage 모두 처리. stage 미지정 시 어느 stage든 매칭.

기존 `dueOn` 처리 블록 옆에 추가:
```ts
const unplannedActualOn = searchParams.get('unplannedActualOn');
if (unplannedActualOn) {
  const stage = searchParams.get('stage');
  next = next.filter((item) => {
    if (stage === 'start') return item.actual_start_date === unplannedActualOn && item.planned_start_date !== unplannedActualOn;
    if (stage === 'completion') return item.actual_completion_date === unplannedActualOn && item.planned_completion_date !== unplannedActualOn;
    if (stage === 'closure') return item.actual_closure_date === unplannedActualOn && item.planned_closure_date !== unplannedActualOn;
    return (
      (item.actual_start_date === unplannedActualOn && item.planned_start_date !== unplannedActualOn) ||
      (item.actual_completion_date === unplannedActualOn && item.planned_completion_date !== unplannedActualOn) ||
      (item.actual_closure_date === unplannedActualOn && item.planned_closure_date !== unplannedActualOn)
    );
  });
}
```

활성 필터 칩 표시 추가:
```ts
const unplannedActualOn = searchParams.get('unplannedActualOn');
if (unplannedActualOn) {
  const stage = searchParams.get('stage');
  const stageLabel = stage === 'completion' ? 'Completion' : stage === 'closure' ? 'Closure' : stage === 'start' ? 'Start' : 'Stage';
  out.push({ label: `${stageLabel} actual ${unplannedActualOn} (unplanned)`, param: 'unplannedActualOn', clears: ['unplannedActualOn', 'stage'] });
}
```

### 2. Defect Dashboard Δ 셀 변경 (`src/pages/DefectDashboardPage.tsx`)

신규 `ClickVariance` 컴포넌트 (T&C 대시보드와 동일 패턴, `invert` 지원):
```tsx
function ClickVariance({ value, invert = false, onClick }: { value: number; invert?: boolean; onClick?: () => void }) {
  if (!onClick) return <VarianceCell value={value} invert={invert} />;
  return (
    <button type="button" className="hover:underline" onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <VarianceCell value={value} invert={invert} />
    </button>
  );
}
```

Data Date Δ 셀 (line 516):
```tsx
<TableCell className="px-2 py-1.5 text-right text-xs">
  <ClickVariance
    value={dataDateDelta}
    invert={isDiff}
    onClick={
      isDiff
        ? rowClick
        : dataDateDelta < 0
          ? () => go(row.key, { dueOn: dataDate, stage: stage.stage })
          : dataDateDelta > 0
            ? () => go(row.key, { unplannedActualOn: dataDate, stage: stage.stage })
            : undefined
    }
  />
</TableCell>
```

Today Δ 셀 (line 530): 동일 패턴, `dataDate` → `today`.

`isDiff`(Difference 행)는 `invert=true`이며 의미가 다르므로(`positiveBad`) `rowClick` fallback 유지 → 일관성 보존.

### 3. Plan / Actual / Delay 셀 어포던스 강화

`ClickNum`에 점선 underline 어포던스 추가 (T&C와 동일):
```tsx
className={cn(
  'tabular-nums hover:underline',
  value === 0 && 'text-muted-foreground/40',
  value !== 0 && 'underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-foreground'
)}
```

Plan/Actual/Delay 셀의 라우팅 로직은 변경 없음 (이미 동작 중).

### 4. 비변경 사항

- 누적(To Data Date) Δ 셀 — 사용자 요청 범위 아님.
- `defect-dashboard-utils.ts` 집계 로직 — 변경 없음.
- KpiCard, AlertBanner, Top 10 Overdue 등 표 외 영역 — 변경 없음.

## 영향 받는 파일

- `src/pages/DefectRawDataPage.tsx` — `unplannedActualOn` 필터 처리 + 활성 칩 라벨
- `src/pages/DefectDashboardPage.tsx` — `ClickVariance` 컴포넌트 추가, Data Date / Today Δ 셀 교체, `ClickNum` 어포던스 강화

## 검증

- `bunx vitest run` 통과
- `bunx tsc --noEmit` 통과
- Defect Dashboard 표의 모든 Data Date / Today 셀 클릭 시 DefectRawData 페이지로 이동하고 해당 행만 표시되는지 확인
- Δ 음수 셀 클릭 = Delay 셀 클릭과 동일 결과
- Δ 양수 셀 클릭 = 그 일자 actual인데 그 일자 plan 아닌 항목만 표시
- Difference 행은 `rowClick` fallback (기존 동작 유지)
