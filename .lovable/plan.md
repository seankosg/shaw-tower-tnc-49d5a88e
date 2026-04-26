## 의도 확인

> "CTO를 선택" → **"시트를 선택"** 의 오타로 해석했습니다. 즉, 엑셀 파일에 시트가 2개 이상이면 어느 시트를 임포트할지 사용자가 고를 수 있게 하는 기능입니다. (해석이 다르다면 알려주세요)

---

## 현재 동작

| 임포트 종류 | 현재 시트 처리 방식 | 위치 |
|---|---|---|
| **T&C (Subtest)** | 무조건 **첫 번째 시트** (`wb.SheetNames[0]`) 사용 | `src/lib/import-parser.ts` L289 |
| **Defect** | 모든 시트 순회하며 `Issue No` 컬럼 있는 **첫 번째 시트** 사용 | `src/lib/defect-parser.ts` L364 |

→ 두 경우 모두 사용자가 시트를 선택할 수 없음. 시트 1개만 있으면 문제 없지만, 여러 시트가 있을 때 의도와 다른 시트가 임포트될 수 있음.

---

## 변경 사항

### 1. `src/lib/import-parser.ts`
- `parseExcelFile(file, sheetName?)` — 두 번째 인자로 시트 이름 받도록 확장 (기본값: 첫 시트)
- 새 함수 `getExcelSheetNames(file: ArrayBuffer): string[]` — 시트 목록만 빠르게 추출

### 2. `src/lib/defect-parser.ts`
- `parseDefectExcel(file, sheetName?)` — 두 번째 인자로 시트 이름 받도록 확장 (기본: 현재 로직 = `Issue No` 자동 감지)
- 새 함수 `getDefectExcelSheetNames(file: File): Promise<string[]>` — 시트 목록 추출

### 3. `src/contexts/ImportContext.tsx`
- `ImportFileItem`에 `sheetNames?: string[]`, `selectedSheet?: string` 필드 추가
- `addFiles` 흐름:
  1. 파일을 ArrayBuffer로 읽음
  2. 시트 목록 추출
  3. **시트 1개**: 기존대로 즉시 파싱 → `status: 'ready'`
  4. **시트 2개 이상**: 시트 목록만 채우고 `status: 'pending_sheet_selection'` (신규 상태) → 사용자 선택 대기
- 새 액션 `setFileSheet(id: string, sheetName: string)`:
  - 선택된 시트로 재파싱 → `status: 'ready'`로 전환

### 4. `src/contexts/DefectImportContext.tsx`
- 동일하게 `sheetNames`, `selectedSheet` 추가
- 동일하게 다중 시트 시 사용자 선택 대기 흐름

### 5. `src/pages/ImportPage.tsx` & `src/pages/DefectImportPage.tsx`
- 파일 행에 시트 선택 UI 추가:
  - 시트가 1개면 표시 안 함 (현재 UI 유지)
  - 시트가 2개 이상이면 **Select 드롭다운**으로 시트 선택 노출
  - 선택 후 자동 재파싱
- `pending_sheet_selection` 상태 배지/메시지 표시 ("시트를 선택하세요")
- 시트 선택 전에는 Start Import 버튼이 해당 파일을 무시 (또는 비활성)

### 6. 신규 상태값
- `FileStatus`에 `'pending_sheet_selection'` 추가 (양쪽 컨텍스트 공통)

---

## UI 동작 시나리오

1. 사용자가 시트 3개짜리 엑셀 업로드
2. 파일 행에 **"시트 선택 필요"** 배지 + **시트 선택 드롭다운** (Sheet1 / Sheet2 / Sheet3) 표시
3. 시트 선택 → 자동 파싱 → `parsedCount` 표시 + 기존 import 흐름 진입
4. 시트 1개 파일은 종전과 동일하게 즉시 파싱

---

## 영향 범위

- 신규 파일 0개, 수정 파일 4개 (parser 2개, context 2개, page 2개 = 총 6개)
- 시트 1개인 파일은 동작 변화 없음 (회귀 위험 최저)
- 시트 자동 감지 로직(Defect)은 **기본값**으로 유지하되, 사용자가 명시적으로 선택하면 그 값을 우선

---

## 다음 단계

이대로 진행할까요? 아니면 "CTO 선택"이 다른 의미였다면 알려주세요 (예: "팀 = CTO 부서 선택", "체크 옵션 추가" 등).