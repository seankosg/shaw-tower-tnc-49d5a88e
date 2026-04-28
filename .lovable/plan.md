## 목표

T&C Raw Data의 Progress 아이콘(Pred → T1 → T2 3-pip 파이프라인)과 **시각적·로직적으로 동일한** 진행 표시기를 Defect Raw Data 표에도 추가합니다. 단계 매핑은 Defect 도메인에 맞춰 **Start → Completion → Closure**로 합니다. 대시보드에서 필터(`actualComplete`, `closureComplete`, `atRisk` 등)를 들고 들어와도 그대로 유지됩니다(현재 이미 동작 중 — 추가 작업 불필요, 확인 완료).

## 단계 매핑 (T&C ↔ Defect)

| T&C `StageProgress` | Defect 매핑 | 데이터 소스 |
|---|---|---|
| Predecessor (pred) | **Start** | `planned_start_date`, `actual_start_date`, cascade 적용 |
| T1 | **Completion** | `planned_completion_date`, `actual_completion_date`, `actual_progress_pct ≥ 100` |
| T2 | **Closure** | `planned_closure_date`, `actual_closure_date`, `closure_status ∈ {Done, Closed}` |

## 상태 분류 규칙 (T&C 동일)

각 단계마다 5가지 상태 중 하나로 분류 → 색상 pip로 표시:
- `done` — 단계 완료 (녹색 ●)
- `wip` — 진행 중 (앰버 ◐)
- `planned` — 계획됨, 미시작 (회색 ○)
- `hold`/`delay` — 계획일 지났는데 미완료 (빨강 ⊘)
- `empty` — 계획 자체 없음 (옅은 ○)

판정 로직(`asOfDate = dataDate` 기준):
1. `isStageDone(item, stage)` → `done` (cascade 적용: 하위 단계 done이면 상위도 done)
2. plan이 있고 plan < asOfDate인데 done 아님 → `hold` (delay)
3. completion_status / closure_status === `WIP` → `wip`
4. plan이 있고 done 아님 → `planned`
5. 그 외 → `empty`

`isStageDone`/cascade 로직은 이미 `src/lib/defect-dashboard-utils.ts`에 구현돼 있음 — 그대로 재사용.

## 구현 단계

### 1. 새 컴포넌트 `src/components/defects/DefectStageProgress.tsx`

T&C `StageProgress`를 그대로 fork하되:
- props를 Defect 필드로 교체 (`plannedStartDate`, `actualStartDate`, `plannedCompletionDate`, `actualCompletionDate`, `actualProgressPct`, `plannedClosureDate`, `actualClosureDate`, `closureStatus`, `completionStatus`, `asOfDate`)
- `classifyStage` 내부에서 `defect-dashboard-utils`의 `isStageDone`, `isStageDelayedAsOf` 사용
- pip 디자인/색상/툴팁 포맷은 T&C와 동일 (Done/WIP/Planned/Delay 라벨, `Delay as of <date>` 표기)
- 동일하게 `DefectStageProgressLegend` export

### 2. `DefectRawDataPage.tsx`에 컬럼 추가

- `DEFECT_RAW_FIELDS`에 `'stage_progress'`를 끼워 넣음 (현재 위치는 `closure_status` 바로 앞 — Status 그룹 시작 지점 권장)
- `useDefectFieldConfig`에서 `stage_progress`는 항상 visible로 처리(설정 페이지에 노출하지 않음) — `getLabel`은 `'Progress'` 폴백
- 컬럼 정의 추가: T&C와 동일하게 `enableColumnFilter: false`, `enableSorting: true`, `accessorFn`은 `(startDone?1:0)+(compDone?2:0)+(closureDone?4:0)` 비트마스크 정렬값
- `cell`에서 `<DefectStageProgress … asOfDate={dataDate} />` 렌더
- 헤더 영역(필터 칩 줄) 우측에 `<DefectStageProgressLegend />` 추가 (T&C `SubtestList.tsx` 1387행과 동일 패턴)

### 3. 컬럼 폭/순서/얼리기

- size: 110px (T&C와 동일)
- 사용자 column sizing/visibility 저장은 기존 localStorage 로직이 자동 처리 — 별도 조치 불필요

### 4. 대시보드 필터 유지

확인 결과 현재 `DefectRawDataPage`의 `filteredBaseData`(605-670행)가 `searchParams`를 직접 읽어 `actualComplete`, `closureComplete`, `overdue`, `atRisk`, `dueOn`, `unplannedActualOn`, `dateStart/dateEnd` 등을 모두 처리합니다. **추가 작업 없음.** Progress 컬럼은 단순 표시 컬럼이라 필터링 로직과 독립적입니다.

## 변경 파일

- 신규: `src/components/defects/DefectStageProgress.tsx`
- 수정: `src/pages/DefectRawDataPage.tsx` (컬럼 추가, legend 노출)

## 비고

- T&C `StageProgress`를 직접 재사용하지 않는 이유: props가 T&C 도메인(`predecessorRaw`, `t1Status`, `r1_status` 등)에 묶여 있어 의미가 안 맞음. 별도 컴포넌트가 코드 가독성에 유리.
- 모든 라벨은 영어(Start / Completion / Closure / Done / WIP / Planned / Delay) — 프로젝트 규칙 준수.
- 정렬 키는 "더 진행된 행이 아래로" 가게 비트마스크 사용 — T&C와 동일.
