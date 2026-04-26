# Stage 다중 선택 구현 계획

매트릭스 상단의 Stage 필터를 단일 선택 Tabs에서 **다중 선택 가능한 Toggle 버튼 그룹**으로 변경합니다. 사용자는 Pred / T1 / T2 / R1S / R2S / R2A 중 원하는 단계를 자유롭게 켜고 끌 수 있게 됩니다.

## 동작 방식 (UX)

- **All 버튼**: 클릭 시 모든 단계 선택 (현재 동작 유지). 모든 단계가 켜진 상태와 동일.
- **개별 단계 버튼** (Pred, T1, T2, R1S, R2S, R2A): 클릭마다 on/off 토글. 다중 선택 가능.
- **최소 1개 보장**: 마지막 하나를 끄려고 하면 무시 (혹은 자동으로 All로 전환). → "마지막 하나 끄면 자동 All 전환" 방식 채택.
- 선택된 단계만 매트릭스에 행으로 표시되고, 진척률/Total/Done KPI도 선택된 단계 합계로 계산됩니다.
- URL 파라미터 `stage_view`는 콤마로 구분 (예: `stage_view=t1,t2,r1`). 모두 선택 시 파라미터 제거(=`all`).

## 기술적 변경 요약

### 1. 타입 확장 (`src/lib/schedule-utils.ts`, `src/lib/stage-metrics.ts`)
- `ScheduleStageFilter` 타입을 `'all' | ScheduleStage` → `'all' | ScheduleStage | ScheduleStage[]` 로 확장.
- `getStageKeys()` 가 배열 입력도 처리하도록 확장 (배열은 그대로 반환, 빈 배열은 ALL로 폴백).

### 2. SchedulePage 상태/URL (`src/pages/SchedulePage.tsx`)
- `stageFilter` state를 `ScheduleStage[]` 배열로 일원화 (내부적으로는 항상 배열). UI/직렬화 시점에만 `'all'` 처리.
- URL 파싱: `stage_view` 가 콤마 포함이면 split, 단일 값이면 `[value]`, `'all'` 또는 미지정이면 `ALL_STAGE_KEYS` 전체.
- URL 직렬화: 전체 선택이면 파라미터 제거, 일부면 콤마 join.
- `onCellClick(stage, ...)` 호출부: 단일 단계 한정 액션이므로 선택된 배열 길이가 1일 때만 해당 stage로, 다수 선택 시 `'all'` 로 전달 (현재 'all' 처리 로직 그대로 사용).
- Lookup "Go" 버튼: 선택된 단계가 정확히 1개일 때만 `params.stage` 추가, 다수면 stage 파라미터 생략.

### 3. Stage 필터 UI (`src/pages/SchedulePage.tsx`)
- 기존 `<Tabs>` 블록을 shadcn `<ToggleGroup type="multiple">` 으로 교체.
- "All" 별도 버튼은 좌측에 분리 (전체 선택 시 강조 표시), 나머지는 토글.
- 마지막 하나 해제 시 자동으로 ALL 복원.

### 4. ScheduleMatrix 표시 (`src/components/schedule/ScheduleMatrix.tsx`)
- `stagesToShow` 계산 로직을 배열 기반으로 변경.
- `showStageRows` 조건을 "전체 선택 OR 2개 이상 선택" 으로 변경하여 다수 선택 시에도 단계별 sub-row 표시.
- KPI/타이틀 라벨: 단일이면 해당 라벨, 다수면 선택 라벨 콤마 결합 (예: "T1, T2 progress / subtests"), 전체면 "All".

### 5. 진척률 계산 (`src/pages/SchedulePage.tsx` KPI)
- `getStageKeys(stageFilter)` 가 배열을 그대로 반환하므로 기존 합산 로직(`× stages.length`) 자동 호환.

### 6. 엑셀 내보내기 (`src/lib/schedule-excel-export.ts`)
- `stageFilter` 가 배열일 수 있도록 타입 동기화. 헤더 라벨/sub-row 표시 조건 동일하게 다수 처리.

### 7. 테스트 호환 (`src/test/dashboard-utils.test.ts`)
- 기존 `stageFilter: 't1'` 단일 값 호출은 그대로 동작하도록 함수 시그니처가 단일/배열/`'all'` 모두 수용.

## 비범위
- DB 스키마 변경 없음.
- Critical Watchlist, Lookup 의 단일 단계 가정 로직은 "다수 선택 시 stage 무필터" 로 폴백.
