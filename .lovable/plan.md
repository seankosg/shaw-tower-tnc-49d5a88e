## 목표

Punch Raw Data의 `progress_icon` 컬럼을 단일 아이콘 형태 그대로 유지하되, 다른 모듈(Subtest/Defect Raw Data)의 패턴을 차용하여 다음 3가지를 보강:

1. **Tooltip 강화** — Planned/Actual 날짜 + 진행률 표시
2. **컬럼 헤더 필터** — Planned / WIP / Delay / Completed 다중 선택
3. **테이블 하단 Legend** — 상태별 아이콘 의미 설명

단계(pip) 분할은 하지 않음. DB/Import/Export 로직 변경 없음. UI만 수정.

---

## 변경 파일

### 1) `src/lib/punch-progress-icon.ts` (확장)

- 기존 `computePunchProgressState` / `PUNCH_PROGRESS_*` 상수 유지.
- 추가 export:
  - `PUNCH_PROGRESS_STATES: PunchProgressState[]` — `['planned','wip','delay','completed']` (필터 옵션 순서)
  - `PUNCH_PROGRESS_BORDER: Record<PunchProgressState,string>` — 필터 칩 보더 색
  - 헬퍼 `getPunchProgressTooltipLines(row)` — Tooltip에 표시할 라인 배열 반환:
    - `State: <Label>`
    - `Progress: NN%` (actual_progress_pct가 null이 아닐 때)
    - `Planned Comp.: dd-MMM` (planned_completion_date)
    - `Actual Start: dd-MMM` (actual_start_date)
    - `Actual Comp.: dd-MMM` (actual_completion_date)
    - `delay` 상태일 때만 `Overdue by N day(s)` 한 줄 추가

### 2) `src/components/punch/PunchProgressLegend.tsx` (신규)

- `DefectStageProgressLegend` / `StageProgressLegend` 와 동일한 시각 톤(작은 회색 텍스트 + 아이콘 칩).
- 4개 상태(Planned / WIP / Delay / Completed)와 각각의 lucide 아이콘·색을 한 줄에 나열.
- 우측에 `Delay = past planned completion` 한 줄 보조 설명.

### 3) `src/pages/PunchRawDataPage.tsx`

**a. 셀 렌더링(`renderCell`의 `case 'progress_icon'`)**
- Tooltip 내용을 단순 라벨 → `getPunchProgressTooltipLines()` 다단 표시로 교체 (Defect Tooltip 스타일과 동일하게 `space-y-0.5`, muted 보조 텍스트).
- Subtask/Summary 행 모두 동일 렌더링 유지(현재 분기 그대로).

**b. 컬럼 필터(Subtest의 `StageProgressFilterDropdown` 패턴 축소판)**
- `progress_icon` 컬럼에 `filterFn: (row, _id, value: PunchProgressState[]) => !value?.length || value.includes(computePunchProgressState(row.original))` 부여.
- 헤더 우측에 작은 Funnel 아이콘 버튼 → Popover로 4개 상태 체크박스 + Clear 버튼.
- 현재 `isVirtualNoFilter` 분기에서 `progress_icon`을 제외하던 로직 수정: `progress_icon`은 가상 컬럼이지만 클라이언트 사이드 필터링은 허용. (DB 쿼리에는 영향 없음 — `getFilteredRowModel`만 사용).
- 활성 시 헤더 아이콘 강조(다른 필터와 동일 톤).

**c. Legend**
- 테이블 컨테이너 하단(페이지네이션 근처 또는 footer 영역)에 `<PunchProgressLegend />` 삽입. Subtest List의 배치 패턴 참고(`<div className="ml-auto">`).

---

## 영향 범위 / 비변경 항목

- DB·migration 없음
- `punch-excel-utils.ts`(import), `punch-excel-export.ts`(export) 변경 없음 — `progress_icon`은 가상 컬럼.
- 다른 페이지(Dashboard, Detail, Import) 영향 없음
- 권한/역할 가드 변경 없음
- 기존 `progress_icon` 컬럼 visibility / pinned 설정 유지

## 검수 포인트

- progress_icon 컬럼 헤더에 필터 아이콘이 보이고 4개 상태로 필터링되는지
- Tooltip에 진행률·날짜가 정확히 나오는지(null 안전)
- Legend가 테이블 하단에 한 줄로 표시되는지
- Summary 행/Subtask 행 모두 동일하게 동작
