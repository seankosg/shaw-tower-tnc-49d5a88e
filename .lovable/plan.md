# ABD/OMM Raw Data 내보내기 → 재import 호환성 수정

## 원인 진단

업로드하신 `SHAW_Drawings_view_20260505_1442.xlsx`(ABD export)를 분석한 결과, 내보낸 파일이 import되지 않는 이유는 두 가지입니다.

### 1. 시트명 필터 불일치 (ABD 전용)
- ABD import는 시트명에 `"register"`가 포함된 시트만 인식 (`isRegisterSheet`).
- 내보낸 파일 시트명은 **`Drawings`** → 필터에서 제외.
- OMM import는 전 시트 허용 → 시트 필터 문제 없음.

### 2. 헤더 라벨이 import alias와 불일치 (ABD/OMM 공통)
ABD export 헤더(8행)에 다음 라벨이 있지만 alias 매칭 실패:

| 내보낸 라벨 | Import 매핑 | 현재 |
|---|---|---|
| `As Built DWG No` | `document_no` | ❌ ('as built dwg **number**'만 있음) |
| `1st Planned Submission` | `sub1_planned_date` | ❌ |
| `1st Actual Submission` | `sub1_submission_date` | ❌ |
| `1st Planned Response` | `sub1_approval_date` | ❌ |
| `1st Actual Response` | `sub1_actual_response_date` | ❌ |
| `1st Status` (2nd/3rd 동일) | `sub1_approval_status` | ❌ |
| `__select`, `cycle_progress`, `Risk` | skip | ❌ (unknown으로 잡힘) |

OMM export도 동일한 메타 6행 + 빈 행 + 헤더 8행 구조이고, `Draft Planned Date`, `Final Actual Date` 같은 export 라벨이 OMM parser alias와 불일치할 가능성 큼.

## 변경 사항

### A. `src/lib/docs-import-parser.ts` (ABD)

**A-1. 시트 필터 완화**
- `isRegisterSheet`에 `'drawings'` 키워드 추가. (export 파일명/시트명 패턴 호환)

**A-2. FIELD_ALIASES 보강**
- `'as built dwg no'`, `'as-built dwg no'` → `document_no`
- `'risk'`, `'cycle progress'`, `'__select'` → `skip`

**A-3. Sub-cycle 단일행 라벨 매핑** (export는 2행 그룹+서브 구조가 아닌 단일행 통합 라벨)
- `mapHeader()`에 정규식 추가:
  - `^(1st|2nd|3rd) planned submission$` → `subN_planned_date`
  - `^(1st|2nd|3rd) actual submission$` → `subN_submission_date`
  - `^(1st|2nd|3rd) planned response$` → `subN_approval_date`
  - `^(1st|2nd|3rd) actual response$` → `subN_actual_response_date`
  - `^(1st|2nd|3rd) status$` → `subN_approval_status`

**A-4. `__`로 시작하는 헤더는 자동 skip.**

### B. `src/lib/docs-omm-import-parser.ts` (OMM)

**B-1. OMM export 헤더 라벨을 OMM parser alias에 모두 등록.**
- 우선 OMM export 파일의 실제 헤더 라벨을 코드(`getOmmRawExportColumns` 또는 export util)에서 추출해 정확한 alias 목록 확정.
- 누락된 라벨(예: `Draft Planned Date`, `Draft Actual Date`, `Final Planned Date`, `Final Actual Date`, `Final Response Status`, `HDEC PIC`, `HDEC Eng`, `Subcontractor`, `Section`, `Category`, `Training Required`, `Hardcopy Required Qty`, `Hardcopy Actual Qty`, `PDF Required Qty`, `PDF Actual Qty` 등)을 alias 맵에 추가.

**B-2. OMM도 `__`로 시작하는 헤더와 `Risk`/`cycle_progress` 같은 시스템 컬럼 skip 처리.**

### C. Spare Part
- 현재 Spare Part는 **Excel import 기능이 구현되어 있지 않음** → 이번 작업 대상 아님. (필요 시 별도 요청으로 진행)

## 검증

1. ABD: 업로드한 `SHAW_Drawings_view_*.xlsx`를 ABD Import에 올려 시트 선택에 `Drawings` 표시 → Preview에서 모든 라벨이 정확히 매핑되는지 확인. Unknown header 0건.
2. OMM: OMM Raw Data에서 view 포맷으로 export → 같은 파일을 OMM Import에 다시 올려 모든 헤더가 매핑되고 upsert 성공하는지 확인.
3. Sub-cycle 데이터(1st/2nd/3rd) 값이 `sub1_*`/`sub2_*`/`sub3_*` 컬럼에 정확히 들어가는지 검증.

## 영향 범위

- 변경: `src/lib/docs-import-parser.ts`, `src/lib/docs-omm-import-parser.ts`
- 무영향: 기존 register/원본 import 파일은 alias가 추가만 되고 제거되지 않으므로 그대로 동작.
- 메모리: 별도 업데이트 불필요.
