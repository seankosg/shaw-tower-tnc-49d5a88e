# Punch Dashboard — Summary of Work 카드 필터 연결 점검

## 현재 동작 점검 결과

`Summary of Work` 섹션의 각 Critical Level 행(`CriticalLevelRowCard`)을 분석한 결과:

| 위치 | 현재 동작 | 정상 여부 |
|---|---|---|
| 행 전체 클릭(빈 공간/Level 라벨/Items 칩) | `?criticalLevel=<level>` → Raw Data에서 `critical_level` 컬럼 필터로 적용 | 정상 |
| `Material` / `Physical Work` / `Design` 칩 | 클릭 불가(단순 표시) — 행 클릭 시 carrying되지 않음 | 누락 |
| `Pre-Eng` 칩 (`preEngReady/total`) | 클릭 불가 | 누락 |
| `Earliest` / `Latest` 날짜 칩 | 클릭 불가 | 누락 |
| `Overall Progress` 바 | 별도 핸들러 없음(행 클릭으로만 동작) | 정상(의도된 동작) |

즉, **행 전체 드릴다운(criticalLevel)** 만 raw data로 정상 전달되고, 행 내부 세부 칩들은 어떤 필터도 전달하지 못합니다. 사용자가 "Material 70건"을 클릭해도 raw data에 Material만 남지 않습니다.

또한 PunchRawDataPage의 URL→컬럼 매핑(`urlMap`)에 `category1`이 정의되어 있지 않아, 향후 칩을 클릭 가능하게 만들더라도 단순히 `category1=Material`만 보내서는 필터가 걸리지 않습니다.

## 변경 계획

### 1) `CriticalLevelRowCard` 내부 칩을 클릭 가능하게

칩 단위로 드릴다운하도록 `MetaChip`에 `onClick` 옵션을 추가하고, 행 자체 클릭(`criticalLevel` 단독 필터)과의 이벤트 버블링을 차단합니다. 각 칩이 전달할 쿼리스트링은 항상 `criticalLevel=<level>`을 함께 포함하여, "이 Critical Level 안에서 이 항목" 의미를 유지합니다.

- **Material / Physical Work / Design 칩**
  - `?criticalLevel=<level>&category1=<name>`
- **Pre-Eng 칩**
  - `?criticalLevel=<level>&ready=true` (이미 `ready→pre_engineering_ready` 매핑 존재)
- **Earliest 칩** (요약의 가장 빠른 `planned_start_date`)
  - `?criticalLevel=<level>&dateField=planned_start_date&dateStart=<earliest>&dateEnd=<earliest>` — 해당 날짜로 시작되는 항목만
- **Latest 칩** (요약의 가장 늦은 `planned_completion_date`)
  - `?criticalLevel=<level>&dateField=planned_completion_date&dateStart=<latest>&dateEnd=<latest>`
- 값이 0이거나 날짜가 null인 칩은 비클릭(`cursor-default`, hover 효과 제거).

### 2) `PunchRawDataPage`의 URL→필터 매핑 보강

`urlMap`에 `category1: 'category1'`을 추가하여 `?category1=Material` 드릴다운이 컬럼 필터로 적용되도록 합니다. 동시에 `DRILLDOWN_PARAMS` 목록에도 `category1`을 추가하여, 드릴다운 진입 시 기존 로컬스토리지 필터를 무시하고 깨끗하게 적용되도록 합니다.

(나머지 파라미터 `criticalLevel`, `ready`, `dateField/dateStart/dateEnd`는 이미 지원됨 — 변경 불필요.)

### 3) 칩 UI 폴리시

`MetaChip`이 `onClick`을 받으면:
- `role="button"`, `tabIndex={0}`, `Enter` 키 처리
- `hover:bg-muted/60`, `cursor-pointer` 추가
- 부모 행 클릭 막기 위해 `e.stopPropagation()`

행 자체의 시각적 affordance는 그대로 유지(전체 행 hover/클릭 → criticalLevel 단독).

## 영향 범위 / 무영향 보장

- 수정 파일은 2개:
  - `src/pages/PunchDashboardPage.tsx` (`CriticalLevelRowCard`, `MetaChip` 시그니처)
  - `src/pages/PunchRawDataPage.tsx` (`urlMap`, `DRILLDOWN_PARAMS`에 `category1` 추가)
- Defect / Docs / T&C 모듈 무영향.
- 기존 `criticalLevel=` 단독 클릭 동작은 그대로(회귀 없음).
- 백엔드/RLS/스키마 변경 없음.

## 기술 세부사항

- `CRITICAL_LEVEL_ORDER`에 `mid-Low` 등 하이픈 포함 값이 있어 이미 `encodeURIComponent`로 인코딩 중 — 변경 없음.
- 날짜 칩의 `dateStart=dateEnd=<같은 날>`은 raw data의 `dateRangeFilterFn` 의미상 그 날 하루만 일치하므로 "가장 이른 시작일을 가진 항목"만 노출하는 의도와 일치.
- `Pre-Eng` 칩에서 `preEngReady=0`이면 클릭 비활성화(필터링해도 0건).
