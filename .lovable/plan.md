# Priority 기준 카드 행 추가 (Defect Dashboard)

기존 2개 KPI 행 다음(그리고 Captured By 섹션 앞)에 **Priority 분류별 카드 행**을 추가합니다.

## 카드 구성 (4장)

| # | 카드 라벨 | 모집단(Priority 값) |
|---|---|---|
| 1 | **Total** | 현재 Team 필터가 적용된 `filteredItems` 전체 |
| 2 | **Cat. A** | `Cat A - Major Defect (Before SC)` |
| 3 | **Cat. B** | `Cat B - Minor Defect` |
| 4 | **No Cat.** | priority 가 비어있음(null/빈 문자열) |

각 카드 내부 표시:
- 상단: 라벨 + 모집단 **총 개수** (Total Count)
- 중단: **Completion** — `n / total`, 진도율 %, Progress 바 (primary 색)
- 하단: **Closure** — `n / total`, 진도율 %, Progress 바 (emerald 색)

진도율 = 해당 모집단 내에서 Completion/Closure 충족 건수 / 모집단 총 개수 × 100 (소수1자리). 기존 `isActualComplete` / `isClosureComplete` 헬퍼 재사용.

카드 클릭 → Raw Data 페이지로 이동, **현재 Team 필터 값을 항상 함께 전달**하고 priority 필터를 자동 적용 (Total 카드는 priority 필터 없이 Team만 전달). 내부 Completion / Closure 숫자 영역 클릭 시 Team + priority 필터에 `actualComplete=true` 또는 `closureComplete=true` 가 함께 적용.

## 레이아웃

```text
[Total] [Cat. A] [Cat. B] [No Cat.]
```

- `grid grid-cols-2 md:grid-cols-4 gap-3` (현재 KPI 행 톤과 일치)
- 카드 하나의 높이는 두 개의 Progress 바를 포함해야 하므로 기존 `KpiCard` 보다 약간 큼 → 신규 `PriorityCard` 컴포넌트로 분리 (같은 파일 안에 정의)

## 데이터 소스 / 팀 필터 연동

- 모집단은 **우측 상단 Team 필터가 적용된 `filteredItems`** 사용 — 기존 1·2행 KPI 카드와 동일한 dataset
- 즉 사용자가 Team 토글을 변경하면 4개 Priority 카드의 Total / Completion / Closure 수치와 진도율 바가 **즉시 재계산**됨 (별도 상태 없이 `useMemo` 의존성으로 `filteredItems` 사용)
- 카테고리 분류는 정확 일치(strict equality):
  - Cat A: `priority === 'Cat A - Major Defect (Before SC)'`
  - Cat B: `priority === 'Cat B - Minor Defect'`
  - No Cat: `!priority` (null / '' / undefined)
- Total 카드: 현재 Team 필터 적용된 `filteredItems` 전체
- Raw Data 드릴다운 시에도 현재 활성 Team 값을 `team` 파라미터로 함께 전달하여 동일 모집단 유지

> DB 조회 결과 위 3개 외 소수 이상값(`Cat B - Prior to SC` 1건, `High` 1건, `DONE` 1건)이 존재합니다. 사양상 어디에도 속하지 않으므로 **어느 카드에도 포함되지 않음**. (필요 시 후속 결정)

## Raw Data 연동 (드릴다운)

`DefectRawDataPage.tsx` 의 `urlMap`에 `priority: 'priority'` 추가. priority 가 비어있는 행을 거르기 위해 기존 `EMPTY_TOKEN` 패턴을 select 필터에도 지원하도록 분기 처리(이미 TEXT 필드용 EMPTY_TOKEN 처리 존재 — select용 처리 1줄 추가). 그리고 `DRILLDOWN_PARAMS`에 `priority` 추가.

링크 예시:
- Cat. A 카드: `?source=dashboard&priority=Cat A - Major Defect (Before SC)`
- No Cat. 카드: `?source=dashboard&priority=__EMPTY__`
- Total 카드: `?source=dashboard`

## 변경 파일

1. `src/pages/DefectDashboardPage.tsx`
   - `kpis` 계산 블록에 `byPriority` 집계 추가 (a / b / none 버킷별 total / completion / closure / pct)
   - 두 번째 KPI 행(`grid-cols-2 lg:grid-cols-5`) 바로 아래에 새 `<section>` 삽입
   - 파일 하단에 `PriorityCard` 헬퍼 컴포넌트 정의

2. `src/pages/DefectRawDataPage.tsx`
   - `urlMap` 에 `priority` 추가
   - `DRILLDOWN_PARAMS` 에 `priority` 추가
   - select 필터에서 `EMPTY_TOKEN` 값일 때 빈 priority 매칭 처리

비즈니스 로직 신규 추가는 없음 (기존 `isActualComplete` / `isClosureComplete` 재사용).
