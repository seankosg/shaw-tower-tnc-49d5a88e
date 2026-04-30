# S-Curve Y축 시인성 개선 — 윈도우 외 데이터 완전 제외

## 문제
선택한 기간(예: 2026-04-15 이후) 외부에 누적된 Plan/Actual 데이터가 라인의 시작값으로 더해져서, 좌측 Y축이 0이 아닌 큰 값에서 시작합니다. 결과적으로 윈도우 내 증감이 시각적으로 평탄해 보이고 시인성이 낮습니다.

## 해결 방향
**윈도우 외 데이터를 차트에서 완전히 제외**합니다. 베이스라인 점선/레퍼런스 라인 같은 보조 표시는 추가하지 않습니다 (앞선 제안 철회).

- 누적 라인은 선택한 시작일에 0부터 출발
- 막대는 이미 윈도우 내 증분만 표시하므로 변경 없음
- Y축 최대값이 윈도우 내 실제 누적량까지만 올라가서 시인성 향상

## 변경 파일

### `src/lib/defect-dashboard-utils.ts`
- `seriesCountsAggregator`의 반환에서 `pre` 누적값을 **항상 0으로 강제**합니다. (즉, `firstBucket` 이전 데이터는 집계에서 버림)
- `buildDefectSCurve` 내 Total/Per-group/Others 시리즈 생성부의 `cumP`, `cumA` 초기값이 자연스럽게 0이 됩니다.
- `buildDefectSCurveAllStages`는 내부적으로 `buildDefectSCurve`를 호출하므로 별도 수정 불필요.

### `src/pages/DefectDashboardPage.tsx`
- 변경 없음 (ReferenceLine, baseline KPI 등 추가 작업 없음).

## 기대 결과
- 4월 15일을 시작일로 선택하면 Plan/Actual 라인 모두 4월 15일에 0에서 시작
- Y축 최대값은 윈도우 내 누적량까지만 자라므로, 일별 막대와 라인 변화가 명확히 보임
- KPI 스트립의 Plan/Actual/Variance 수치도 윈도우 기준으로 일관됨

## 기술 메모
`seriesCountsAggregator` 함수에서 다음 부분만 수정:
```ts
if (firstBucket && b < firstBucket) {
  // 이전: preP += v.p; preA += v.a;
  // 변경: 무시 (continue)
  continue;
}
```
나머지 누적 로직은 그대로 유지.