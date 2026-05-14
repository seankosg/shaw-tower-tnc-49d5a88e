# Subtest 내보내기 — 날짜 컬럼 텍스트 혼재 수정

## 원인

업로드한 파일(`SHAW_Subtests_20260513_2219.xlsx`)을 분석한 결과:

| 컬럼 | datetime 셀 | text 셀 |
|---|---|---|
| T1 Planned Date | 303 | 74 (빈 문자열) |
| T2 Planned Date | 377 | 0 |
| **R1 Target Submission Date** | 129 | **248 (ISO 문자열)** |
| **R2 Target Submission Date** | 107 | **270 (ISO 문자열)** |
| **R2 Target Approval Date** | 193 | **184 (ISO 문자열)** |
| Updated At | 377 | 0 |

`src/lib/excel-export.ts`의 `DATE_COLUMN_IDS` 화이트리스트에 T1/T2 컬럼만 등록되어 있고, R1/R2 관련 날짜 컬럼이 누락되어 있습니다. 따라서 R1/R2 날짜는 ISO 문자열 그대로 일반 텍스트 셀(`setCell`, number_format=`General`)에 들어가서 Excel이 날짜로 인식하지 못합니다.

```ts
// src/lib/excel-export.ts:118
const DATE_COLUMN_IDS = new Set([
  't1_planned_date', 't1_actual_date',
  't2_planned_date', 't2_actual_date',
  // ❌ r1/r2 누락
]);
```

이 Set은 단일 파일 export(line 296)와 시스템별 번들 export(line 651) 두 경로 모두에서 사용되므로, 한 곳만 고치면 두 경로 모두 수정됩니다.

## 변경 사항

### 1. `src/lib/excel-export.ts`
`DATE_COLUMN_IDS`에 R1/R2 날짜 컬럼 추가:
- `r1_target_submission_date`
- `r1_actual_submission_date` (스키마에 있다면)
- `r2_target_submission_date`
- `r2_actual_submission_date` (스키마에 있다면)
- `r2_target_approval_date`
- `r2_actual_approval_date` (스키마에 있다면)

(실제 컬럼 id는 구현 시 `subtests` 타입과 raw-data 컬럼 정의를 확인하여 존재하는 것만 추가)

### 2. 빈 값 처리 (선택)
값이 `null` 또는 빈 문자열이면 `setCell`을 호출하지 않고 셀을 비워두도록 하여 `General` 빈 문자열 셀이 남지 않게 정리. (T1 Planned에 74개의 빈 문자열 셀이 남아 있는 현상 해결.)

### 3. 회귀 검증
수정 후 동일 필터로 다시 내보내서 `openpyxl`로 검사 — R1/R2 컬럼의 모든 비어있지 않은 셀이 `datetime` 타입 + `dd-mmm` number_format으로 저장되는지 확인.

## 영향 범위

- 단일 Subtest export (`exportSubtestsToExcel`)
- 시스템별 번들 export (`exportSubtestsPerSystemBundle`)
- Defect/Docs export 경로는 별도 함수이며 본 수정과 무관 (이미 자체 화이트리스트 보유).
