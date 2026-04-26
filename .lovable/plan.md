# Defect 임포트 — 컬럼 선택(Include/Exclude) 기능 [최종 확정안 v3]

> 매핑 로직 / `FIELD_ALIASES` / 자동 정규화 **그대로 유지**.
> 추가: 엑셀 헤더 목록을 보여주고 **체크박스로 임포트할 컬럼만 선택**.
> **필수 컬럼은 기본 체크 + 해제 시 경고 표시(차단 X)**.

## 결정사항
- (a) DB 기록 안 함 — UI 세션에만 유지
- (b) Defect 임포트만 먼저
- (c) 기본값 = 전체 선택
- (d) 필수 컬럼은 기본 체크 + 해제 시 **경고만** (해제 자체는 허용)

---

## 1. "필수 컬럼" 정의

| 분류 | 조건 | 경고 메시지 (해제 시) |
|---|---|---|
| **시스템 필수** | `toFieldName(header) === 'issue_no'` | `"⚠ Issue No is required for header detection. Excluding it will likely cause the import to fail."` |
| **Re-import 필수** | reimport 마커 있음 + `toFieldName(header) === 'id'` | `"⚠ Excluding 'id' on a Re-import file will create new rows instead of updating existing ones."` |
| **Field Config 필수** | `defect_field_config.is_required = true` 인 필드로 매핑 | `"⚠ '{label}' is marked as required in Field Config. Excluding it may leave required fields empty."` |

## 2. UI 동작

```text
┌─ Select Columns: defect_q1.xlsx ─────────────────┐
│  [✓ Select all]                  [Reset]          │
│  ─────────────────────────────────────────────── │
│  ✓  Issue No              → issue_no    ★ Required│
│  ✓  Main Trade            → main_trade  ★ Required│
│  ✓  Area                  → area_raw              │
│  ✓  Cost Code             → (unmapped)            │
│  ☐  HDEC PIC              → hdec_pic_name         │
│  ...                                              │
│  ─────────────────────────────────────────────── │
│  ⚠ 'Main Trade' is marked as required. Excluding  │
│    it may leave required fields empty.            │
│                                                   │
│  Selected: 11/14  ·  Required excluded: 1         │
│         [Cancel]              [Apply]             │
└───────────────────────────────────────────────────┘
```

- 필수 행: 항상 ★ Required 배지 표시 (체크박스 자체는 활성)
- 사용자가 필수 컬럼 체크 해제 → **즉시 inline 경고 박스**(노란색, 다이얼로그 하단)에 누적 표시
- toast 알림도 1회 발생 (`toast.warning` from sonner)
- Apply 버튼은 활성 상태 유지 (차단하지 않음)
- 헤더 카운터에 `Required excluded: N` 표시로 시각적 환기

## 3. 코드 변경

### A. `src/lib/defect-parser.ts`
- 신규 export: `getDefectExcelHeaders(file, sheetName?)` → `{ headers, sample, isReimport }`
- 신규 export: `toFieldName`
- `parseDefectExcel(file, sheetName?, excludedHeaders?: string[])` — 세 번째 인자 추가. raw에서 제외 키 삭제 후 기존 흐름

### B. `src/contexts/DefectImportContext.tsx`
- `ImportFileItem`에 추가: `availableHeaders?`, `headerSamples?`, `excludedHeaders?: string[]`, `isReimport?: boolean`
- `addFiles` 흐름: 시트 확정 → `getDefectExcelHeaders` → 상태 저장 → `parseDefectExcel` 호출
- 신규 액션: `setFileExcludedHeaders(id, excluded)` → 자동 재파싱
- 시트 변경 시 `excludedHeaders` 초기화

### C. `src/components/import/ColumnSelectDialog.tsx` (**신규**)
- props: `headers`, `samples`, `defaultExcluded`, `isReimport`, `onApply`, `onCancel`
- `useDefectFieldConfig()`로 필수 필드 판정
- `getRequirement(header)` 헬퍼:
  ```ts
  const field = toFieldName(header);
  if (field === 'issue_no') return { required: true, reason: 'system', message: '...' };
  if (isReimport && field === 'id') return { required: true, reason: 'reimport', message: '...' };
  if (isFieldRequired(field)) return { required: true, reason: 'config', message: '...' };
  return { required: false };
  ```
- 체크 해제 핸들러:
  ```ts
  const onToggle = (header, nextChecked) => {
    const req = getRequirement(header);
    if (req.required && !nextChecked) {
      toast.warning(req.message);   // sonner
    }
    setExcluded(...);
  };
  ```
- 다이얼로그 하단에 현재 제외된 필수 컬럼들의 경고 누적 박스 (Alert 컴포넌트, variant=warning 스타일)
- area_raw 제외 시 안내: *"Excluding 'Area' will also clear Type/Level/Location"*

### D. `src/pages/DefectImportPage.tsx`
- 파일 행에 **"Select Columns (n/N)"** 버튼 (Settings2 아이콘)
- 헤더 로딩 전엔 disabled

## 4. 영향 파일

| 파일 | 종류 |
|---|---|
| `src/lib/defect-parser.ts` | 수정 |
| `src/contexts/DefectImportContext.tsx` | 수정 |
| `src/components/import/ColumnSelectDialog.tsx` | **신규** |
| `src/pages/DefectImportPage.tsx` | 수정 |

DB 마이그레이션 없음. T&C 임포트 변경 없음. 매핑 로직/별칭 사전 변경 없음.
