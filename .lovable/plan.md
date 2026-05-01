## T&C Import — Column Select Dialog 추가

Defect Import의 "Select Columns" 다이얼로그(체크박스로 import 컬럼 선택)를 T&C Import 페이지에도 동일한 UX로 붙입니다.

### Defect 쪽 동작 (참고)

- `addFiles` 시 `getDefectExcelHeaders()`로 헤더만 먼저 빠르게 읽어 `availableHeaders` + `headerSamples` 보관
- 파일 카드에 "Select Columns (N/M)" 버튼 → 모달 오픈
- 모달에서 컬럼별 checkbox, "Select all / Deselect all / Reset" 등 액션, sample 미리보기, "Required" 뱃지(필수 필드 제외 시 경고)
- Apply 시 `excludedHeaders` 갱신 → 재파싱(`parseDefectExcel(file, sheet, excluded)`) → `excludedFields`(canonical 필드명) 도출 → import 단계에서 해당 필드의 변경 감지/감사/payload 작성을 스킵 → import 속도 향상

### T&C에 이식할 때의 차이점

1. **헤더 detection anchor가 다르다**
   - Defect: `issue_no` 1개로 헤더 행 식별
   - T&C: `item_no | subtest_id | mos_code | mos_1..mos_5` 중 하나
   - → 헤더 미리보기 함수도 T&C용으로 별도 구현 필요

2. **field config hook이 다르다**
   - Defect: `useDefectFieldConfig` (`isFieldRequired`, `getLabel`, `getSourceOrigin`, `getSourceLabel`)
   - T&C: `useFieldConfig` (`isFieldRequired`만 있음, label/origin 없음)
   - → ColumnSelectDialog는 **module-agnostic하게 일반화**하거나, T&C용 별도 dialog를 만들거나 둘 중 하나
   - 채택안: `ColumnSelectDialog` 시그니처를 props로 받도록 일반화 (parser-specific 로직 주입)

3. **필수 컬럼 정의가 다르다**
   - Defect: `issue_no`(시스템), Re-import 시 `id`, field config의 required
   - T&C: `item_no` + `mos_code`(또는 `subtest_id`)가 system, field config의 required 필드들. 또한 standard/legacy 판정에 필요한 키 컬럼들(`subtest_id`, `t1_planned_date`, `team` 등)을 빼면 import가 unknown으로 떨어질 수 있음 → 이런 컬럼은 "system required"로 잠금

4. **excludedFields 적용 지점**
   - 현재 T&C `processFile`은 `fields: [string, string|null][]` 배열로 일괄 update 빌드 → `excludedFields` set이 있으면 `fields.filter(([f]) => !excluded.has(f))` 한 줄로 적용 가능
   - 변경 감지/필드 로그/audit도 동일한 set을 참조해 스킵

### 변경 파일

**`src/lib/import-parser.ts`** — 헤더 미리보기 함수 추가
- `getTncExcelHeaders(file: File, sheetName?: string): Promise<{ headers: string[]; sample: Record<string, unknown>; sheetName: string; headerRowIdx: number } | null>`
  - 이미 있는 `detectTncHeaderRow` + `parseExcelFile`을 활용
  - `parseExcelFile` 결과의 `rawHeaders`와 첫 데이터 행을 묶어서 반환
- `parseExcelFile`에 `excludedHeaders?: string[]` 옵션 추가
  - 추가 처리 없이 그대로 두고, **excludedFields 적용은 ImportContext에서 한다** (parseExcelFile 출력은 그대로 두고 ImportContext가 excluded set을 참조)
  - 이유: 헤더 매핑 결과(`mappedHeaders`, `unmappedHeaders`)는 그대로 두는 게 detector(`detectImportType`)에 유리하므로

**`src/components/import/ColumnSelectDialog.tsx`** — 일반화
- 현재 hard-coded인 `toFieldName`(defect-parser) / `useDefectFieldConfig` 의존성을 props로 분리:
  - `toFieldName: (header: string) => string` — parser별로 주입
  - `getRequirement: (header: string) => Requirement` — module별 정책 주입 (or 전체 logic을 호출자에서 만들어 props로 전달)
  - `getSourceLabel?(field): string` / `getSourceOrigin?(field): 'hdec'|'aconex'|'system'` — optional, T&C에서는 미사용
  - "Aconex only / HDEC only" 빠른 액션 버튼 → optional 노출 (T&C는 숨김)
- 기존 Defect 호출부는 helper 객체를 만들어 `{ toFieldName, getRequirement, getSourceLabel, getSourceOrigin }`을 넘기는 방식으로 1줄 수정

**`src/contexts/ImportContext.tsx`**
- `ImportFileItem`에 추가:
  - `availableHeaders?: string[]`
  - `headerSamples?: Record<string, unknown>`
  - `excludedHeaders?: string[]` (default `[]`)
  - `excludedFields?: Set<string>` (canonical 필드명 set, derive)
- `addFiles` 흐름:
  - 시트 1개일 때: `parseAndApply` 직후 `availableHeaders`/`headerSamples` 같이 채우기 (parseExcelFile 결과 활용)
  - 시트 여러 개일 때: 시트 선택 후 동일하게 채우기 (`setFileSheet` 안에서)
- 새 메서드 `setFileExcludedHeaders(id, excluded)`:
  - 파일의 `excludedHeaders` 갱신 → `excludedFields` 재계산(`new Set(excluded.map(normalizeHeader))`) → 상태 patch
  - 재파싱은 불필요 (파싱 결과는 그대로, import 단계에서 필터링)
- `processFile` 내 `fields: [string, string|null][]` 빌드 직후 `excludedFields` 있으면 `fields = fields.filter(([f]) => !excludedFields.has(f))` 적용
  - 필드 로그(`fl(...)`)도 같은 set으로 스킵
  - changeLogs/audit 작성 부분도 `excludedFields.has(field)` 체크 추가

**`src/pages/ImportPage.tsx`**
- import 추가: `Settings2` 아이콘, `ColumnSelectDialog`, `useState` for `columnDialogFileId`
- 파일 카드의 컨트롤 줄(Sheet/Date/Team 옆)에 "Select Columns (N/M)" 버튼 추가 (`availableHeaders`가 있을 때만 노출)
- 모달 렌더 (DefectImportPage와 동일한 패턴)
- Required helper 정의 (T&C 정책):
  - `item_no`, `mos_code` 또는 `subtest_id` → system required
  - `useFieldConfig.isFieldRequired(field)` → config required
  - 메시지 한글 톤은 Defect와 일관되게 영어 유지(코어 룰: UI labels in English)

### 비목표

- DB 스키마/RLS 변경 없음
- Header Mappings(별칭) 관리 UI 변경 없음
- excludedHeaders는 파일별 1회성 — 영구 저장 없음 (Defect와 동일)

### 테스트 시나리오

1. SHAW_Subtests export 파일 업로드 → 25개 헤더 인식 → "Select Columns (25/25)" 버튼 노출
2. 모달에서 `__select`, `Progress` 체크 해제 → Apply → 버튼 라벨 "23/25"로 갱신, unmapped 경고 영향 없음
3. `item_no` 체크 해제 시도 → toast 경고 "required" + 적용은 가능하지만 모달 하단 경고 박스 표시
4. Execute Import → 제외된 필드는 update payload, 필드 로그, audit에서 빠짐 (DB query로 확인)
5. legacy(MOS-1~5) 파일 → 동일하게 동작, `mos_1` 등은 system required로 표시
6. 시트 변경 → `availableHeaders`/`headerSamples`도 새 시트 기준으로 갱신, `excludedHeaders` 초기화
