## Defect Raw Data — Export Excel: 단일 / Subcon별 분할 선택

### 변경 개요

현재 "Export Excel" 버튼은 즉시 1개 파일을 내려받음. 이를 **선택 다이얼로그**로 바꿔서 두 가지 모드 중 하나를 고를 수 있게 함:

```text
[ ] Single file (current view as-is)
    → SHAW_Defects_<ts>.xlsx
[ ] One file per Subcontractor
    → SHAW_Defects_<SubconName>_<ts>.xlsx  (필터된 결과의 subcontractor 별로 N개)
```

### UI 변경 (`src/pages/DefectRawDataPage.tsx`)

**1. 기존 버튼 onClick 교체**
- 즉시 export 대신 `setExportDialogOpen(true)` 만 수행
- "No rows" 검사도 다이얼로그 안으로 이동

**2. 신규 다이얼로그 (shadcn `Dialog` + `RadioGroup`)**
```text
Title: Export Defect Raw Data
Body:
  ◉ Single file
       Exports current view as one .xlsx (matches what you see).
  ○ One file per Subcontractor
       Splits filtered rows by Subcontractor → N files.
       Empty Subcontractor rows go to "Unassigned".
       Preview: <N> Subcontractors, <M> total rows
Footer:
  [Cancel]  [Export]
```
- Preview 의 N/M 은 현재 `table.getSortedRowModel().rows` 를 `subcontractor_name` 으로 group by 해서 실시간 계산.
- 선택값은 `useState<'single'|'per-subcon'>('single')`.

**3. Export 동작**

| Mode | 호출 |
|---|---|
| `single` | 기존 `exportDefectRawToExcel(...)` 그대로 |
| `per-subcon` | 신규 `exportDefectRawToExcelBySubcontractor(...)` |

성공 토스트:
- single: `<n> rows → <fileName>`
- per-subcon: `<k> files exported (<m> rows total)`

### 신규 함수 (`src/lib/defect-excel-export.ts`)

```text
exportDefectRawToExcelBySubcontractor<TRow>(opts: ExportDefectRawOptions<TRow>): {
  fileCount: number;
  rowCount: number;
  fileNames: string[];
}
```

내부 로직:
1. `table.getSortedRowModel().rows` 를 `row.original.subcontractor_name` (없으면 'Unassigned') 으로 group.
2. 각 그룹마다:
   - 동일한 헤더 / 메타 / 스타일 / freeze / 컬럼 너비 사용 (기존 `exportDefectRawToExcel` 와 동일 빌더 재사용 → 빌더를 헬퍼로 분리: `buildDefectWorkbook(rows, visibleCols, fieldConfig, meta, sourceLabel, ..., extraSourceSuffix)`).
   - 메타의 `Source:` 끝에 ` · Subcontractor: <name>` 덧붙임.
   - 파일명: `SHAW_Defects_<sanitizedSubcon>_<ts>.xlsx`
     - sanitize: `[^A-Za-z0-9._-]` → `_`, 30자 제한, 빈 값/공백은 `Unassigned`.
3. `XLSX.writeFile` 을 그룹마다 호출 (브라우저가 N개 다운로드 트리거).

리팩터:
- 기존 `exportDefectRawToExcel` 의 시트 빌드 부분(L213-303)을 내부 헬퍼 `buildDefectSheet({ rows, visibleCols, fieldConfig, meta, globalFilter, searchParams, sourceSuffix? })` 로 추출.
- 둘 다 동일 헬퍼 사용 → 스타일/freeze/컬럼 너비/메타 100% 일치.

### 변경하지 않는 항목
- `/defects/export` 페이지 (Advanced Export) 로직
- DB / RLS / Field Config / 컬럼 순서 / frozen 설정
- T&C SubtestList export

### 검증

```text
1. Export Excel 클릭 → 다이얼로그 표시, "Single" 기본 선택
2. Single 선택 + Export → 기존 동작과 동일 (파일 1개)
3. Per-Subcontractor 선택 → 미리보기에 "N Subcontractors, M rows"
4. 필터 없이 Per-Subcon Export → DB 의 모든 subcon 마다 1개씩 + Unassigned 1개
5. Subcontractor 컬럼 필터 적용 후 Per-Subcon → 해당 subcon 들만 분할
6. 파일명에 subcon 이름 포함 (특수문자 sanitize, 빈 값은 Unassigned)
7. 각 분할 파일도 헤더/메타/스타일/freeze 단일 export 와 동일
8. 메타의 Source 라인에 "· Subcontractor: <name>" 표시
9. 행 0 인 상태에서 Export 클릭 → "No rows to export" 토스트, 다이얼로그 안 열림
10. Cancel 클릭 → 다이얼로그 닫힘, 아무 일 없음
```

### 영향 받는 파일

```text
EDIT  src/lib/defect-excel-export.ts        (헬퍼 추출 + 신규 by-subcon 함수)
EDIT  src/pages/DefectRawDataPage.tsx       (다이얼로그 + 모드 분기)
```
