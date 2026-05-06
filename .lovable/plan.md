## 목표

모든 Raw Data 페이지의 **Progress / Cycle Progress** 컬럼 헤더에 필터 드롭다운을 추가합니다. 현재 이 컬럼만 유일하게 필터가 없어서, 진행 단계로 행을 빠르게 좁힐 수 없는 상태입니다.

대상 페이지 (Spare Part / Warranty Raw Data 는 Progress 컬럼 자체가 없으므로 제외):

| 페이지 | 컬럼 ID | 컴포넌트 | 필터 옵션 |
|---|---|---|---|
| ABD Drawings (`DocsRawDataPage`) | `cycle_progress` | `DocsCycleProgress` | A, B, C, WIP, Under Review, Planned, S.Delayed, R.Delayed |
| OMM (`DocsOMMRawDataPage`) | `cycle_progress` | `OmmCycleProgress` | Pending Draft, Draft Under Review, Pending Final Submission, Final Under Review, Approved, Rejected |
| Defect (`DefectRawDataPage`) | `stage_progress` | `DefectStageProgress` | Not Started, In Progress, Completed, Closed, Delayed |
| T&C Subtest (`SubtestList`) | `stage_progress` | `StageProgress` | Not Started, T1 In Progress, T2 In Progress, R1 In Progress, R2 In Progress, Closed, Delayed |

## 변경 내용

각 컬럼별로 동일한 패턴을 적용합니다:

1. `enableColumnFilter: false` → `true` 로 전환.
2. 기존의 비트마스크용 `accessorFn` 을 셀에서 이미 사용 중인 헬퍼를 그대로 재사용해 **상태 라벨 문자열** 을 반환하도록 교체:
   - ABD → `computeOverallStatus(row, dataDate)` (이미 `src/lib/docs-status.ts` 에 존재)
   - OMM → `computeOmmStatus(row)` (이미 `src/lib/docs-omm-status.ts` 에 존재)
   - Defect → `DefectStageProgress` 의 `classifyStage` 와 동일한 규칙으로 (Done/WIP/Hold/Planned) 가장 진행된 단계로 단일 라벨 산출. 어느 한 단계라도 hold면 `Delayed`.
   - T&C → `StageProgress` 가 사용하는 `pred_status / t1_status / t2_status / r1_status / r2_status` 규칙을 그대로 따라 단일 라벨 산출.
3. `filterFn: multiSelectFilterFn` 과 `meta: { filterType: 'multi-select', filterOptions: [고정 옵션 목록] }` 부착 → 각 페이지에 이미 있는 `ColumnFilterDropdown` / `MultiSelectDropdown` 가 자동으로 헤더에 깔때기 아이콘 + 체크박스 드롭다운을 렌더링합니다. **신규 UI 컴포넌트 추가 없음.**
4. 정렬은 라벨 알파벳 순으로 동작 (필요하면 기존 비트마스크 정렬을 유지하도록 별도 `sortingFn` 도 가능 — 사용자 선호 시 즉시 전환).
5. 셀 표시는 기존 pip 파이프라인 그대로 유지. 헤더 아이콘만 추가됩니다.
6. 각 페이지가 이미 `localStorage` 에 `columnFilters` 를 저장/복원 하므로, 새 필터도 별도 코드 없이 새로고침 시 유지됩니다.

## 범위 외

- Spare Part / Warranty Raw Data 변경 없음 (Progress 컬럼 부재).
- Detail 페이지, 대시보드, 차트 범례 변경 없음.
- 기존 필터 칩 빌더 (`buildColumnFilterChips`) 가 자동 처리하므로 새 칩 로직 없음.

승인해 주시면 위 4개 페이지에 동일한 패턴으로 작업 진행하겠습니다.
