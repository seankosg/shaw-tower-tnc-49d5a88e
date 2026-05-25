## 요구사항 요약

1. **Add Subtask 다이얼로그 기본값**
   - 기존 subtask 가 있으면 → Planned Start Date 가 가장 늦은(최신) subtask 의 값들을 그대로 prefill
   - 기존 subtask 가 없으면 → Summary(부모) 의 값들을 prefill (현재 동작 유지)
2. **Subtask 목록 정렬**
   - Detail 페이지의 Subtask 리스트(스테이지별 그룹 내부)는 `planned_start_date` 오름차순으로 정렬 (NULL 은 맨 뒤)

## 구현 상세

### 1) `src/pages/PunchDetailPage.tsx`
- "Add Subtask" 버튼 클릭 시 현재는 부모 행 데이터를 `defaults` 로 넘김.
- 다이얼로그 열기 전, `parent_id = 현재 Summary id` 인 subtask 들 중 `planned_start_date` 가 가장 큰(NULL 제외) 행을 찾는 헬퍼를 사용.
  - 자식이 1개 이상 존재하면 그 자식의 값(`outstanding_work`, `location`, `work_type`, `main_trade`, `team`, `planned_start_date`, `planned_completion_date`, `weight`, `remarks`)을 다이얼로그에 prefill.
  - 자식이 없으면 부모(Summary) 값 사용.
- 스테이지별 그룹(`pre_engineering`, `physical_work`, `inspection`) 내부 리스트를 `planned_start_date` 오름차순(NULL 마지막)으로 정렬해서 렌더.

### 2) `src/components/punch/AddPunchSubtaskDialog.tsx`
- `defaults` props 를 확장하여 `planned_start_date`, `planned_completion_date`, `weight`, `remarks` 도 받도록 함.
- 다이얼로그가 열릴 때(또는 `defaults` 변경 시) 내부 state 를 `defaults` 값으로 초기화 — 현재는 mount 시 1회만 prefill 되므로 `useEffect([open, defaults])` 로 reset.
- 기존에 "기본 Stage = physical_work" 동작은 유지.

### 3) Raw Data 페이지 (`PunchRawDataPage.tsx`)
- Summary 아래의 자식 행 렌더 순서도 동일하게 `planned_start_date` 오름차순(NULL 마지막)으로 적용해 일관성 확보.
- 추가 데이터 페치 없이 클라이언트 정렬만 변경.

## 검증

- Subtask 0개 상태에서 Add Subtask → 부모 값이 prefill 되는지 확인.
- Subtask 추가 후 두 번째 Add Subtask → 가장 늦은 Planned Start 자식의 값이 prefill 되는지 확인.
- Detail / Raw Data 양쪽에서 자식 정렬이 Planned Start Date 오름차순인지 확인.
