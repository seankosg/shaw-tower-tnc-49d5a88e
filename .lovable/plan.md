## 목표

Punch Raw Data 테이블에 `Stage` 컬럼을 노출하여 각 행이 Pre-Engineering / Physical Work / Inspection 중 어느 단계인지 표시합니다. Item No. 바로 옆에 배치합니다.

## 배경

- `punch_items.subtask_stage` 컬럼은 이미 존재합니다 (enum: `pre_engineering`, `physical_work`, `inspection`).
- `punch-field-registry.ts`에도 `subtask_stage` 필드(group: hierarchy, label: "Subtask Stage")가 등록되어 있습니다.
- 하지만 `punch_field_config` 테이블에는 아직 노출 설정이 없어 Raw Data에 보이지 않습니다.
- 현재 데이터: Summary 76건 NULL, Subtask 416건 중 1건만 `physical_work`, 나머지 NULL. Summary는 사양상 계속 NULL 유지.

## 변경 사항

### 1. DB: `punch_field_config`에 `subtask_stage` 행 추가 (마이그레이션)

- `field_name = 'subtask_stage'`
- `display_name = 'Stage'` (사용자 요청 라벨)
- `sort_order = 15` (item_no=10, outstanding_work=30 사이)
- `is_enabled = true`, `is_required = false`
- `source_origin = 'system'`
- `original_header = 'Stage'`
- `visible_to_roles`, `editable_to_roles` = NULL (기존 기본값과 동일)

### 2. Registry 라벨 조정 (`src/lib/punch-field-registry.ts`)

`subtask_stage`의 `exportLabel`을 `"Subtask Stage"` → `"Stage"`로 변경하여 export/import 라운드트립과 UI 라벨을 일치시킵니다. 기존 별칭(`subtaskstage`, `stage`, `substage`)은 그대로 유지되어 이전 export 파일의 import에도 영향 없음.

### 3. Raw Data 페이지 셀 렌더링 (`src/pages/PunchRawDataPage.tsx`)

- `subtask_stage` 컬럼의 셀에 `SUBTASK_STAGE_LABEL` 매핑을 적용하여 enum 코드 대신 사람이 읽을 수 있는 라벨("Pre-Engineering", "Physical Work", "Inspection")로 표시.
- NULL 값은 빈칸 (Summary 행은 항상 빈칸으로 표시).
- 정렬 순서는 `punch_field_config.sort_order=15`로 자동으로 Item No 옆에 위치.

## 영향 없음

- 입력/수정 로직, 마이그레이션(데이터 변경), 권한 정책은 변경하지 않습니다.
- Summary 행의 `subtask_stage`는 NULL 유지(사양).
- Detail 페이지의 stage 선택 UI는 이미 존재하므로 별도 수정 불필요.
