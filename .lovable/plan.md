## 목표
대시보드 **3단(Overdue / At-Risk Alert 배너)** 의 집계 범위를 현재의 **Pred/T1/T2** 에서 **5단계 전체(Pred/T1/T2/R1/R2)** 로 변경합니다. **1단의 Overdue KPI 카드는 기존(Pred/T1/T2) 그대로 유지**하여 두 카드가 별개의 의미를 가지도록 분리합니다.

## 변경 사항

### 1) `src/lib/dashboard-utils.ts` — 5단계 헬퍼 추가
기존 `isOverdue`/`isAtRisk`(Pred/T1/T2 전용)는 그대로 두고, 별도로 추가:

```ts
const ALL_STAGES: StageKey[] = ['pred','t1','t2','r1','r2'];

export function isOverdueAllStages(s, asOfDate) {
  return ALL_STAGES.some(stage => isStageDelayedAsOf(s, stage, asOfDate));
}

export function isAtRiskAllStages(s, today, thresholdDays) {
  if (isOverdueAllStages(s, today)) return false;
  const within = (stage) => {
    const planned = getStagePlannedDate(s, stage);
    if (!planned || isStageDone(s, stage)) return false;
    const d = daysBetween(today, planned);
    return d >= 0 && d <= thresholdDays;
  };
  return ALL_STAGES.some(within);
}
```

### 2) `src/pages/DashboardPage.tsx` — KPI & 배너
- `kpis` useMemo에 다음 두 값 추가:
  ```ts
  const overdueCountAll = filteredSubtests.filter(s => isOverdueAllStages(s, dataDate)).length;
  const atRiskCountAll  = filteredSubtests.filter(s => isAtRiskAllStages(s, today, atRiskDays)).length;
  ```
- **1단 Overdue KPI 카드**: 그대로 `kpis.overdueCount` (Pred/T1/T2) 유지
- **3단 AlertBanner**:
  - Overdue 배너 → `kpis.overdueCountAll` 사용, `goSubtests({ status:'overdue', as_of: dataDate, scope:'all' })`
  - At-Risk 배너 → `kpis.atRiskCountAll` 사용, `goSubtests({ status:'at_risk', at_risk_days:String(atRiskDays), scope:'all' })`
  - description 문구에 "across all 5 stages (Pred/T1/T2/R1/R2)" 같은 보조 설명 추가

### 3) `src/pages/SubtestList.tsx` — `scope=all` URL 파라미터 지원
- `urlScope = searchParams.get('scope')` 추가
- 기존 하드코딩 `OVERDUE_STAGES = ['pred','t1','t2']` 를 동적으로:
  ```ts
  const OVERDUE_STAGES: StageKey[] = urlScope === 'all'
    ? ['pred','t1','t2','r1','r2']
    : ['pred','t1','t2'];
  ```
- `at_risk` 필터 내부의 `within` 검사도 동일 배열 사용 (이미 같은 변수 참조 중)
- `renderRowBgClass` 의 `getAnyStageDelayedAsOf(r, ['pred','t1','t2'], …)` 도 동일 동적 배열 사용
- 칩 라벨: `scope=all` 인 경우 "Overdue (all stages)" / "At-Risk (all stages)" 표시 (선택적, UX 일관성)
- `status` 칩 제거 시 `scope` 파라미터도 함께 제거 (cleanup)

## 동작 결과

| 위치 | 범위 | 의미 |
|---|---|---|
| **1단 Overdue KPI** | Pred / T1 / T2 | 실제 테스트 수행 지연만 (기존 유지) |
| **3단 Overdue 배너** | **Pred / T1 / T2 / R1 / R2** | 보고서 단계 포함 전체 워크플로 지연 |
| **3단 At-Risk 배너** | **Pred / T1 / T2 / R1 / R2** | 전체 워크플로 임박 건 |

두 Overdue 카드의 숫자가 서로 다를 수 있으며, 차이값은 곧 **R1/R2 단계의 지연/임박 건수**가 됩니다.

## 영향 없음
- 2단 Stage Cards (각 단계별 overdue) — 본인 기준 그대로
- Plan vs Actual 표, S-Curve, Top 10 Overdue, Status Distribution
- `status=remaining`, 기타 cell-link 필터들
