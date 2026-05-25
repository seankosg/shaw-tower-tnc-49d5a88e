## 신규 Subtask 추가 시 prefill 로직 개선

### 현재 문제 요약
- 가장 최근 자식의 모든 필드를 그대로 복사 → 일정 중복, 본문 중복
- Stage 기본값이 항상 `physical_work`로 하드코딩되어 다음 단계 제안이 안 됨

### 개선안

#### A. Identity / Classification — 자식이 있으면 첫 자식, 없으면 부모에서 상속
- `location`, `work_type`, `main_trade`, `sub_trade`, `team`
- 자식 정렬 기준: `item_no` 오름차순 첫 번째

#### B. Stage 기본값 자동 제안
- 부모(Summary) 하위 자식들의 `subtask_stage` 집합을 확인
- 순서 `pre_engineering → physical_work → inspection` 중 **존재하지 않는 첫 단계**를 기본값으로 선택
- 모두 존재하면 `physical_work`로 fallback

#### C. Outstanding Works — Stage 라벨 prefix로 채움
- 새 subtask의 stage가 결정되면 `[Pre-Engineering] `, `[Physical Work] `, `[Inspection] ` 중 해당 prefix를 자동 입력
- 사용자가 뒤에 구체적 작업 내용을 이어서 작성하도록 유도
- 사용자가 Stage RadioGroup을 변경하면 prefix도 따라 바뀜(단, 사용자가 prefix 뒤 본문을 이미 입력한 경우 본문은 보존)

#### D. 일정(planned_start_date) — 직전 자식의 완료일로 자동 채움
- "직전 자식" 정의: 선택된 stage보다 **앞선 stage** 중 가장 늦은 `planned_completion_date`를 가진 자식
  - 예: 신규 stage가 `inspection`이면 `physical_work`/`pre_engineering` 자식들 중 최신 완료일
  - 앞선 stage 자식이 없으면 부모(또는 첫 자식)의 `planned_start_date` 사용
- `planned_completion_date`는 **공란**으로 두어 사용자가 직접 입력
- `weight`는 `'1'`로 기본화, `remarks`는 공란

#### E. Stage 변경 시 재계산
- 사용자가 다이얼로그 내 Stage RadioGroup을 바꾸면:
  - Outstanding Works prefix 갱신(사용자가 prefix만 있고 본문이 비어있을 때만)
  - `planned_start_date` 자동값 재계산(사용자가 아직 손대지 않았을 때만 — `dirty` 플래그 추적)

### 구현 범위

#### `src/components/punch/AddPunchSubtaskDialog.tsx`
- props 확장:
  - `existingSubtasks?: Array<{ subtask_stage: SubtaskStage | null; planned_completion_date: string | null }>`
- 초기 stage 자동 선택 로직 추가 (B)
- Outstanding Works prefix 자동 입력 + stage 변경 시 갱신 (C, E)
- `planned_start_date` 자동 채움 + stage 변경 시 재계산, `startDateDirty` 플래그로 사용자 수정 보존 (D, E)
- `remarks`, `planned_completion_date`, `weight` 기본화

#### `src/pages/PunchDetailPage.tsx` (라인 609–637)
- `defaults` 산출 로직 단순화: Identity/Classification 5개 필드만 첫 자식 또는 부모에서 추출 (A)
- 새 prop `existingSubtasks={children.map(...)}` 전달

### 검증
- 신규 Summary(자식 없음)에서 Add Subtask → Stage = PE, prefix `[Pre-Engineering] `, 일정은 부모의 시작일
- PE만 있는 Summary에서 Add Subtask → Stage = PW, 시작일 = PE 완료일
- PW까지 있는 Summary에서 Add Subtask → Stage = IN, 시작일 = PW 완료일
- 사용자가 Stage를 수동 변경하면 prefix와 시작일이 함께 갱신됨
- 사용자가 시작일을 직접 수정한 뒤 Stage를 바꿔도 수정값 보존
