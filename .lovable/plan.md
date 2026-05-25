## 목표
슬라이드 4 (T&C · TEST EXECUTION) S-Curve 차트에 `Test Report · Actual` 라인을 추가하여 Pre-Test, Official Test와 동일하게 Plan/Actual 두 시리즈 모두 표시.

## 변경 사항 (`src/lib/ppt-builder.ts`)

### 1. chartData 배열 (L617–623)
`Test Report · Plan` 다음에 Actual 항목 추가:

```ts
{ name: 'Test Report · Actual', labels: cats, values: pts.map(p => p.r2sActualPct) },
```

`r2sActualPct`는 `number | null` 타입이므로 pptxgenjs가 받을 수 있도록 그대로 전달 (다른 Actual 시리즈와 동일 패턴).

### 2. chartColors 배열 (L628)
Test Report 색상(`C.stageTestReport`)을 한 번 더 추가하여 6개 시리즈 색상 정렬 맞춤:

```ts
chartColors: [C.stagePreTest, C.stagePreTest, C.stageOfficial, C.stageOfficial, C.stageTestReport, C.stageTestReport],
```

### 3. 끝점 라벨 추가 (L644–654)
`lastT1`, `lastT2` 추적 로직과 동일하게 `lastR2` 추적 추가:

- `pts.forEach`에서 `p.r2sActualPct != null`일 때 `lastR2` 갱신
- `yR2 = PLOT_T + (1 - lastR2 / 100) * PLOT_H` 계산
- `addText`로 Test Report Actual 끝점 % 라벨을 `C.stageTestReport` 색으로 표기

### 4. Variance 주석 (L658–667)
기존 Pre-Test / Official 패턴을 따라 `tncKPI.testReport.variance`가 양수이면 ▲ 라벨 추가 (음수이거나 0이면 생략 — 현재 로직과 일관성 유지).

### 5. 헤드라인 기본값 (L610–613)
기존 "reports have not started" 가정은 더 이상 유효하지 않으므로, Actual이 0%일 때와 진행 중일 때를 구분하는 문구로 보정 (override가 없는 경우에만 영향):

```ts
const headlineDefault = tncKPI.testReport.pct < 1
  ? `Tests ahead — Test Report not yet started.`
  : `Plan vs Actual across all three streams.`;
```

## 영향 범위
- 슬라이드 4만 수정. 다른 슬라이드(2, 5 등)는 변경 없음.
- `report-builder.ts`의 `r2sActualPct` 필드는 이미 계산되어 있으므로 데이터 파이프라인 변경 불필요.
- text-token-registry는 시리즈 이름이 동적 라벨이라 영향 없음.

## 검증
- preview에서 슬라이드 4 PPT 재생성 → Test Report 색상 라인이 Plan/Actual 두 가닥으로 나타나는지 확인.
- Actual 끝점 % 라벨이 차트 우측에 표시되는지 확인.
