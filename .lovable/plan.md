## 변경 목적
Import 시 classifier 가 매칭에 실패한 행(`source = 'unclassified'`)이 현재 `main_trade='Unclassified'`, `sub_trade='Unclassified'`, `work_type='Review Required'` 라는 **placeholder 문자열**을 DB 에 저장하고 있습니다. 사용자 요청에 따라 이 값을 **빈 칸(NULL)** 으로 유지하도록 변경합니다. "Unclassified" 라는 글자도 어떤 필드에도 쓰지 않습니다.

## 현재 동작 (참고)
- `src/lib/defect-classifier.ts` 의 `UNCLASSIFIED` 상수가 위 세 placeholder 문자열을 반환.
- `DefectImportContext.tsx` L734–736 에서 Excel·DB 가 모두 비어 있을 때 classifier 결과(= placeholder)를 그대로 row 에 채워 넣음.
- 결과: 새 행은 빈 칸이 아니라 "Unclassified / Unclassified / Review Required" 로 저장됨.
- Detail 페이지의 "Auto-classify" 버튼도 같은 classifier 를 호출하므로 동일한 문제 발생.

## 변경 내용

### 1. `src/lib/defect-classifier.ts`
- `UNCLASSIFIED` 상수의 세 필드(`main_trade`, `sub_trade`, `work_type`)를 모두 빈 문자열 `''` 로 변경.
- `source: 'unclassified'` 와 `matched_id: null` 은 그대로 유지 (분류 통계, 필터, 요약 카드는 계속 동작).

### 2. `src/contexts/DefectImportContext.tsx` (L734–736 부근)
- classifier 결과를 row 에 적용하는 줄을 `value || null` 로 정리하여, 빈 문자열도 DB 에 NULL 로 저장되도록 보장:
  ```ts
  if (!excelHasMain) row.main_trade = existing?.main_trade ?? classification?.main_trade ?? null;
  ```
  → classifier 가 `''` 을 반환할 때 `''` 대신 `null` 이 들어가도록 보강 (빈 문자열을 falsy 처리).
- `unclassified++` 카운터와 row log (`reason_code: 'unclassified_defect'`) 는 **그대로 유지** — import 결과 요약은 변하지 않음.

### 3. `src/pages/DefectDetailPage.tsx` (Auto-classify 버튼, L497)
- classifier 가 `''` 를 돌려주면 form 에도 `null` 이 들어가도록 정리:
  - `work_type: c.work_type || null`
  - `main_trade`, `sub_trade` 는 이미 `cur.X || c.X` 패턴이므로 빈 문자열도 자연스럽게 비어있는 상태가 됨 → 추가로 `|| null` 보강.
- toast 메시지에서 `c.work_type` 이 빈 문자열일 경우를 위해 `${c.source}` 만 표시 (예: "Auto-classified: unclassified").

## 영향 범위 / 영향 없음
- **영향 없음**:
  - `classification_source` 컬럼 값('unclassified')과 그 필터(`/defects/raw-data?classificationSource=unclassified`, Export 페이지의 Classification 필터, Import 결과 카드의 Unclassified 카운트) 모두 그대로 동작.
  - 기존 DB 에 이미 저장돼 있는 placeholder 문자열은 건드리지 않음 (필요 시 별도 1회성 정리 작업 가능).
- **영향 받는 기능**: 신규 import / Detail 페이지에서 Auto-classify 시, 매칭 실패한 trade 필드는 빈 칸으로 저장됨.

## 영향 받는 파일
- `src/lib/defect-classifier.ts`
- `src/contexts/DefectImportContext.tsx`
- `src/pages/DefectDetailPage.tsx`
- `src/test/defect-classifier.test.ts` (테스트의 `expect(r.work_type).toBe('Review Required')` 부분을 `expect(r.work_type).toBe('')` 로 수정)

## 선택 사항 (사용자 확인 필요)
이미 DB 에 저장돼 있는 기존 행의 `'Unclassified'` / `'Review Required'` 값을 한 번에 NULL 로 정리할지 여부 — 원하시면 1회성 마이그레이션을 추가하겠습니다. (요청에 명시되지 않아 기본값은 **건드리지 않음**.)
