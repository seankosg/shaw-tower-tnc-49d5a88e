# Excel 업로드 — 날짜 컬럼 텍스트 혼재 자동 파싱

## 현황

5개 파서가 각자 `normalizeDate`를 보유:

| 파일 | 현재 robust 수준 |
|---|---|
| `src/lib/defect-parser.ts` | ★★★ (slash/MMM-dd/clampReasonable 포함) |
| `src/lib/import-parser.ts` (Subtest) | ★ (`new Date()` fallback — TZ/garbage 위험) |
| `src/lib/docs-import-parser.ts` | ★ |
| `src/lib/docs-omm-import-parser.ts` | ★ |
| `src/lib/docs-warranty-import-parser.ts` | ★ |

문제:
- Subtest/Docs는 약한 파서로 `27-Apr` → `1970-01-01` 같은 오류 발생 여지
- 모든 파서가 텍스트 안에 날짜가 끼어 있는 경우(`"TBD 2026-05-18"`, `"submitted 27-Apr"`) 처리 불가
- 파싱 실패 시 조용히 `null`로 떨어져 사용자가 알지 못함

## 구현 계획

### 1. 공용 모듈 신설 — `src/lib/date-normalize.ts`

`defect-parser.normalizeDate` 로직을 추출 + 강화:

- **노이즈 필터**: `TBD`, `TBA`, `N/A`, `n/a`, `-`, `없음`, `pending` 등은 즉시 `null` (warning 없이 정상 skip)
- **JS Date 입력 지원**: xlsx `cellDates: true` 모드에서 들어오는 Date 객체 처리
- **Excel serial / ISO / dd-MMM / MMM-dd / DD/MM/YYYY** (기존 defect 로직)
- **임베디드 날짜 추출**: 전체 매칭 실패 시 문자열 안에서 ISO(`\d{4}-\d{2}-\d{2}`), dd-MMM-YYYY, 슬래시 패턴을 검색하여 첫 매치를 사용 (예: `"see remarks: 2026-05-18 revised"` → `"2026-05-18"`)
- **clampReasonable**: 연도 < 2000 또는 > 2099 거부
- **시그니처**:
  ```ts
  export type DateParseResult =
    | { date: string; mode: 'exact' | 'extracted' | 'serial' | 'noise' }
    | { date: null; mode: 'noise' | 'unparseable'; raw: string };
  export function normalizeDate(value: unknown): string | null;          // 기존 호환
  export function parseDate(value: unknown): DateParseResult;             // 신규 (warning 발행용)
  ```

### 2. 5개 파서 통합

각 파일에서 로컬 `normalizeDate`를 제거하고 신규 모듈을 import. `defect-parser.normalizeDate`는 기존 export를 유지하기 위해 신규 모듈로 위임하는 re-export로 변경.

영향 호출부 30곳은 시그니처가 동일하므로 수정 불필요.

### 3. Field log 경고 기록

각 importer가 row 변환 시 `parseDate`의 `mode: 'unparseable'` 결과를 수집하여 field_log에 기록:

- outcome: `rejected_invalid`
- reason_code: `unparseable_date`
- reason_detail: `Could not parse "{raw}" as a date`

수정 파일:
- `src/contexts/ImportContext.tsx` (Subtest)
- `src/contexts/DefectImportContext.tsx` (Defect)
- `src/lib/docs-import-workers.ts` (Docs/OMM/Warranty/Spare/ABD 공통 워커)

구현 패턴(파서 함수 시그니처 변경 최소화):
- `normalizeDate` 자체에 모듈 스코프 weak-warning 채널을 두지 않고, 각 파서의 row 빌드 함수가 `warnings: { field, raw }[]` 배열을 추가로 반환
- importer가 해당 배열을 `buildFieldLog(...)` 로 변환하여 기존 field_log 파이프라인에 합류

### 4. 테스트

- 신규 `src/test/date-normalize.test.ts` — 매트릭스:
  - `"TBD"`, `"N/A"`, `""` → null (noise)
  - `"2026-05-18"`, `"27-Apr"`, `"27-Apr-2026"`, `"3/5/2026"`, `45444`(serial) → 정상
  - `"see remarks: 2026-05-18"`, `"submitted 27-Apr-2026"` → extracted
  - `"2001-05-03"`, `"1899-12-30"` → null (clamp)
  - `"hello world"` → null (unparseable)
- 기존 `src/test/defect-parser-date.test.ts` 회귀 통과 유지

### 5. 검증

`src/lib/import-parser.ts`의 `parseSubtestRows` 같은 진입점에 텍스트 혼재 샘플 입력 → 결과 row + warnings 출력. (vitest 또는 단발 스크립트)

## 영향 범위 / 비영향

- **수정**: `src/lib/{date-normalize.ts(신규), import-parser.ts, defect-parser.ts, docs-import-parser.ts, docs-omm-import-parser.ts, docs-warranty-import-parser.ts}`, `src/contexts/{ImportContext.tsx, DefectImportContext.tsx}`, `src/lib/docs-import-workers.ts`, 신규 테스트 1개
- **비영향**: DB 스키마, RLS, export 로직, UI

## 완료 기준

1. `"TBD 2026-05-18"`, `"see notes 27-Apr-2026"` 같은 입력이 정확한 날짜로 파싱됨
2. `"TBD"`, `"N/A"` 단독 입력은 조용히 null (warning 없음)
3. `"hello world"`, `"!!!"` 같은 진짜 garbage는 import field log에 `unparseable_date` 경고로 기록
4. 모든 단위 테스트 통과 (defect 회귀 포함)
