## 목적

현재 스케줄 변동 검토 로직에서 T2는 후속(successor) 단계가 없어 `prev_gap_days` / `cur_gap_days`가 항상 `null`이고, R1/R2 단계는 아예 변동 검토 대상이 아닙니다.

요청에 따라 다음과 같이 후속 단계 매핑을 확장합니다:
- **T2** → 후속은 **R1 Target Submission** (`r1_target_submission_date`)
- **R1** → 후속은 **R2 Target Submission** (`r2_target_submission_date`)
- **Pred** → T1 (기존 유지)
- **T1** → T2 (기존 유지)

## 변경 사항

### 1. `src/lib/schedule-change-utils.ts`
- `Stage` 타입을 `'pred' | 't1' | 't2'`에서 `'pred' | 't1' | 't2' | 'r1' | 'r2s'`로 확장
- `PlannedDates` 타입에 `r1_target_submission_date`, `r2_target_submission_date` 추가
- `buildScheduleChangeImpact()`에서 successor 매핑 변경:
  - `t2` 후속을 `null` → `r1_target_submission_date`로 변경
  - `r1` 항목 추가 (후속: `r2_target_submission_date`)
  - `r2s` 항목 추가 (후속: 없음, 최종 단계)
- `finalDates` 객체에도 R1/R2 필드 포함시켜 cur_gap 계산이 동일 임포트 내 동시 변경을 반영하도록 함

### 2. `src/contexts/ImportContext.tsx`
- `buildScheduleChangeImpact()` 호출 시 `r1_target_submission_date`, `r2_target_submission_date`도 existing/updates 양쪽에 전달
- Existing 조회 시 select 컬럼에 두 필드 포함 (이미 `r1/r2_target_submission_date`는 다른 곳에서 조회 중이므로 동일 select 절에서 함께 가져오도록 정리)
- `schedule_change_audit` INSERT payload는 **현행 스키마에 R1/R2 컬럼이 없으므로**, 우선 T2의 `t2_prev_gap_days` / `t2_cur_gap_days`가 R1 제출일과의 간격으로 정상 계산되어 들어가는 효과만 즉시 반영됨

### 3. DB 마이그레이션 (선택, 권장)
R1 제출일 변경 자체를 감사 로그에 남기려면 `schedule_change_audit` 테이블에 컬럼 추가가 필요합니다:
```
r1_old_date, r1_new_date, r1_diff_days, r1_prev_gap_days, r1_cur_gap_days
r2s_old_date, r2s_new_date, r2s_diff_days, r2s_prev_gap_days
```
- 추가 시 `ImportContext.tsx`의 audit payload에도 매핑 추가
- 추가 시 `ScheduleRevisionPage`에 R1/R2 컬럼 표시

> R1/R2 자체의 변동 이력까지 기록할지, 아니면 **T2 변경 시 R1과의 gap만 보면 충분**한지에 따라 마이그레이션 포함 여부가 갈립니다.

## 의사결정 필요

다음 중 어느 범위로 진행할지 알려주세요:

- **A. 최소 범위**: T2의 후속을 R1로, R1의 후속을 R2로 매핑만 변경. R1/R2 단독 변동은 audit에 기록하지 않고, 기존 T2 audit의 gap 값만 의미 있게 채워짐. (마이그레이션 불필요)
- **B. 전체 범위**: A + `schedule_change_audit` 테이블에 R1/R2 컬럼 추가 + Schedule Revision 페이지 표시까지 확장. (마이그레이션 필요)

기본 추천은 **B** (이력 추적이 본 기능의 목적이므로). 단, A로 진행해도 T2 변경 시 R1 제출일과의 간격 변화는 즉시 보이게 됩니다.
