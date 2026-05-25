## 목표
Punch Import에서 `3.5`, `4.1`, `7.1` 같은 subtask 형태 Item No가 일반 row로 들어가는 문제를 근본적으로 해결하고, 같은 문제가 다시 생겨도 Import Logs에서 즉시 드러나도록 보강합니다.

## 확인된 원인
- 현재 파서(`parseSubtaskItemNo`)는 `3.5`, `4.1`, `7.1`을 정상적으로 subtask 형태로 인식할 수 있습니다.
- 그러나 DB의 `punch_depth_guard()` 트리거가 **child row는 반드시 `subtask_stage`가 있어야 한다**고 강제하고 있습니다.
- 이번 업로드 배치(`2026-05-25 08:12~08:13`)의 실제 데이터 확인 결과:
  - `3.5`, `4.1~4.4`, `7.1~7.6`는 `item_no`는 저장됐지만
  - `subtask_stage = NULL`, `parent_id = NULL` 상태로 남아 있습니다.
- 즉, **2차 parent link 단계에서 `parent_id` 업데이트가 DB 트리거에 막혀 실패**했고, 이 실패가 화면/로그에 제대로 집계되지 않았습니다.
- 추가로 현재 `punch_upload_row_logs`는 row insert/update까지만 기록되고, **2차 hierarchy link 실패는 log/batch rejected 수치에 반영되지 않아 성공처럼 보이는 구조적 문제**가 있습니다.

## 구현 계획
### 1) DB 규칙을 현재 업무 규칙과 일치시키기
- `subtask_stage`가 비어 있어도 subtask 연결이 가능하도록 `punch_depth_guard()`를 수정합니다.
- 유지할 규칙:
  - 2단계 hierarchy까지만 허용
  - child row는 `is_summary=false`
  - parent가 또 child인 경우 금지
- 완화할 규칙:
  - `parent_id`가 있어도 `subtask_stage`는 nullable 허용
- 이렇게 하면 사용자가 Stage를 비워 둔 `3.5`, `4.1`, `7.1` 같은 행도 정상 child로 연결됩니다.

### 2) Import 2차 hierarchy 처리 결과를 실패로 집계
- `upsertPunchRows()`의 2차 parent-link 단계에서
  - parent link 실패
  - auto-parent 생성 실패
  - depth 위반
  같은 케이스를 `result.failed`와 row-level log에 반영하도록 수정합니다.
- `punch_upload_batches.rejected_rows`에도 최종 반영되게 맞춥니다.
- 즉, 앞으로는 “insert는 됐지만 child 연결은 실패” 같은 반쪽 성공이 숨지 않게 합니다.

### 3) Import log 가시성 보강
- `punch_upload_row_logs`에 2차 hierarchy 단계 실패도 남기도록 보강합니다.
- 실패 사유를 구체적으로 남깁니다. 예:
  - `parent_link_failed`
  - `parent_depth_invalid`
  - `auto_parent_create_failed`
- 필요 시 동일 row에 대해 초기 insert/update 로그와 hierarchy 결과 로그를 구분해서 해석 가능하게 정리합니다.

### 4) 기존 재현 케이스 기준으로 검증
- 사용자가 올린 동일 파일 기준으로 다음을 검증합니다.
- 기대 결과:
  - `3.5 -> parent 3`
  - `4.1~4.4 -> parent 4`
  - `7.1~7.6 -> parent 7`
- 그리고 import log에 hierarchy 결과가 정확히 보이는지까지 확인합니다.

## 수정 범위
- DB migration 1건
  - `punch_depth_guard()` 규칙 수정
- 앱 코드 1~2파일
  - `src/lib/punch-excel-utils.ts`
  - 필요 시 `src/pages/PunchImportLogsPage.tsx` 또는 관련 로그 표시 코드

## 기술 메모
- 이번 문제는 파서 실패가 아니라 **파서 규칙과 DB 제약 조건 불일치**가 핵심입니다.
- 이전에 “Stage는 비어도 허용, 값이 있으면 3개 enum만 인정”으로 정한 업무 규칙이 DB trigger에는 아직 반영되지 않은 상태입니다.
- 따라서 프론트만 고쳐서는 재발을 막을 수 없고, DB 규칙과 로그 집계를 같이 수정해야 합니다.