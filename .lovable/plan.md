# R1/R2 셀 → Raw-Data 필터 링크 연결

현재 Dashboard의 Plan vs Actual 테이블에서 R1/R2 행의 숫자(Plan/Actual/Δ/Delay)는 클릭해도 행 단위 그룹 필터(시스템/팀 등)만 적용되고, R1/R2의 **시점·상태 조건**은 raw-data로 전달되지 않습니다. 본 작업은 보고 누락(예: T2 Done인데 R1 미제출, R1은 했는데 R2 승인 지연)을 한 번의 클릭으로 식별할 수 있도록 양쪽을 연결합니다.

## 1. Dashboard 측 변경 — `src/pages/DashboardPage.tsx`

R1/R2 stages 정의에 누락된 URL 파라미터 키를 채워 넣습니다 (Pred/T1/T2와 동일한 7개 키):

| 파라미터 | 의미 |
|---|---|
| `r1_planned_to` / `r2_planned_to` | 누적: 계획일 ≤ Data Date |
| `r1_actual_to` / `r2_actual_to` | 누적: 실적일 ≤ Data Date |
| `r1_planned_on` / `r2_planned_on` | 시점: 계획일 = 해당 날짜 |
| `r1_actual_on` / `r2_actual_on` | 시점: 실적일 = 해당 날짜 |
| `r1_delay_asof` / `r2_delay_asof` | 누적 지연: 계획일 ≤ asOf & 미완료 |
| `r1_delay_on` / `r2_delay_on` | 시점 지연: 계획일 = 해당 날짜 & 미완료 |
| `r1_actual_unplanned_on` / `r2_actual_unplanned_on` | 무계획 실적: 실적일 = 해당 날짜 & 계획일 ≠ 해당 날짜 |

R1의 "계획일"은 `r1_target_submission_date`, "실적일"은 `r1_actual_submission_date`.
R2의 "계획일"은 `r2_target_approval_date`, "실적일"은 `r2_actual_approval_date` (최종 승인 마일스톤 기준 — 기존 `getStagePlannedDate`/`getStageActualDate` 정의와 일치).

## 2. SubtestList(raw-data) 측 변경 — `src/pages/SubtestList.tsx`

### 2-1. 데이터 로드 확장
`subtests` SELECT 쿼리에 R1/R2 컬럼 추가:
```
r1_status, r1_target_submission_date, r1_actual_submission_date,
r2_status, r2_target_submission_date, r2_actual_submission_date,
r2_target_approval_date, r2_actual_approval_date
```

### 2-2. URL 파라미터 파싱 (21개 추가)
위 표의 14개 + `r1_status` / `r2_status` 직접 필터 2개. (`urlR1Status`, `urlR2Status`는 Stage Card 클릭에서 이미 사용 중.)

### 2-3. 필터 적용 로직
`useMemo` 필터 블록(820~882줄)에 R1/R2 조건 추가. Pred/T1/T2와 동일한 패턴이지만 **`isStageDone(r, 'r1' | 'r2')`** 와 **`getStagePlannedDate/getStageActualDate`** 헬퍼를 사용해 R1=Submitted+ / R2=Approved 정의를 일관되게 적용. URL 의존성 배열에도 신규 변수 추가.

### 2-4. `urlStatusFilter === 'remaining'` 의미 보정 (선택)
현재는 `r.t2_status === 'Done'`이면 제외 — 5단계 워크플로 기준에서는 **R2 Approved**가 최종이므로 `!isStageDone(r, 'r2')`로 변경. (Dashboard의 "Remaining" KPI가 R2 기준으로 바뀐 것과 일치.)

### 2-5. `urlStatusFilter === 'at_risk'` & `'overdue'` (선택)
Dashboard의 `isAtRisk`/`isOverdue`는 이미 5단계 모두를 평가하지만, SubtestList의 `at_risk` 분기는 Pred/T1/T2 3개만 검사 중. 일관성을 위해 R1/R2도 포함 (`getStageKeys('all').some(within)`).

### 2-6. 활성 필터 라벨
988~1006줄의 `LABELS` 매핑에 R1/R2 14개 키에 대한 한글/영문 라벨 추가 ("R1 Plan ≤", "R2 Delay =" 등) — 사용자가 "어떤 필터가 적용 중인지" 한눈에 보이도록.

## 3. 검증

- **TypeScript**: `bunx tsc --noEmit`
- **테스트**: `bunx vitest run src/test/dashboard-utils.test.ts`
- **수동 시나리오**:
  1. Dashboard → R1 행의 "Today Δ" 음수값 클릭 → raw-data가 R1 지연 항목만 표시
  2. Dashboard → R2 행의 "Cumulative Delay" 클릭 → R2 미승인(Approved 아님) & 계획일 도래 항목만 표시
  3. T2 Done 셀 클릭 후 화면에서 R1 Planned 상태인 행을 식별 가능

## 4. 변경 범위

- 수정: `src/pages/DashboardPage.tsx`, `src/pages/SubtestList.tsx`
- 신규 파일/스키마/마이그레이션: 없음
- DB 컬럼은 이미 존재 (Phase 1에서 추가됨)

## 5. 영향 없음

- 기존 Pred/T1/T2 셀 클릭 동작
- Excel export
- Schedule / SubtestDetail / Import
