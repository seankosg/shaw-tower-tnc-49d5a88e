## 배경

현재 슬라이드 4 S-Curve의 `Test Report · Plan` 시리즈(`src/lib/ppt-builder.ts` L622, L627-633)는 Raw Data를 사용하지 않고, "마지막 T1 Actual 시점 이후 0→100% 선형 보간"이라는 **임의의 placeholder**로 그려져 있습니다.

검증 결과 Raw Data(`subtests.r2_target_submission_date`)에는 전체 1,904개 subtest 모두에 R2S 일일계획 일자가 채워져 있으며(34개 distinct date, 2026-04-02 ~ 2026-06-13), Pre-Test/Official Test와 동일한 방식으로 누적 % 곡선을 산출할 수 있습니다.

## 변경 범위 (Frontend 데이터 파이프라인 + PPT 시리즈만 수정, 비즈니스 로직 변동 없음)

### 1. `src/lib/dashboard-utils.ts` — `buildSCurve` 확장

- 카운터에 `r2p`(R2S Plan), `r2a`(R2S Actual) 추가
- 루프 내부에서 `getStagePlannedDate(s, 'r2s')`, `getStageActualDate(s, 'r2s')`로 일자 추출 후 동일한 bucketize 로직 적용
- planMode/baseline 가드는 T2와 동일한 규칙(`isStageActualUpTo(s, 'r2s', asOf)`)으로 적용
- `SCurvePoint` 인터페이스에 `r2sPlanned: number`, `r2sActual: number | null` 추가 (기존 t1Met/t1FuturePlan 등 스택바 필드는 R2S용 추가 불필요 — 슬라이드 4·8 라인차트만 사용)
- 기존 호출부(Dashboard 등)는 새 필드를 사용하지 않으므로 영향 없음

### 2. `src/lib/report-builder.ts` — `TncScurvePoint` 확장

- 인터페이스(L80-87)에 `r2sPlanPct: number`, `r2sActualPct: number | null` 추가
- `scurve` 매핑부(L990-997)에서 `p.r2sPlanned`, `p.r2sActual`을 `tot`으로 나눠 백분율 계산 (T1·T2와 동일 패턴)

### 3. `src/lib/ppt-builder.ts` — 슬라이드 4 차트 시리즈 정정

- L622의 `values: pts.map(p => 0)` placeholder 제거 → `values: pts.map(p => p.r2sPlanPct)` 로 교체
- L625-633의 placeholder 보간 블록 전체 삭제
- (선택) Actual 시리즈가 차트에 추가되어 있지 않으므로 현재는 Plan만 반영. 사용자가 별도로 요청하지 않은 한 Actual 시리즈는 추가하지 않음

### 4. 슬라이드 8 (Defect/유사 차트) 확인

- 슬라이드 8은 `defect.scurve`(completionPlanPct/closurePlanPct) 기반이며 R2S와 무관함을 재확인. 본 작업 범위에서 제외

## 검증

- `npm run build`로 타입 변경 컴파일 확인
- 기존 T1/T2 Plan 곡선이 변하지 않았는지(누적 % 산출 로직은 그대로) 회귀 확인
- 생성된 PPT 슬라이드 4에서 Test Report · Plan 곡선이 0이 아닌 실제 R2S 일자 분포(5월 후반 급상승 피크 반영)로 그려지는지 시각 확인

## 비대상 (이번 계획에서 제외)

- 지시2(슬라이드 4·8 Excel 편집 실패)는 별도 후속 작업으로 분리. 사용자가 "R2S 일일계획 반영"만 요청했으므로 본 plan에서는 다루지 않음
