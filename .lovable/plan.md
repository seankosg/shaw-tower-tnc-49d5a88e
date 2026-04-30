# Import 로그 — 필드별 상세 기록 (완료)

Phase A (인프라), Phase B (라이터 커버리지), Phase C (UI) 모두 완료.

| 영역 | 현재 기록 수준 |
|---|---|
| **T&C Import** | Row 단위 결과(`upload_row_logs`) + 일부 날짜 필드 변경(`subtest_change_log`)만. 어떤 셀이 무시/스킵됐는지는 알 수 없음 |
| **Defect Import** | Row 단위 결과(`defect_upload_row_logs`)만. `defect_change_log` 테이블이 있지만 import에서 활용 안 함 |

**한계:** 한 행이 "updated"로 표시되더라도, 그 안에서
- 어떤 필드가 실제로 새 값으로 적용됐는지
- 어떤 필드가 비어 있어서 스킵됐는지
- 어떤 필드가 검증 실패로 거부됐는지 (예: 잘못된 status, 미래 날짜)
- 어떤 필드가 자동 보정/유도(derive)됐는지 (예: T2→R1/R2 자동 채움, completion 자동계산)

가 한눈에 보이지 않습니다.

## 제안하는 변경

### 1. 새 테이블: `import_field_logs` (T&C, Defect 공용)

행 단위 로그(`upload_row_logs`/`defect_upload_row_logs`) 1건당 N건의 필드 단위 로그.

```text
import_field_logs
├─ id              uuid PK
├─ upload_id       uuid                  -- batch FK (논리적; T&C/Defect 모두)
├─ kind            text  'tnc'|'defect'  -- 어느 import 종류인지
├─ row_log_id      uuid                  -- 부모 row log
├─ raw_row_no      int                   -- 빠른 조인/표시용 비정규화
├─ field_name      text                  -- DB 컬럼명 (예: t1_planned_date)
├─ outcome         text                  -- 아래 enum 참고
├─ raw_value       text                  -- 엑셀 셀에 들어 있던 값
├─ applied_value   text                  -- 실제 DB에 들어간 값 (또는 유도값)
├─ previous_value  text                  -- update의 경우 기존 DB 값
├─ reason_code     text                  -- 머신 판독용 코드
├─ reason_detail   text                  -- 사람용 설명
└─ created_at      timestamptz
```

**`outcome` 값(공용 사전):**
- `applied` — 새 값이 그대로 들어감
- `unchanged` — 기존 값과 같아서 변경 없음
- `derived` — 빈 값이어서 다른 필드에서 유도 (예: R1 target ← T2 planned)
- `auto_filled` — 자동 보정 (예: status=Done이면 actual=오늘)
- `corrected` — 잘못된 값을 시스템이 정정 (예: invalid status → 자동 계산)
- `skipped_empty` — 셀이 비어 있어 무시 (clear token이 아님)
- `skipped_clear_blocked` — `_clear` 같은 clear 토큰이 권한/규칙으로 막힘
- `skipped_no_permission` — 사용자가 해당 필드 수정 권한 없음
- `rejected_invalid` — 검증 실패 (날짜 미래, 형식 오류 등)
- `rejected_conflict` — 충돌 (예: closure vs completion 모순)
- `info` — 정보성 (분류 fallback, status 자동 매핑 등)

**RLS:** `Anyone can read`, `Authenticated can insert (where row's batch is owned by self or admin)`, admin만 delete. 기존 row log 패턴 그대로.

**인덱스:** `(upload_id)`, `(row_log_id)`, `(upload_id, outcome)`.

### 2. T&C Import 라이터 확장 — `src/contexts/ImportContext.tsx`

행을 처리할 때 누적되는 `pendingFieldLogs: FieldLog[]` 배열을 만들고, row log insert 후 `row_log_id`를 받아 채워서 일괄 insert.

기록할 필드 케이스(예시):
- 모든 매핑 컬럼: `applied` / `unchanged` 분류 (현재는 "no_changes" 하나로 뭉뚱그림)
- `t1_planned_date`, `t2_planned_date`, `pred_planned_date`, `r1_target_submission_date`, `r2_target_submission_date`: 기존 schedule audit + 동일 정보 필드 로그
- `t1_status/t2_status/pred_status` Auto-Planned: `auto_filled` + reason `status_auto_planned`
- `t1_actual/t2_actual/pred_actual` Auto-fill on Done: `auto_filled` + reason `actual_autofilled_on_done`
- `r1_target_submission_date / r2_*`: 빈 값일 때 T2에서 유도하면 `derived`
- 날짜 미래 위반: `rejected_invalid` + `actual_date_after_data_date`
- 시스템 매핑 실패: 행 자체 rejected — 별도 필드 로그 없음(부모 row log만)

### 3. Defect Import 라이터 확장 — `src/contexts/DefectImportContext.tsx`

