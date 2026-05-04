## Goal

ABD Raw Data 엑셀 내보내기에서 헤더/메타/데이터 셀 디자인을 기존 T&C(Subtest) 모듈의 엑셀 내보내기 스타일과 동일한 룩으로 통일합니다. 재임포트(reimport) 포맷의 동작 자체는 유지합니다.

## Current vs Target

**현재 (`src/lib/docs-excel-export.ts`)**
- 메타 5줄 + 빈 줄 + 헤더 + 데이터의 단순 AOA
- 스타일은 헤더 셀 `bold`만 적용
- 컬럼 너비는 `title=40, remarks=30, 그 외=16`로 고정
- 병합/프리즈/행 높이/보더/배경색 없음

**T&C 패턴 (`src/lib/excel-export.ts` 참고)**
- 0행: 진한 네이비 배경의 타이틀 밴드 (`STYLE_TITLE`)
- 1~5행: 회색 배경의 메타 라벨/밸류 (`STYLE_META_LABEL`, `STYLE_META_VALUE`)
- 6행: 얇은 스페이서
- 7행: 슬레이트 배경 + 흰색 굵은 글씨 헤더 + 보더 (`STYLE_HEADER`)
- 8행~: 좌측 정렬, 얇은 회색 보더 데이터 셀 (`STYLE_DATA`)
- 메타 행은 마지막 컬럼까지 가로 병합, 첫 N개 컬럼 + 헤더 행 프리즈
- 행 높이(`!rows`), 컬럼 너비(`!cols`), 시트 범위(`!ref`)까지 명시

## Plan

### 1. `src/lib/docs-excel-export.ts` 재작성

T&C `buildSubtestsWorkbook`과 동일한 레이아웃을 ABD용으로 적용:

- **공통 스타일 상수 import** — `excel-export.ts`의 `STYLE_TITLE / STYLE_META_LABEL / STYLE_META_VALUE / STYLE_HEADER / STYLE_DATA`, 그리고 `setCell / setDateCell` 헬퍼를 export 가능하도록 노출하고 docs export에서 그대로 사용 (단일 소스 오브 트루스 유지). 대안으로는 docs-excel-export 안에 로컬 상수로 복제할 수 있지만, 향후 디자인 변경 시 한 곳만 고치도록 export 방식을 권장.
- **AOA 구성** (T&C와 동일한 8행 구조):
  ```
  Row 0: 'SHAW As-Built Drawings — Raw Data Export'
  Row 1: `Exported: YYYY-MM-DD HH:MM  by  {userName} ({userType})`
  Row 2: `Source: ABD Raw Data (direct)`  (reimport이면 ' | Reimport Template' 접미어)
  Row 3: `Search: "{globalFilter}"` 또는 `(none)`
  Row 4: `Filters: {요약}`  — 컬럼 필터가 있으면 `displayName=value` 조인, 없으면 `(none)`
  Row 5: `Sort: {요약}`  — 정렬 상태 요약, 없으면 `(default)`
  Row 6: 빈 행
  Row 7: 헤더 행 (display label)
  Row 8+: 데이터 행
  ```
- **reimport 마커 유지**: `[Format: SHAW_DOCS_REIMPORT_V1]`는 export 직후 import에서 인식해야 하므로, Source 라인 뒤에 동일 텍스트로 추가하거나 별도 라인으로 유지. 기존 import 파서가 어느 셀을 스캔하는지 확인 후 위치 결정 (현재 파서는 단순히 텍스트 포함 여부 체크 — 문제 없음).
- **컬럼 너비**: T&C처럼 react-table의 `column.getSize()` 기반 자동 산출 (`Math.max(8, Math.min(60, Math.round(px / 7)))`). 단, ABD에는 `getSize`가 일부 지정되어 있지 않을 수 있어 fallback으로 `title=40`, `remarks=30`, 날짜=12, 그 외=16 유지.
- **행 높이/병합/프리즈**:
  - Row 0 hpt 24, Row 1~5 hpt 16, Row 6 hpt 6, Row 7 hpt 28, 데이터 행 hpt 20
  - Row 0~5는 마지막 컬럼까지 가로 병합 (`!merges`)
  - 헤더 아래 + 좌측 ID 컬럼 영역 프리즈 (`xSplit = min(2, n)`, `ySplit = 8`) — ABD는 ID 컬럼이 `document_no`이므로 2 컬럼 정도가 적절
- **셀 적용**:
  - Row 0: `STYLE_TITLE`
  - Row 1: `STYLE_META_LABEL`, Row 2~5: `STYLE_META_VALUE`
  - Row 7: 각 헤더 셀에 `STYLE_HEADER`
  - 데이터 셀: 기본 `STYLE_DATA`, 날짜/타임스탬프는 `setDateCell` + `DATE_NUMFMT`/`DATETIME_NUMFMT`
- **`!ref`**를 `A1:{lastCol}{lastRow}`로 명시.

### 2. 필터/정렬 요약 헬퍼

T&C의 `summarizeFilters` / `summarizeSort` 로직을 docs용으로 작은 헬퍼로 포팅 (필드명 → display_name 매핑은 `fieldConfig` 사용). 코드 분량이 작으므로 `docs-excel-export.ts` 내부에 로컬 정의.

### 3. 호출 측 변경 없음

`DocsRawDataPage.tsx`의 `exportDocsRawToExcel(...)` 호출 시그니처는 유지. 내부적으로만 출력 디자인이 바뀜.

### 4. 적용 범위

이번 라운드는 **ABD (`docs-excel-export.ts`) 한정**. OMM / Spare Part / Warranty의 Raw Data 페이지는 아직 자체 export 함수가 없는 상태이므로 후속 작업에서 동일 빌더를 재사용하도록 합니다 (Phase 2 공통 컴포넌트 추출 시 `buildDocsWorkbook` 함수로 추가 일반화).

## Out of Scope

- 컬럼 자동 너비 학습/조정, 인쇄 영역, 머리글/바닥글, 조건부 서식
- 재임포트 포맷의 컬럼 구성 변경 (ID 컬럼/편집 컬럼 분리 로직은 그대로)
- OMM / Spare Part / Warranty의 export (다음 라운드)

## Acceptance

- ABD Raw Data 페이지에서 Export → Download 시 다운로드된 xlsx 파일이 T&C Subtest export와 시각적으로 동일한 헤더 밴드/메타 영역/헤더 셀 색상/보더/프리즈를 가짐
- 날짜 컬럼은 Excel native date로 표시되며 정렬 가능
- 재임포트 포맷으로 다운로드 후 Import 페이지에서 정상적으로 인식됨
