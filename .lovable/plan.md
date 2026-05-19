# Remaining 모드 누계 차트 베이스라인 보정

## 문제 진단

현재 `buildSCurve` (src/lib/dashboard-utils.ts L270~)에서 `planMode === 'remaining'`일 때:

- 일일 Plan 막대: 이미 완료된 항목은 제외 → 의도대로 동작
- **누계 Plan 곡선**: 동일 로직을 그대로 적용해 "이미 완료된 항목의 원래 계획"까지 통째로 제외 → 그래서 곡선이 0에서 출발하고 미래 잔여분만 누적

사용자 기대치: Remaining 모드의 누계 Plan은 **"오늘까지 실적 + 오늘 이후 잔여 계획"** 으로 Actual 위에 얹혀서 이어져야 함 (즉, 오늘 시점에 Plan 누계 ≥ Actual 누계가 보장).

## 수정 방안

`buildSCurve` 내부에서 `planMode === 'remaining'`인 경우 Plan 카운트 규칙을 다음과 같이 변경:

1. **이미 done (actual ≤ asOf)인 항목**: 그 항목의 `actual` 날짜 버킷에 Plan +1 로 계상
   - → asOf 이전 구간에서 Plan 곡선이 Actual 곡선과 정확히 겹침
2. **아직 미완료인 항목**: 기존대로 `planned` 날짜 버킷에 Plan +1
   - → asOf 이후 구간에서 잔여 계획이 위로 쌓임

결과적으로 Remaining 모드 누계 Plan = `cumActual(asOf) + 잔여 계획(b ≤ 버킷)`이 되어 0에서 시작하는 문제 해소. Baseline 모드는 현행 유지.

## 적용 범위 (src/lib/dashboard-utils.ts only)

`buildSCurve` 의 T1·T2·R2S 세 시리즈 Plan 누적 로직 한 블록에만 적용. 일일 Plan 막대(`t1FuturePlan` 등) 및 Actual 처리, `aggregatePlanActualByGroup` 의 Plan vs Actual 표 계산은 손대지 않음.

## 영향 화면

- TncSimulationPage / DashboardPage S-curve
- PPT 4번 슬라이드 (report-builder → ppt-builder가 동일 SCurvePoint 사용)
  - Test Report·Plan 시리즈는 R2S Plan 기반이므로 동일하게 베이스라인 보정 효과 받음

## 검증

- Baseline ↔ Remaining 토글 시 누계 곡선이 의도대로 변하는지 시각 확인
- 오늘 시점 Plan 누계 ≥ Actual 누계 확인
- 기존 baseline 모드 회귀 없음 확인 (build + 화면 비교)
