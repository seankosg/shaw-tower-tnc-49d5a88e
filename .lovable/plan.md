## 증상 요약

S-Curve 차트에서 Group=Subcontractor, Subcontractor Values=Finebuild (1개 선택) 상황:

- KPI 카드는 정상: Plan(cum)=26, Actual(cum)=21
- **상단 누적 라인 차트의 Y축이 0~600** 으로 잡혀, 실제 값(21~26)인 라인이 X축 바로 위에 깔려 보이지 않음
- 하단 variance 막대 차트는 -12 ~ +4 범위로 정상 표시
- 범례에 Finebuild Plan / Finebuild Actual 만 정상 표시

## 근본 원인

`src/pages/DefectDashboardPage.tsx` 의 차트 데이터(`data` 배열, 958~980줄)에 **Subcontractor 필터링과 무관한 Total 누적값(`totalPlan`, `totalActual`)이 항상 함께 들어갑니다**. 

Recharts 의 `<YAxis domain={['auto', 'auto']}>` 는 **현재 ComposedChart 의 자식 컴포넌트가 dataKey 로 참조하는 모든 값**을 보고 도메인을 계산합니다. 그룹 모드(`showGroups=true`)에서는 화면에 `<Line dataKey="g_plan_Finebuild">` 만 그려지지만, **`<Bar dataKey="variance">` 가 같은 데이터 row 의 variance 필드를 참조**하고 있어 (실제로는 하단 별도 차트지만 Recharts 내부 계산상) 또는 더 정확히는 **누적 차트의 일부 Bar/Line 정의에 hide 된 필드들이 여전히 도메인 계산에 포함**되고 있습니다.

추가로, `seriesCountsAggregator` (`src/lib/defect-dashboard-utils.ts` 330~349줄)가 첫 bucket 이전 데이터를 제외하긴 하지만, **window 내부에 있는 다른 Subcontractor 들의 데이터가 `TOTAL_KEY` 시리즈에는 여전히 포함**되어 `totalPlan` 값이 600 가까이 올라갑니다 (전체 활성 defect 수가 그 정도 규모).

요컨대: **그룹 모드에서 화면에는 Finebuild 만 그려지지만, 차트 데이터 row 의 `totalPlan` 필드는 여전히 전체(필터 전) 합계가 들어가 Y축 자동 도메인을 부풀립니다.**

## 수정 계획

### 1. `buildDefectSCurve()` 의 Total 시리즈 정의 변경

`scurveItems` 가 이미 협력사로 필터링되어 들어오므로, **그룹 모드일 때 `totalSeries` 를 별도로 만들 필요가 없습니다**. 그대로 두면 그룹 모드에서 totalSeries 와 그룹 시리즈가 사실상 같은 값이 되어 redundancy 만 발생.

수정: `buildDefectSCurve` 가 `groupBy != null` 인 경우 `totalSeries` 를 빈 plan/actual 배열로 반환하거나, 페이지에서 그룹 모드일 때 `data` row 에 `totalPlan` / `totalActual` 필드를 **아예 넣지 않도록** 변경.

### 2. 차트 데이터 빌드(`SCurveSinglePanel`, 958~980줄) 수정

```typescript
const data = scurve.bucketLabels.map((label, i) => {
  const row: Record<string, any> = {
    bucket: scurve.buckets[i],
    bucketLabel: label,
    __isFuture: scurve.todayIndex >= 0 && i > scurve.todayIndex,
  };
  if (!showGroups) {
    // Total/non-grouped 모드에서만 total 필드 포함
    row.totalPlan = scurve.total.plan[i];
    row.totalActual = scurve.total.actual[i];
    row.variance = scurve.total.variance[i];
    row.planInc = ...;
    row.actualInc = ...;
  } else {
    // 그룹 모드: variance 막대용 데이터를 그룹 시리즈 합계로 재계산
    const planSum = scurve.groups.reduce((s, g) => s + (g.plan[i] ?? 0), 0);
    const actualSum = scurve.groups.reduce((s, g) => s + (g.actual[i] ?? 0), 0);
    row.variance = (actualSum - planSum);
  }
  scurve.groups.forEach((g) => {
    row[`g_plan_${g.key}`] = g.plan[i];
    row[`g_actual_${g.key}`] = g.actual[i];
  });
  return row;
});
```

이렇게 하면 그룹 모드에서 Y축 도메인은 **선택된 Subcontractor 들의 누적값(0~26)** 만 보고 자동 계산되어 라인이 정상 크기로 표시됩니다.

### 3. 검증

- Subcontractor=Finebuild 선택 시 Y축이 0~30 정도로 잡혀 라인이 잘 보이는지 확인
- 여러 Subcontractor 다중 선택 시 각 라인이 비례적으로 표시되는지 확인
- Group=None 으로 되돌릴 때 기존 Total 차트가 여전히 정상인지 확인
- variance 막대 차트의 값이 합리적으로 표시되는지 확인 (그룹 모드에선 선택된 그룹 합산 기준)

## 변경 파일

- `src/pages/DefectDashboardPage.tsx` — `SCurveSinglePanel` 의 `data` 빌드 로직 (958~980줄)

## 위험 / 가정

- variance 차트는 그룹 모드에선 "선택된 그룹들의 합산 variance" 를 보여주게 됩니다. 이는 의미상 합리적이며, KPI 카드의 ΔVariance(-5)와 일치할 것입니다.
- KPI 카드는 별도로 `scurve.total` 을 읽고 있으므로(916줄) 영향 없습니다 — `total` 은 builder 내부에서 여전히 `scurveItems` 기준으로 계산되며 21/26 값을 그대로 반환합니다.
