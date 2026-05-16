## 목표

`src/lib/report-builder.ts`를 수정해 Claude가 PPT 생성 시 추가 계산 없이 JSON만으로 슬라이드를 만들 수 있도록 모든 파생 수치를 미리 계산해 포함시킵니다. 마크다운 출력과 다른 모듈(defect/docs/punch)은 건드리지 않습니다.

## 변경 사항

### 1) `ReportMeta`에 `daysToCompletion` 추가
- 인터페이스에 `daysToCompletion: number` 필드 추가
- `buildReport()`에서 meta 생성 시 다음으로 계산:
  ```ts
  daysToCompletion: Math.ceil((+new Date(opts.mcDate ?? MC_DEFAULT) - Date.now()) / 86400000)
  ```

### 2) `TncReportData.currentActual` 추가
새 인터페이스:
```ts
interface TncCurrentActual {
  preTestPct: number;
  officialTestPct: number;
  testReportPct: number;
  preTestVariancePct: number;
  officialTestVariancePct: number;
  testReportVariancePct: number;
}
```
`computeTncData()`에서 totals/planned 계산 직후 모두 소수점 1자리로 반올림해 `data.currentActual`에 저장. `total === 0`일 때는 0으로 처리.

### 3) `requiredPace.preTestPerDay` 추가
- `TncReportData.requiredPace` 타입에 `preTestPerDay: number`, `t1Remaining: number` 추가
- `computeTncData()`의 simulation 분기에서:
  ```ts
  t1Remaining: total - t1,
  preTestPerDay: +((total - t1) / days).toFixed(2),
  ```

### 4) `SimStageSnapshot`에 `planPct`, `gapPct` 추가
- 인터페이스에 `planPct: number; gapPct: number` 추가
- `toSimSnap()` 시그니처 변경: 인자 타입에 `planPct: number` 포함, 반환 객체에 `planPct: r.planPct`, `gapPct: +(r.predictedPct - r.planPct).toFixed(1)` 추가
- `StageSimResult`에 이미 `planPct`가 있으므로 호출부 수정 불필요 (T&C 및 Defect snapshot 모두 동일 함수 사용 → defect snapshot에도 자동 포함됨; 타입만 공유되며 마크다운 렌더링에는 영향 없음)

### 5) `TncReportData.scurve` 추가
새 타입:
```ts
scurve?: Array<{
  date: string;
  t1PlanPct: number;
  t1ActualPct: number | null;
  t2PlanPct: number;
  t2ActualPct: number | null;
  r2sPlanPct: number;
  r2sActualPct: number | null;
}>;
```
- `computeTncData()`에 신규 헬퍼 `buildTncScurveDaily(rows, dataDate)` 추가:
  - 범위: `dataDate - 35일` ~ `dataDate + 21일`, 1일 간격
  - 각 날짜 `d`에 대해 누적 카운트:
    - planned: `*_planned_date <= d` (r2s는 `r2_target_submission_date`)
    - actual: `*_actual_date <= d` (r2s는 `r2_actual_submission_date`)
  - % = (count / total) * 100, 소수점 1자리
  - `d > dataDate`이면 actual 3개 모두 `null`
- 모듈 처리 후 `data.scurve = buildTncScurveDaily(rows, dataDate)`

### 6) `TncReportData.actionPlanTriggers` 추가
```ts
actionPlanTriggers?: Array<{
  stage: 'preTest' | 'officialTest' | 'testReport';
  status: 'CRITICAL' | 'AT_RISK';
  actualPct: number;
  reason: string;
}>;
```
- `currentActual` 계산 직후 평가:
  - 각 stage(`preTest`/`officialTest`/`testReport`)에 대해 `actualPct`와 `variancePct` 사용
  - `actualPct < 1.0` → status `CRITICAL`, reason `'${label} has not started'`
  - 아니고 `variancePct < -20` → status `AT_RISK`, reason `'${label} is behind plan by ${Math.abs(variancePct).toFixed(1)}%'`
  - 그 외는 배열에서 제외
  - label은 사람이 읽는 이름: `Pre-Test` / `Official Test` / `Test Report`

## 기술 세부

- 모든 신규 % 값은 `+x.toFixed(1)` (숫자로 유지)
- per-day 값은 `+x.toFixed(2)`
- 마크다운 렌더러(`renderTncMd`)는 변경하지 않음 — JSON 전용 확장
- defect/docs/punch 로직 및 타입은 (4)의 `SimStageSnapshot` 공유 외에는 변경 없음
- 신규 타입은 모두 `export` 유지하여 ReportTab/JSON 다운로드와 호환

## 변경 파일

- `src/lib/report-builder.ts` (단일 파일)
