## 목표

T&C Raw Data 의 Progress 컬럼 필터를 **단일 라벨 multi-select** 에서 **5단계 × 4상태 다중선택** 형태로 업그레이드합니다. 사용자가 "T2가 Delayed인 행" + "R1이 WIP 또는 Done인 행" 같은 복합 조건을 한 번에 걸 수 있게 됩니다.

다른 페이지(ABD/OMM/Defect)는 현재 단일 라벨 필터 그대로 유지합니다.

## 필터 모델

```
{ pred?: State[], t1?: State[], t2?: State[], r1?: State[], r2a?: State[] }
where State = 'Done' | 'WIP' | 'Planned' | 'Delayed'
```

- 단계 내부 = OR (Done 또는 WIP)
- 단계 간 = AND (T2 조건 통과 AND R1 조건 통과)
- 어떤 단계도 선택 안 하면 필터 OFF
- 행의 단계 상태 산정은 `StageProgress`의 `classifyStage`와 동일한 규칙(`isStageDone` / `isStageDelayedAsOf` / `Hold`/`WIP`/`Submitted`/`Under Review`/`Planned` 매핑) 재사용
- `as of` 날짜는 페이지의 `dataDate`(없으면 오늘) 기준

## UI

`Progress` 컬럼 헤더의 깔때기 아이콘 → Popover 안에 5개 단계 카드 (Predecessor / T1 / T2 / R1 / R2A). 각 카드는:
- 4개 상태 체크박스(2열 그리드: Done, WIP, Planned, Delayed)
- 카드별 `All` / `None` 단축 버튼
- 상단에 전체 `Clear all`

활성화 시 깔때기 아이콘이 primary 색으로 표시되고, 기존 `buildColumnFilterChips` 가 자동으로 `Progress: T2(Delayed), R1(WIP, Done)` 형태의 칩을 만듭니다(아래 참조).

## 변경 파일

1. **`src/pages/SubtestList.tsx`**
   - `StageProgressFilterDropdown` 컴포넌트 추가 (위 UI).
   - `stageProgressFilterFn` 추가 — 단계별 상태 평가 후 AND/OR 매칭.
   - `ColumnFilterDropdown` 의 분기에 `filterType === 'stage-progress'` 케이스 추가.
   - `stage_progress` 컬럼 정의에서 `filterType: 'multi-select'` → `'stage-progress'`, `filterFn: stageProgressFilterFn`, `accessorFn`은 정렬용 비트마스크로 복원(이전과 동일).

2. **`src/lib/filter-chip-utils.ts`**
   - `formatColumnFilterChip` 에 stage-progress 객체 형태 (`{ pred?: [], t1?: [], ... }`) 인식 분기 추가:
     - 예: `Progress: T2(Delayed), R1(WIP, Done)`
   - 다른 객체 필터(date-range / text / number)와 충돌하지 않도록 stage 키(`pred|t1|t2|r1|r2a`)가 하나라도 있을 때만 이 분기를 탑니다.

## 동작 예시

- T2 Delayed만: `{ t2: ['Delayed'] }` → 칩 `Progress: T2(Delayed)`
- T1 Done + R1 WIP/Done: `{ t1: ['Done'], r1: ['WIP', 'Done'] }` → 칩 `Progress: T1(Done), R1(Done, WIP)`
- 모두 비우면 필터 해제, localStorage에 저장돼 새로고침 후 유지.

## 범위 외

- ABD / OMM / Defect Progress 필터는 직전 작업의 단일 라벨 multi-select 유지.
- 기존 URL 기반 필터(`?status=overdue` 등) 동작에는 영향 없음.

승인해 주시면 위 두 파일만 수정해 적용합니다.