현재 reason_code들을 필드 단위로 분해:
- `aconex_status_auto_mapped` → `completion_status=auto_filled`, `actual_completion_date=auto_filled`, `actual_progress_pct=auto_filled`
- `closure_completion_conflict` → 관련 4~5개 필드에 `corrected` 또는 `rejected_conflict`
- `invalid_status_value` → `completion_status` 또는 `closure_status`만 `corrected`
- `discipline_fallback` / `unclassified_defect` → `main_trade`, `sub_trade`, `work_type`에 `info`/`derived`
- `planned_pct_*` → `planned_progress_pct`만 `derived`/`skipped_*`
- `team_unresolved` → `team`만 `skipped_no_permission`(또는 `rejected_invalid`)
- `actual_date_after_data_date` → 위반된 각 actual 날짜 컬럼별로 `rejected_invalid`
- `duplicate_subcontractor_issue_no` → `subcontractor_issue_no` `rejected_conflict`
- 또한 update의 경우 매핑된 필드 전부에 대해 `applied`/`unchanged` 분류

추가로 `defect_change_log`에 (변경된 필드만) 필드별 변경 내역도 함께 기록 — 기존 사후 추적용 테이블이지만 import에서도 채워서 정합성을 맞춤.

### 4. UI: Import Logs 상세 페이지

`src/pages/ImportLogsPage.tsx`, `src/pages/DefectImportLogsPage.tsx` 두 곳:

- **Row Logs 탭**의 각 행에 **확장(▸) 토글** 추가. 펼치면 해당 행의 `import_field_logs`를 작은 표로:

  ```text
  Field              Outcome           Raw → Applied (Prev)         Reason
  t1_planned_date    applied           2026-05-20 → 2026-05-20      —
  t2_planned_date    derived           (empty) → 2026-06-15         derived_from_t2
  t1_status          auto_filled       (empty) → Planned            status_auto_planned
  hdec_pic_name      unchanged         Kim → Kim                    —
  actual_completion  rejected_invalid  2026-05-01 → —               actual_date_after_data_date
  ```

- 상단 **요약 칩**: `applied N · derived N · auto_filled N · skipped N · rejected N`
- **outcome 필터**: 행 단위 action 필터 옆에 필드 outcome 필터 드롭다운 추가
- **CSV 내보내기**: 기존 row log CSV 옆에 "Field-level CSV" 버튼 추가
- **삭제 동작**: 배치 삭제 시 `import_field_logs`도 함께 정리하도록 기존 cleanup 코드 보강

### 5. Rollback / Retention 영향

- 기존 `rollback_*` RPC들은 변경 불필요 (필드 로그는 보조 추적용; 실제 데이터 복구는 snapshot/change log가 담당)
- 1년 retention 정책이 있다면 `import_field_logs`도 동일 보존(`upload_id` 기반 cascade-style cleanup)

## 작업 분할 (Phase)

**Phase A — 인프라 (Migration + 라이터 골격)**
1. `import_field_logs` 테이블 + RLS + 인덱스 마이그레이션
2. T&C/Defect import 라이터에 `pendingFieldLogs` 인프라(배열, batch insert) 추가, 일단 한두 가지 케이스(`applied`, `auto_filled`)부터 채움

**Phase B — 케이스 커버리지 확대**
3. T&C: 모든 매핑 컬럼 applied/unchanged 분류, 날짜 유도/Auto-Done autofill 기록
4. Defect: 위에 나열된 모든 reason_code를 필드 단위로 분해, change_log 동시 기록

**Phase C — UI**
5. Import Logs 페이지 두 곳에 확장 행 + 요약 칩 + outcome 필터
6. Field-level CSV export, 배치 삭제 시 cleanup

각 Phase는 독립 배포 가능. 사용자가 원하는 시점까지만 진행해도 의미가 있습니다 (예: A+B만 해도 DB에는 풍부한 기록이 쌓이고, C는 나중에 가능).

## 영향 받는 파일

- 새 마이그레이션: `supabase/migrations/<new>.sql`
- `src/contexts/ImportContext.tsx`
- `src/contexts/DefectImportContext.tsx`
- `src/pages/ImportLogsPage.tsx`
- `src/pages/DefectImportLogsPage.tsx`
- (자동) `src/integrations/supabase/types.ts`

## 결정 필요 사항

진행 전 확인하고 싶은 점:

1. **모든 Phase(A→C) 다 진행?** 아니면 Phase A+B만 먼저 (DB만 쌓고 UI는 나중)?
2. **`unchanged` 필드도 모두 기록할지?** (행마다 수십 건이 쌓일 수 있음 — 보통 1만 행 import면 수십만 row.) 옵션:
   - (a) 항상 모두 기록
   - (b) `applied`/`derived`/`skipped`/`rejected` 등 **변화·이슈가 있는 필드만** 기록 (권장)
   - (c) 토글 가능한 import 옵션
3. **Defect의 `defect_change_log` 동시 기록**도 같이 진행? (사후 변경 추적과 import 시점 모두 일관됨)
