## 목표
T&C 단계를 `pred → t1 → t2 → r1 → r2` 5단계로 확장. R1(협력사→HDEC), R2(HDEC→발주처). 최종 종결 = **R2 status = Approved**. R1/R2도 target date 기반 지연 모니터링.

## 1. DB 스키마 변경 (마이그레이션 1회)

### 1-1. enum
```sql
CREATE TYPE public.report_status AS ENUM
  ('Planned','Submitted','Under Review','Approved','Returned');
```

### 1-2. `subtests` 컬럼 변경/추가
| 컬럼 | 변경 |
|---|---|
| 기존 `r1_status` (text) | → **`r1_report_ref` (text)** rename (1,114건 HDEC-ME-TES-### 보존) |
| 기존 `r2_status` (text) | DROP (전부 비어있음) |
| **신규** `r1_status` `report_status` |
| **신규** `r1_target_submission_date` `date` |
| **신규** `r1_actual_submission_date` `date` |
| **신규** `r2_status` `report_status` |
| **신규** `r2_target_submission_date` `date` |
| **신규** `r2_actual_submission_date` `date` |
| **신규** `r2_target_approval_date` `date` |
| **신규** `r2_actual_approval_date` `date` |

### 1-3. `field_config` 등록 (sort_order)
- 250 R1 Status (pulldown)
- 260 R1 Target Submission Date
- 270 R1 Actual Submission Date
- 280 R1 Aconex Ref
- 290 R2 Status (pulldown)
- 300 R2 Target Submission Date
- 310 R2 Actual Submission Date
- 320 R2 Target Approval Date
- 330 R2 Actual Approval Date

### 1-4. 영업일 헬퍼 함수
```sql
CREATE OR REPLACE FUNCTION public.add_business_days_no_sun(_start date, _days int) RETURNS date
-- +1씩 더하며 일요일은 카운트 제외. 결과가 일요일이면 월요일로 미룸.
```

## 2. 일회성 데이터 마이그레이션

대상: `is_active=true AND t2_planned_date IS NOT NULL` (~1,447건)

### 2-1. Target Date 산출
- `r1_target_submission_date` = T2 + 3 영업일
- `r2_target_submission_date` = R1_target + 3 영업일
- `r2_target_approval_date`   = R2_target_submission + 5 영업일

기존 값 NULL인 행만 채움 (idempotent).

### 2-2. Status 초기값
- `r1_status` = `'Planned'`
- `r2_status` = `'Planned'`

기존 값 NULL인 행만 채움.

## 3. 단계별 Plan/Actual/Done 매핑 (지연 판정 기준)

| Stage | Plan Date | Actual Date | Done 판정 |
|---|---|---|---|
| pred | pred_planned_date | pred_actual_date | pred_status='Done' |
| t1 | t1_planned_date | t1_actual_date | t1_status='Done' |
| t2 | t2_planned_date | t2_actual_date | t2_status='Done' |
| **r1** | **r1_target_submission_date** | r1_actual_submission_date | r1_status IN ('Submitted','Under Review','Approved') |
| **r2** | **r2_target_approval_date** | r2_actual_approval_date | **r2_status='Approved'** |

### Delay 정의 (5단계 공통)
- Today Plan: planned date = today
- Today Delay: planned date = today AND not done
- Data Date Plan/Delay: dataDate 기준 동일
- Cum Plan: planned date ≤ dataDate
- Cum Actual: actual date ≤ dataDate
- Overdue: planned date < today AND not done (R1/R2 누적 지연 모니터링)

## 4. UI / 코드 변경

### 4-1. `src/types/enums.ts`
```ts
export type ReportStatus = 'Planned'|'Submitted'|'Under Review'|'Approved'|'Returned';
export const REPORT_STATUS_OPTIONS: ReportStatus[] = [...];
```
StatusBadge 색상: Planned=blue, Submitted=amber, Under Review=violet, Approved=green, Returned=red.

### 4-2. `src/lib/business-days.ts` (신규)
JS 측 영업일 산출 — 신규 subtest 생성 시 자동 R1/R2 target date 계산용.

### 4-3. `src/lib/stage-metrics.ts`
Stage union: `'pred'|'t1'|'t2'|'r1'|'r2'`. getStagePlannedDate/Actual/Done 위 표대로 확장.

### 4-4. `src/lib/dashboard-utils.ts` & `DashboardPage.tsx`
`aggregatePlanActualByGroup` 결과에 `r1`, `r2` 키 추가 (기존 t1/t2 셀 동일 구조). R1/R2도 자동으로 Today Delay / Data Date Delay 표시.

### 4-5. `SubtestDetail.tsx`
- R1: Target/Actual Submission Date, Status (Select), Aconex Ref
- R2: Target/Actual Submission Date, Target/Actual Approval Date, Status (Select)

### 4-6. Import (`import-parser.ts`, `ImportContext.tsx`)
HEADER_MAP에 신규 9개 헤더 추가. 옛 `r1`/`r2` 헤더 값이 `^HDEC-` 패턴이면 `r1_report_ref`로 라우팅, 그 외 텍스트는 status 컬럼으로. change_log 추적 필드에 신규 컬럼 포함.

### 4-7. Schedule / Progress
stageFilter union에 r1, r2 추가. ScheduleMatrix, aggregateSchedule 5단계 확장.

### 4-8. Excel export
dashboard-excel-export, schedule-excel-export에 R1/R2 열 추가.

## 5. Dashboard 구성

### KPI 카드 (모바일 2열)
1. Total Subtests
2. T2 Done %
3. R1 Approved %
4. **R2 Approved % (최종 종결률)**
5. Total Today Delay (5단계 합산)
6. **R1+R2 Overdue** (planned < today AND not done)

### Plan vs Actual Summary 테이블 (5단계)
```text
              Pred           T1            T2            R1            R2
Group │DD-P│DD-A│Δ│TD-P│TD-A│Δ│ … 동일 패턴 × 5단계 …                  │Done│Rem
```
- DD=Data Date, TD=Today, Δ=Actual−Plan
- Done/Remain은 **R2 Approved 기준** (최종 종결)
- 그룹: System / Subcontractor / HDEC PIC 토글
- 가로 스크롤 + 첫 컬럼 sticky

### R1/R2 Watchlist 카드
| Subtest | Stage | Target Date | Days Overdue | Status | Owner |
- planned < today AND not done. Days Overdue 내림차순.

### 차트
- 5-Stage Funnel (단계별 Done 가로 막대)
- R1/R2 Status 도넛 2개
- R2 Approval Trend (계획 vs 실적 누적 라인)

## 6. 모바일 UX
- KPI 2열, Summary 테이블 horizontal scroll + sticky 첫 컬럼
- 단계 표시 토글 (전체 / T단계만 / R단계만)

## 7. 기술 메모
- R1 Done 판정: Submitted+ (협력사 관점 완료). 운영 정책 변경 시 단일 함수에서 조정.
- R2는 Approved만 Done.
- 영업일 함수 DB·JS 양쪽 보유. T2 수정 시 R1/R2 target 자동 재계산은 옵션 (수동 override 허용).
- 모든 신규 컬럼은 field_config로 가시성 제어.

## 8. 작업 순서
1. 마이그레이션 (enum, 컬럼 rename/drop/add, field_config, business-day 함수)
2. 일회성 데이터 마이그레이션 (target date 3종 + status='Planned' 2종)
3. types.ts 자동 재생성 대기
4. enums.ts, business-days.ts 추가
5. SubtestDetail, parser, ImportContext 업데이트
6. stage-metrics, dashboard-utils 5단계 확장 + 단위테스트
7. DashboardPage: KPI/Summary/Watchlist/Funnel/Trend
8. Schedule/Progress/Export 5단계 확장
