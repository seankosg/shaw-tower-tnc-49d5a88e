## 문제
Subtask 상세 페이지(`/punch/:id`)에서 현재 `subtask_stage`(Pre-Engineering / Physical Work / Inspection) 값이 우측 상단에 읽기 전용 Badge로만 표시되고, 3개 옵션 중 하나를 선택/변경할 수 있는 RadioGroup이 사라져 있는 상태입니다.

## 수정 계획

### `src/pages/PunchDetailPage.tsx`
- 자식 행(Subtask, `parent_id != null` 이고 `is_summary = false`)일 때만 노출되는 **Stage 선택 카드**를 본문 상단(Identity 카드 위 또는 첫 번째 위치)에 추가합니다.
- `AddPunchSubtaskDialog`에서 사용 중인 동일한 RadioGroup 스타일(3-column grid, `has-[:checked]:border-primary`)을 재사용하여 일관성을 유지합니다.
- 옵션: `SUBTASK_STAGES` (`pre_engineering`, `physical_work`, `inspection`), 라벨은 `SUBTASK_STAGE_LABEL`.
- 선택 변경 시 기존 `patch('subtask_stage', value)` 패턴으로 로컬 상태 갱신 → "Save" 버튼으로 일괄 저장(현재 페이지의 저장 흐름과 동일).
- `disabled` 상태(읽기 권한, Summary 행)에서는 비활성화 처리.
- 상단의 기존 Badge는 그대로 유지(요약 표시용).

### Summary 행 처리
- `is_summary = true` 행에서는 stage 개념이 없으므로 새 카드는 렌더링하지 않습니다(자식 목록 카드는 기존대로 유지).

## 검증
- Subtask 상세에서 Stage RadioGroup 3개가 보이고 선택 가능한지 확인
- 다른 stage로 변경 후 Save → DB 반영 및 Summary 페이지 그룹화 갱신 확인
- Summary 상세에서는 노출되지 않음을 확인
