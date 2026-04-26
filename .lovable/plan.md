## 문제 진단

`src/pages/SubtestList.tsx`(T&C Raw Data 테이블)의 컬럼 정의가 `field_config` 테이블 설정과 **불일치**합니다.

### 1) Field Config에 있으나 테이블 컬럼이 누락된 필드 (14개)

데이터는 가져오지만 컬럼이 없어 화면에 표시 안 됨 / Field Config 토글이 무의미한 필드:

| field_name | display_name | DB SELECT 여부 |
|---|---|---|
| `r1_status` | R1 Status | ✅ 가져옴 |
| `r1_target_submission_date` | R1 Target Submission Date | ✅ |
| `r1_actual_submission_date` | R1 Actual Submission Date | ✅ |
| `r1_report_ref` | R1 Aconex Ref | ❌ 누락 |
| `r2_status` | R2 Status | ✅ |
| `r2_target_submission_date` | R2 Target Submission Date | ✅ |
| `r2_actual_submission_date` | R2 Actual Submission Date | ✅ |
| `r2_target_approval_date` | R2 Target Approval Date | ✅ |
| `r2_actual_approval_date` | R2 Actual Approval Date | ✅ |
| `aconex_ref_no` | Aconex Ref No | ❌ |
| `remarks` | Remarks | ❌ |
| `punchlist_comments` | Punchlist Comments | ❌ |
| `mos_sequence` | MOS Sequence | ❌ |
| `updated_by` | Updated By | ❌ |
| `source_upload_id` | Source Upload ID | ❌ |

### 2) `sort_order` 중복 (Field Config 자체 데이터 문제)

DB에 동일 sort_order가 여러 행에 존재 → 정렬 순서가 비결정적:
- `250`: remarks, r1_status
- `260`: r1_target_submission_date, punchlist_comments
- `270`: updated_by, r1_actual_submission_date
- `280`: updated_at, r1_report_ref
- `290`: source_upload_id, r2_status
- `300`: data_source_type, r2_target_submission_date

### 3) 핀고정(PINNED_FRONT) vs sort_order 충돌

`SubtestList.tsx` line 987에서 `item_no, system_code, subtest_id, mos_code`를 항상 앞으로 고정하고 있어, Field Config의 sort_order(team=10이 최우선)를 무시함. 사용자가 sort_order로 정렬을 바꿔도 반영되지 않음.

---

## 수정 계획

### A. SubtestList.tsx — 누락 컬럼 추가
1. **SubtestRow 인터페이스 확장**: `r1_report_ref`, `aconex_ref_no`, `remarks`, `punchlist_comments`, `mos_sequence`, `updated_by`, `source_upload_id` 추가.
2. **DB SELECT 쿼리에 누락 필드 추가** (line 557).
3. **컬럼 정의 추가** (line 616~792 `columns` 배열에):
   - R1: Status (badge), Target Submission Date, Actual Submission Date, Aconex Ref
   - R2: Status (badge), Target Submission Date, Actual Submission Date, Target Approval Date, Actual Approval Date
   - 기타: Aconex Ref No, Remarks(truncate), Punchlist Comments(truncate), MOS Sequence, Updated By, Source Upload ID
   - 날짜 컬럼은 기존 `t2_planned_date`처럼 `dateRangeFilterFn` + `formatDdMmm` 사용
   - Status 컬럼은 기존 `StatusBadge`(또는 ReportStatus 호환) 사용

### B. SubtestList.tsx — 핀고정 로직 완화
- `PINNED_FRONT`에서 `system_code, subtest_id, mos_code` 제거 → Field Config sort_order만 따르도록 변경.
- 유지: `__select`, `item_no`(comments 인디케이터 때문에 좌측 고정), `stage_progress`(파생 컬럼).
- 결과: Team(sort 10)이 최좌측으로 와서 Field Config 의도대로 표시됨.

### C. Field Config sort_order 재정렬 (DB 마이그레이션)
`field_config` 테이블의 sort_order를 10단위로 재배치하여 중복 제거. 논리적 순서로 정리:
```
10 team, 20 system, 30 item_no, 40 subtest_id, 50 mos_code, 60 mos_sequence,
70 hdec_pic_name, 80 subcontractor_name, 90 subsub_name,
100 equipment, 110 description, 120 level,
130 predecessor_status_raw, 140 pred_planned_date, 150 pred_actual_date,
160 t1_planned_date, 170 t1_actual_date, 180 t1_status,
190 t2_planned_date, 200 t2_actual_date, 210 t2_status,
220 r1_status, 230 r1_target_submission_date, 240 r1_actual_submission_date, 250 r1_report_ref,
260 r2_status, 270 r2_target_submission_date, 280 r2_actual_submission_date,
290 r2_target_approval_date, 300 r2_actual_approval_date,
310 aconex_ref_no, 320 remarks, 330 punchlist_comments,
340 data_source_type, 350 source_upload_id, 360 updated_at, 370 updated_by
```

### D. 검증
- Admin → Field Config에서 toggle on/off 시 모든 R1/R2/기타 컬럼이 정상적으로 보이고/숨겨지는지 확인.
- 컬럼 순서가 sort_order에 따라 좌→우로 바르게 정렬되는지 확인 (item_no/progress만 좌측 고정).

---

## 영향 범위
- `src/pages/SubtestList.tsx` (인터페이스, SELECT, columns, PINNED_FRONT)
- DB 마이그레이션 1건 (`field_config.sort_order` UPDATE)
- 기존 데이터/RLS/스키마는 변경 없음, 비파괴적 변경
