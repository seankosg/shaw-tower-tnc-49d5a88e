# T&C Raw Data — Per-Subcontractor Export with Auto-ZIP

## Goal
T&C Raw Data (`SubtestList.tsx`) 페이지의 "Export Excel" 기능을 Defect Raw Data와 동일한 UX로 확장:
- Single file 또는 One file per Subcontractor 선택 다이얼로그
- Subcontractor 수 ≥ 7이면 자동으로 단일 ZIP으로 묶어 다운로드 (브라우저 다중 다운로드 차단 회피)
- T&C에는 Re-import ready 포맷이 없으므로 **Format 섹션은 다이얼로그에서 제외**

## Changes

### 1. `src/lib/excel-export.ts`

**리팩토링 — `exportSubtestsToExcel` 내부를 헬퍼로 추출**
- 신규 내부 함수 `buildSubtestsWorkbook<TRow>(params)` — 기존 워크북/시트 조립 로직 전체 (AOA, merges, !cols, !rows, !freeze, !views, 셀별 스타일, date cell)
- 시그니처: `{ rows, visibleCols, fieldConfig, globalFilter, searchParams, meta, sourceSuffix?, _filterSummary?, _sortSummary? }` → `{ wb, rowCount }`
- `sourceSuffix` 있으면 Source 라인을 `<base> | <sourceSuffix>`로 표기 (예: `... | Subcontractor: HDEC`)
- 기존 `exportSubtestsToExcel`는 `summarizeFilters`/`summarizeSort` 호출 후 `buildSubtestsWorkbook`에 위임 (반환값/파일명 동일)
- 신규 헬퍼:
  - `timestampForFilename()` — `YYYYMMDD_HHMM`
  - `sanitizeForFilename(s)` — `[\\/:*?"<>|]+` 및 공백 치환, 80자 제한, 빈 문자열은 `Unnamed`
  - `groupSubtestRowsBySubcontractor(rows)` — `subcontractor_name` 기준, 빈 값은 `Unassigned`
  - `sortGroupKeys(keys)` — 알파벳 정렬, `Unassigned`는 마지막

**신규 함수**
- `exportSubtestsToExcelBySubcontractor(opts): { fileCount, rowCount, fileNames }`
  - 각 그룹 → `buildSubtestsWorkbook` → `XLSX.writeFile()` 개별 다운로드
  - 파일명: `SHAW_Subtests_<sanitizedSubcon>_<ts>.xlsx`

- `exportSubtestsToZipBySubcontractor(opts): Promise<{ fileCount, rowCount, zipFileName, fileNames }>`
  - 동적 import: `const { default: JSZip } = await import('jszip')`
  - 각 그룹 워크북 → `XLSX.write({ type: 'array', bookType: 'xlsx' })` ArrayBuffer → `zip.file(name, buffer)`
  - 동일 파일명 충돌 시 ` (2)`, ` (3)` 접미사
  - ZIP 파일명: `SHAW_Subtests_BySubcontractor_<ts>.zip`
  - `zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })` → 임시 anchor click 다운로드

### 2. `src/pages/SubtestList.tsx`

**Imports**
- `exportSubtestsToExcel` 외에 `exportSubtestsToExcelBySubcontractor`, `exportSubtestsToZipBySubcontractor` 추가
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`
- `RadioGroup`, `RadioGroupItem` from `@/components/ui/radio-group`
- `Label` from `@/components/ui/label` (이미 있다면 재사용)

**Constants**
- `const ZIP_THRESHOLD = 7;` (모듈 상단 또는 컴포넌트 내부)

**State**
- `const [exportDialogOpen, setExportDialogOpen] = useState(false);`
- `const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');`
- `const [exportBusy, setExportBusy] = useState(false);`

**Export 버튼 동작 변경**
- 기존 `onClick`(즉시 단일 export) → `onClick={() => { /* row 0 검사 */ setExportDialogOpen(true); }}`
- 행 0개일 때 토스트 분기는 그대로 유지 (다이얼로그 오픈 전)

