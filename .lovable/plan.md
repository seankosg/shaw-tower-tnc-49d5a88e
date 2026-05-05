# Docs Import에 Column Select 기능 추가 (T&C/Defect 동등)

## 목표
ABD/OMM Import 페이지에서도 T&C/Defect와 동일한 **"Select Columns"** 다이얼로그로 import할 컬럼을 선택할 수 있게 합니다. 사용자가 제외한 헤더는 import 시 무시되며, required 필드 제외 시 경고를 표시합니다.

## 현재 상태
- T&C: `TncColumnSelect` + `ColumnSelectDialog` + `setFileExcludedHeaders` (`ImportPage.tsx`)
- Defect: `DefectColumnSelect` + `ColumnSelectDialog`
- ABD/OMM: **선택 기능 없음** — 모든 헤더가 자동으로 import됨

## 변경 사항

### 1. 헤더 추출 함수 신설 (parser 2개)
- `src/lib/docs-import-parser.ts`에 `getDocsHeaderInfo(file, sheets?)` 추가:
  - `XLSX.utils.sheet_to_json` + `detectHeader()`로 모든 시트 헤더의 `composite` 라벨 + 첫 데이터 행 샘플 값 수집
  - 반환: `{ headers: string[]; samples: Record<string, unknown> }`
- `parseDocsExcel(file, sheets, options?)` 시그니처에 `options?: { excludedHeaders?: string[] }` 추가:
  - excluded에 포함된 composite 라벨은 `cols[].field`를 강제로 `null`로 설정 → payload/struct 모두 무시
- `src/lib/docs-omm-import-parser.ts`에도 동일 패턴으로 `getOmmHeaderInfo` + `parseOmmExcel(..., options?)` 추가

### 2. types/adapter 확장
- `src/contexts/docs-import/types.ts` `DocsImportFile`에 추가:
  - `availableHeaders?: string[]`
  - `headerSamples?: Record<string, unknown>`
  - `excludedHeaders?: string[]`
- `DocsImportContextValue`에 `setFileExcludedHeaders: (id: string, excluded: string[]) => Promise<void>` 추가
- `ImporterAdapter`에 `getHeaderInfo: (file, sheets?) => Promise<{ headers, samples }>` 추가
- `parseFile`은 3번째 인자 `options?: { excludedHeaders?: string[] }` 받음

### 3. Provider factory 업데이트
- `createDocsImportProvider.tsx`:
  - `addFiles`: 시트명 가져온 직후 `getHeaderInfo` 호출 → `availableHeaders`/`headerSamples` 저장
  - `parseAndApply`에 `excludedHeaders` 인자 추가, parser에 전달
  - `setFileExcludedHeaders(id, excluded)` 신설 → 상태 업데이트 후 재파싱

### 4. Adapter 2개 업데이트
- `src/lib/docs-import-workers.ts` `abdAdapter` / `ommAdapter`:
  - `parseFile` 시그니처에 `options` 추가 → parser에 그대로 전달
  - `getHeaderInfo` 메서드 추가 (위 1번 함수 호출)

### 5. 새 컴포넌트 `src/components/docs/import/DocsColumnSelect.tsx`
- `ColumnSelectDialog` 래퍼 (Defect/Tnc와 동일 패턴)
- ABD용 helpers: `toFieldName` = ABD parser의 `mapHeader` 호출, `isFieldRequired`는 `useDocsFieldConfig('as_built')` 사용, required 항목(예: `document_no`) 표시
- OMM용 helpers: 동일하지만 `useDocsFieldConfig('omm')` 사용, key는 `sn`
- `subModule` prop으로 분기

### 6. DocsImportShell UI 업데이트
- 각 파일 카드에 T&C와 동일한 "Select Columns (X/Y)" 버튼 추가:
  - `f.availableHeaders`가 있을 때만 표시
  - 클릭 시 `DocsColumnSelect` 다이얼로그 열기
- 다이얼로그 onApply → `importer.setFileExcludedHeaders(file.id, excluded)`

## 검증
1. ABD: SHAW export 파일 업로드 → "Select Columns (32/32)" 버튼 표시 → 클릭 시 모든 헤더 + required 표시 (`Document No` 강조)
2. 임의 컬럼 체크 해제 → 적용 → 카드에 `Select Columns (28/32)` 갱신 → Start import → 제외 컬럼은 DB에 반영되지 않음
3. `Document No` 제외 시도 → 경고 표시 (system required)
4. OMM도 동일 동작 — `SN` required

## 영향 범위
- 신규: `src/components/docs/import/DocsColumnSelect.tsx`
- 변경: 
  - `src/lib/docs-import-parser.ts` (header info + excluded option)
  - `src/lib/docs-omm-import-parser.ts` (동일)
  - `src/lib/docs-import-workers.ts` (adapter 2개)
  - `src/contexts/docs-import/types.ts`
  - `src/contexts/docs-import/createDocsImportProvider.tsx`
  - `src/components/docs/import/DocsImportShell.tsx`
- 무영향: 기존 T&C/Defect Import 흐름은 손대지 않음
