## T&C Import — Header Row Auto-Detection (Defect와 동일 로직 이식)

현재 `parseExcelFile()`은 **첫 시트의 1행을 무조건 헤더로 가정**합니다. 헤더 위에 타이틀/메타 행이 있거나 헤더가 다른 시트에 있으면 import가 실패합니다. Defect 모듈이 사용하는 자동탐지 방식을 이식해 동일한 유연성을 제공합니다.

### 동작 변경 요약

| 항목 | Before | After |
|---|---|---|
| 헤더 행 위치 | 1행 고정 | 위에서부터 최대 20행 스캔, 키 컬럼이 있는 행 자동 인식 |
| 시트 선택 | 첫 시트 또는 사용자 선택 시트만 | 헤더 미발견 시 다른 시트 자동 시도 (사용자 미지정 시) |
| 헤더 위 메타 행 | 매핑 깨짐 | 무시하고 진행 |
| `(H)` 등 마커 | 정규화 영향 받음 | `cleanHeader` 적용으로 흡수 |

### 키 컬럼 (헤더 행 판별 기준)

T&C는 Defect의 `issue_no`와 달리 단일 필수 컬럼이 없습니다. 구조 신호 중 하나라도 매핑되는 행을 헤더로 판정:

- `item_no` — 필수에 가까움 (모든 import 형식 공통)
- `subtest_id` — standard 형식
- `mos_code` — standard 형식
- `mos_1` ~ `mos_5` — legacy 형식

→ 위 중 하나라도 normalize 결과가 일치하는 셀이 행에 있으면 헤더로 채택.

### 변경 파일

**`src/lib/import-parser.ts`**
- `cleanHeader(raw)` 추가: `(H)` 등 트레일링 마커 제거 (Defect 패턴 차용, 정규화 전 전처리)
- `HEADER_SCAN_LIMIT = 20` 상수
- `detectTncHeaderRow(ws)`: Defect와 동일하게 `sheet_to_json({ header:1, blankrows:true })`로 매트릭스 받아 위에서부터 스캔. 각 행의 셀들을 `normalizeHeader`로 매핑한 결과에 `item_no | subtest_id | mos_code | mos_1..mos_5` 중 하나라도 있으면 그 행을 헤더로 채택.
- `parseExcelFile(buf, sheetName?)` 재작성:
  1. 사용자가 `sheetName` 지정 → 그 시트만 스캔, 미지정 → 모든 시트 순회
  2. 시트마다 `detectTncHeaderRow` 시도, 성공한 첫 시트 채택
  3. 채택된 시트에서 `headerRowIdx` 부터 `sheet_to_json`으로 데이터 읽어 기존 `rows / mappedHeaders / unmappedHeaders` 형태로 반환
  4. 헤더만 있고 데이터 0행인 시트는 fallback 후보로 보관 → 다 실패하면 명확한 에러("헤더는 찾았으나 데이터 행 없음")
  5. 어떤 시트에도 키 컬럼이 없으면 **기존처럼 1행을 헤더로 사용하는 폴백** 유지 (하위호환). 단 `unmappedHeaders`가 모두 비어있으면 사용자에게 "헤더 행을 자동 탐지하지 못했습니다" 경고가 뜨도록 결과 메타에 포함.
- `ParseExcelResult`에 선택적 필드 추가:
  - `resolvedSheetName?: string` — 실제로 채택된 시트 이름
  - `headerRowIdx?: number` — 0-based 채택 행 (UI 표시용)
- 기존 export 시그니처(`rows`, `rawHeaders`, `mappedHeaders`, `unmappedHeaders`)는 **유지** → 호출자 무중단.

**`src/contexts/ImportContext.tsx`**
- `parseAndApply`에서 `resolvedSheetName`을 받아 `selectedSheet`에 반영 (사용자가 시트 미지정이었어도 어떤 시트가 채택됐는지 노출)
- 다중 시트일 때 기존처럼 사용자 선택 UI는 유지하되, **자동탐지로 헤더가 있는 시트가 1개뿐이면 자동 선택**하도록 `addFiles` 흐름 보강 (Defect 동작과 일치)

### 비목표 / 변경 없음

- DB 스키마, RLS, 헤더 매핑 테이블 변경 없음
- Defect 로직 자체는 손대지 않음
- legacy/standard 분기(`detectImportType`), 행→subtest 변환(`parseLegacy/parseStandard`) 변경 없음
- Excel export 로직 변경 없음

### 테스트 시나리오

1. 기존 정상 파일(1행 헤더, 단일 시트) → 결과 동일
2. 1행이 "Project: SHAW Tower" 같은 타이틀, 2~3행이 메타, 4행이 헤더 → 4행 헤더로 자동 인식되어 정상 import
3. 시트 2개 중 첫 시트는 cover, 두 번째 시트가 데이터 → 두 번째 시트 자동 채택
4. 어떤 행에도 키 컬럼이 없는 파일 → 기존처럼 1행 헤더 폴백, unmapped 다수 표시
5. legacy(MOS-1~5) 파일 → `mos_1` 키로 헤더 인식되어 동작
