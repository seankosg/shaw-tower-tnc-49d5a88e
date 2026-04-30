# Progress 탭 — 필터링된 Raw 행 Excel Export

## 목표
- T&C Progress (`/tc/progress`)와 Defect Progress (`/defects/progress`) 두 화면에서, 현재 툴바 필터가 적용된 데이터를 **행 단위 raw Excel**로 내보낼 수 있게 한다.
- 출력 포맷(헤더, 메타블록, 스타일, 날짜 셀, freeze, column widths)은 **Subtest Master List의 `exportSubtestsToExcel` / Defect Raw Data의 `exportDefectRawToExcel`과 동일**하게 사용한다.

## UX
- 기존 "Excel" 버튼(스케줄 매트릭스 export)은 그대로 유지하고 라벨을 "Excel (Matrix)"로 변경.
- 옆에 "Excel (Rows)" 버튼을 추가. 클릭 시 현재 필터링된 raw 행들을 즉시 다운로드.
- 행이 0개면 toast 경고.

## T&C Progress (SchedulePage)
- 사용 데이터: 페이지가 이미 로드한 `subtests` (또는 `filteredItems`) 배열 — `team`, `stageFilter`, `rangeStart..rangeEnd`, `asOfMode` 등 페이지 필터를 적용한 것과 동일한 행 집합.
- 헤더/필드: `useFieldConfig`로 가져온 `FieldConfigRow[]`의 표시 가능한 필드를 SubtestList와 동일한 순서로 사용 (메타필드 제외).
- 진입점: 새 함수 `exportSubtestsArrayToExcel(rows, fieldConfig, { sourceLabel, filterSummary, sortSummary, meta })` 를 `src/lib/excel-export.ts`에 추가. 내부적으로 기존 `exportSubtestsToExcel`의 본문을 공유 — react-table에 의존하던 부분(visibleCols/sortedRows/filterSummary/sortSummary)을 인자로 주입받는 형태로 리팩터.
- `sourceLabel`은 "Progress → Filtered (team=..., stages=..., range=..., asOf=...)" 형식의 한 줄로 빌드.

## Defect Progress (DefectProgressPage)
- 사용 데이터: 페이지의 `filteredItems` (team 필터 적용 후) 또는 추가로 stage/range를 만족하는 부분집합.
- 헤더/필드: `useDefectFieldConfig`의 `DefectFieldConfigRow[]` 사용. SubtestList 패턴과 동일하게 메타필드 제외, 기본 라벨 사용.
- 진입점: 새 함수 `exportDefectArrayToExcel(rows, fieldConfig, { sourceLabel, filterSummary, meta })` 를 `src/lib/defect-excel-export.ts`에 추가. `exportDefectRawToExcel` 본문을 동일 방식으로 공유.

## 필터 요약(텍스트)
- Progress 페이지의 상태값(team, stageFilter, asOfMode, rangeDays, hidePast, bucket, groupBy)을 그대로 한 줄 문자열로 직렬화하여 메타블록의 `Filters:` 라인에 기록.

## 변경/생성 파일
- `src/lib/excel-export.ts` — 공용 빌더 추출 + `exportSubtestsArrayToExcel` 추가
- `src/lib/defect-excel-export.ts` — 공용 빌더 추출 + `exportDefectArrayToExcel` 추가
- `src/pages/SchedulePage.tsx` — "Excel (Rows)" 버튼 + 핸들러
- `src/pages/DefectProgressPage.tsx` — "Excel (Rows)" 버튼 + 핸들러
- (필요 시) `src/lib/excel-export.ts` 내 메타블록/스타일/freeze/날짜 셀 처리 로직을 별도 헬퍼로 분리해 두 함수가 공유

## 비변경 사항
- 기존 매트릭스 Excel export 로직, Subtest Master / Defect Raw 페이지의 export, 데이터베이스, 권한 체계는 변경 없음.
- 신규 컬럼/필드 추가 없음.

## 검증
- 두 페이지에서 필터를 바꿔 가며 Export → 행 수 toast가 화면 행 수와 일치하는지, 헤더/날짜 포맷/freeze가 SubtestList(또는 DefectRawData) export와 동일한지 확인.
