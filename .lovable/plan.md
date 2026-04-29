## 목표

Defect Raw Data와 T&C Raw Data(SubtestList) 두 페이지에서, **컬럼 헤더에서 건 필터**를 URL 필터 칩과 동일한 스타일로 표시하고, 칩 클릭 시 해당 필터만 개별 해제할 수 있도록 한다.

## 현재 동작 vs 목표

| | 현재 | 변경 후 |
|---|---|---|
| URL 필터 | 파란 배너 + 칩, 개별 해제 ✓ | 동일 유지 |
| 컬럼 필터 | `Clear filters (3)` 버튼 — 무엇이 걸렸는지 안 보임 | 컬럼별 칩 (예: `Status: WIP, Done ✕`, `Planned Start: 2026-01-01 ~ 2026-03-31 ✕`, `Description contains "leak" ✕`), 칩 클릭 → 해당 컬럼만 해제 |

## 구현 계획

### 1. 공통 헬퍼: `formatColumnFilterChip(columnId, value, columnDef)`
파일: 신규 `src/lib/filter-chip-utils.ts`

`columnFilters` 배열의 각 항목을 사람이 읽을 수 있는 라벨로 변환:
- **multi-select** (배열): `{label}: {값1, 값2}` (3개 초과 시 `값1, 값2 +N more`)
- **text** (문자열 또는 `{text, emptyOnly}`): `{label} contains "{text}"` 또는 `{label}: (empty only)`
- **date-range** (`{from, to, emptyOnly}`): `{label}: {from} ~ {to}` / `≥ {from}` / `≤ {to}` / `(empty only)`
- **progress** (`{text, emptyOnly}`): `{label}: {text}` 또는 `(empty only)`
- `EMPTY_TOKEN` 값은 `(empty)`로 치환

컬럼 라벨은 `column.columnDef.header`(문자열) 또는 `meta.label` fallback 사용.

### 2. Defect Raw Data — `src/pages/DefectRawDataPage.tsx`

라인 1036-1058 영역 수정:
- URL 필터 배너는 그대로 유지
- 그 아래 (또는 같은 영역)에 **컬럼 필터 칩 줄** 추가:
  ```
  Active column filters: [Status: WIP ✕] [Team: A, B ✕] [Planned Start: ≥ 2026-01-01 ✕]   Clear all
  ```
- 칩 클릭 핸들러: `setColumnFilters(prev => prev.filter(f => f.id !== chipId))`
- "Clear all" 버튼은 기존 `Clear filters (N)` 버튼을 대체 (또는 칩 줄 우측 끝으로 이동)
- 검색창 옆 `Clear filters (N)` 버튼은 제거 (칩 줄로 통합)

### 3. T&C Raw Data — `src/pages/SubtestList.tsx`

라인 1336-1353 (URL 필터 배너) 다음에 동일한 컬럼 필터 칩 줄 추가. 동일한 헬퍼 사용.

### 4. 스타일

기존 URL 필터 배너와 시각적으로 구분되도록:
- URL 필터 배너: `border-primary/30 bg-primary/5` (현재)
- 컬럼 필터 칩 줄: `border-muted bg-muted/30` + 칩은 `bg-secondary text-secondary-foreground`

너무 많을 때 (5개 이상) 줄바꿈은 `flex-wrap`으로 자연스럽게 처리.

## 변경 파일 요약

1. `src/lib/filter-chip-utils.ts` — 신규: 컬럼 필터 → 칩 라벨 변환 헬퍼
2. `src/pages/DefectRawDataPage.tsx` — 컬럼 필터 칩 영역 추가, 기존 `Clear filters (N)` 버튼 제거
3. `src/pages/SubtestList.tsx` — 동일 패턴 적용

## 영향 범위

- 두 Raw Data 페이지에서 어떤 컬럼에 어떤 필터가 걸려 있는지 한눈에 보이고, 칩 단위로 해제 가능
- 기존 URL 필터(대시보드 진입) 칩 동작은 변경 없음
- 테이블 데이터/필터 로직 자체는 변경 없음 (UI 표시 레이어만 추가)