**다이얼로그 (Defect와 동일한 패턴, Format 섹션 제외)**
- 위치: 기존 Export 버튼 아래(또는 컴포넌트 return JSX 적절한 위치)
- `subconSet` 계산 → `willZip = subconSet.size >= ZIP_THRESHOLD`
- Output 라디오 2개:
  1. `Single file` — "Exports the current view as one .xlsx file (N rows)."
  2. `One file per Subcontractor`:
     - `willZip=false`: "Triggers N download(s) (one .xlsx per Subcontractor). Empty Subcontractor rows go to \"Unassigned\"."
     - `willZip=true`: amber 텍스트, "N Subcontractors detected — files will be packaged into a single .zip to avoid browser download limits. Empty Subcontractor rows go to \"Unassigned\"."
- DialogFooter: Cancel / Export 버튼
- Export 버튼 라벨: `exportBusy ? 'Exporting…' : 'Export'`
- onOpenChange에서 `exportBusy`일 때 닫기 차단

**Export 핸들러 (Defect와 동일한 분기)**
```ts
if (exportMode === 'single') {
  const result = exportSubtestsToExcel({ table, fieldConfig, globalFilter, searchParams, meta });
  toast({ title: 'Export complete', description: `${result.rowCount} rows → ${result.fileName}` });
  setExportDialogOpen(false);
} else {
  // per-subcon: < ZIP_THRESHOLD → individual, ≥ → ZIP
  const sortedRows = table.getSortedRowModel().rows;
  const subconSet = new Set<string>();
  for (const r of sortedRows) {
    const raw = (r.original as any)?.subcontractor_name;
    subconSet.add(raw && String(raw).trim() ? String(raw).trim() : 'Unassigned');
  }
  if (subconSet.size >= ZIP_THRESHOLD) {
    toast({ title: 'Packaging into ZIP', description: `${subconSet.size} Subcontractors detected — bundling into a single .zip to avoid browser download limits.` });
    setExportBusy(true);
    const result = await exportSubtestsToZipBySubcontractor({ table, fieldConfig, globalFilter, searchParams, meta });
    toast({ title: 'Export complete', description: `${result.fileCount} files bundled in ${result.zipFileName} (${result.rowCount} rows total)` });
    setExportBusy(false);
    setExportDialogOpen(false);
  } else {
    const result = exportSubtestsToExcelBySubcontractor({ table, fieldConfig, globalFilter, searchParams, meta });
    toast({ title: 'Export complete', description: `${result.fileCount} file(s) downloaded (${result.rowCount} rows total)` });
    setExportDialogOpen(false);
  }
}
```
- `try/catch`로 감싸 에러 토스트 + `setExportBusy(false)`

### 3. Dependencies
- `jszip` — 이미 추가됨 (Defect export에서 사용 중)

## Out of Scope
- T&C용 Re-import ready 포맷 추가 (별도 작업)
- 다른 페이지(Docs raw data, Defect schedule revision 등) 동일 기능 적용 (요청 없음)

## Validation
- [ ] T&C Raw Data 페이지에서 "Export Excel" 클릭 시 다이얼로그 열림 (즉시 다운로드 X)
- [ ] Single file 선택: 기존과 동일한 단일 .xlsx 다운로드 (파일명 `SHAW_Subtests_<ts>.xlsx`)
- [ ] One file per Subcontractor + Subcontractor 1~6: 개별 .xlsx 다운로드
- [ ] One file per Subcontractor + Subcontractor ≥ 7: amber 안내 + 1개 .zip 다운로드, 압축 해제 시 모든 .xlsx 정상
- [ ] Unassigned 그룹 정상 처리 및 알파벳 정렬에서 마지막 위치
- [ ] 빈 행 시 다이얼로그 열리지 않고 토스트로 안내
- [ ] Source 라인에 `Subcontractor: <name>` 표기
- [ ] 빌드/타입 에러 없음
