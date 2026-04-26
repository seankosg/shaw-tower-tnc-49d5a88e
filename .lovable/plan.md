## 목표

T&C **Progress 탭(`/tc/progress`)** 의 daily/weekly 매트릭스에 **R1 / R2** 단계의 **계획(Plan)** 및 **실적(Actual)** 셀이 Pred/T1/T2 와 동일하게 카운트·표시되도록 합니다.

## 현재 문제

- `aggregateSchedule` 는 이미 5개 단계(pred/t1/t2/r1/r2) 모두를 daily 버킷에 누적하지만, `SchedulePage` 의 Supabase select 가 R1/R2 컬럼을 가져오지 않아 매트릭스의 R1/R2 셀이 모두 0
- Stage 필터 탭에 R1/R2 가 없어 단독 보기 불가
- Critical 패널·Excel export·KPI 분모도 t1/t2 까지만 다룸

## R1 / R2 의 daily 정의 (확정)

| 단계 | Plan 일자 | Actual 일자 | Done 판정 |
|------|-----------|-------------|-----------|
| R1   | `r1_target_submission_date` | `r1_actual_submission_date` | status ∈ {Submitted, Under Review, Approved} |
| R2   | `r2_target_approval_date`   | `r2_actual_approval_date`   | status = Approved |

(`stage-metrics.ts` 의 기존 헬퍼 그대로 사용)

## 변경 내역

1. **`src/pages/SchedulePage.tsx`**
   - `subtests` select 에 R1/R2 컬럼 추가: `r1_status, r1_target_submission_date, r1_actual_submission_date, r2_status, r2_target_approval_date, r2_actual_approval_date`
   - Stage 필터 탭에 `R1`, `R2` 추가

2. **`src/lib/schedule-utils.ts`**
   - `CriticalItem.stage` 타입을 `StageKey` (pred/t1/t2/r1/r2) 로 확장
   - `findCritical` 을 `getStagePlannedDate` / `isStageDone` 헬퍼 기반으로 일반화하여 t1, t2, r1, r2 horizon 내 미완료 항목을 high-risk 로 검출

3. **`src/components/schedule/ScheduleMatrix.tsx`**
   - `totalBlockTitle` 분모 라벨: `× 3` → `× 5` (stageFilter='all')
   - 좌측 stage 뱃지 색상은 이미 R1=amber, R2=emerald 적용됨

4. **`src/lib/schedule-excel-export.ts`**
   - stage 배열: `['pred','t1','t2']` → `['pred','t1','t2','r1','r2']`

5. **`src/lib/schedule-cache.ts`**
   - cache schema version 키 도입 → R1/R2 누락된 이전 캐시 자동 무효화

## 검증 시나리오

- R1 plan 셀: `r1_target_submission_date` 가 있는 subtest → 해당 일자 셀 Plan +1
- R1 actual 셀: status=Submitted 이상 + actual 일자 → 해당 일자 셀 Actual +1
- R2 plan/actual: approval 일자 기준 동일하게 카운트
- Stage 필터=R1: R1 행만, KPI 도 R1 기준
- Excel: stageFilter=all 일 때 그룹 아래 5개 sub-row(Pred/T1/T2/R1/R2)

## Out of scope

- Defect 모듈
- T&C Dashboard(`/tc/dashboard`)
- R2 의 submission milestone 별도 표시 (현 정책: R2=approval 단일)
