# Defect Raw Data Export — Cleanup & Auto-ZIP

## Goal
1. iframe에서 동작 불가능한 "Save to folder" 옵션을 **완전 제거**
2. "One file per Subcontractor — Download separately"를 단일 옵션으로 정리하되, **Subcontractor 수 ≥ 7이면 자동으로 ZIP 1개로 묶어 다운로드** (브라우저 다중 다운로드 차단 회피)

## Changes

### 1. `src/lib/defect-excel-export.ts`
- 기존 `exportDefectRawToFolderBySubcontractor()` 함수 **삭제**
- 관련 타입 `ExportDefectRawToFolderOptions` 및 헬퍼 `uniqueFileName()` **삭제**
- 신규 함수 `exportDefectRawToZipBySubcontractor<TRow>(opts)` 추가:
  - 동적 import: `const { default: JSZip } = await import('jszip')`
  - 그룹핑/정렬 로직은 기존 `exportDefectRawToExcelBySubcontractor`와 동일 (subcontractor_name, Unassigned 마지막)
  - 각 그룹 → `buildDefectWorkbook` → `XLSX.write({ type: 'array', bookType: 'xlsx' })` ArrayBuffer → `zip.file(name, buffer)`
  - 내부 파일명 규칙: `SHAW_Defects[_REIMPORT]_<sanitizedSubconName>_<ts>.xlsx` (중복 시 ` (2)`, ` (3)`)
  - ZIP 파일명: `SHAW_Defects[_REIMPORT]_BySubcontractor_<ts>.zip`
  - `zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })` → Blob → 임시 anchor click 다운로드
  - 반환: `{ fileCount, rowCount, zipFileName, fileNames }`

### 2. `src/vite-env.d.ts`
- `ShowDirectoryPickerOptions` 인터페이스 및 `Window.showDirectoryPicker` 선언 **삭제** (더 이상 사용 안 함)

### 3. `src/pages/DefectRawDataPage.tsx`

**Imports**
- import에서 `exportDefectRawToFolderBySubcontractor` 제거, `exportDefectRawToZipBySubcontractor` 추가

**State 정리**
- `exportMode` 타입을 `'single' | 'per-subcon'`로 축소 (디폴트 `'single'`)
- `exportProgress` state, `setExportProgress` 호출 모두 제거
- `isInIframe`, `hasDirPickerApi`, `supportsDirPicker` 모두 제거
- `exportBusy`는 ZIP 생성 중에도 사용하므로 유지

**Constants**
- `const ZIP_THRESHOLD = 7` (모듈 상단 또는 컴포넌트 내부)

**Dialog UI**
- "Save to folder" 라디오 항목 **블록 전체 삭제**
- 기존 "Download separately (Legacy)" 라디오 항목을 다음과 같이 갱신:
  - `value="per-subcon"`, `id="export-per-subcon"`
  - Label: `One file per Subcontractor` (Legacy 배지 제거)
  - 동적 안내문구:
    - `subconSet.size < 7`: `"Triggers ${subconSet.size} download${s} (one .xlsx per Subcontractor). Empty Subcontractor rows go to \"Unassigned\"."`
    - `subconSet.size >= 7`: `"${subconSet.size} Subcontractors detected — files will be packaged into a single .zip to avoid browser download limits. Empty Subcontractor rows go to \"Unassigned\"."` (text-amber-600 강조)
- `exportProgress` 표시 블록 삭제
- DialogFooter Cancel 버튼: `disabled={exportBusy}` 유지
- Export 버튼 라벨: `exportBusy ? 'Exporting…' : 'Export'`

**Export 핸들러**
- `else if (exportMode === 'per-subcon-folder')` 분기 **블록 전체 삭제**
- `else` (`per-subcon`) 분기를 다음으로 교체:
  ```ts
  } else {
    // per-subcon: < 7 → individual downloads, ≥ 7 → single ZIP
    if (subconSet.size >= 7) {
      toast({
        title: 'Packaging into ZIP',
        description: `${subconSet.size} Subcontractors detected — bundling into a single .zip to avoid browser download limits.`,
      });
      setExportBusy(true);
      const result = await exportDefectRawToZipBySubcontractor({
        table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta, format: exportFormat,
      });
      toast({
        title: 'Export complete',
        description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} bundled in ${result.zipFileName} (${result.rowCount} rows total)`,
      });
      setExportBusy(false);
      setExportDialogOpen(false);
    } else {
      const result = exportDefectRawToExcelBySubcontractor({
        table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta, format: exportFormat,
      });
      toast({
        title: 'Export complete',
        description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} downloaded (${result.rowCount} rows total)`,
      });
      setExportDialogOpen(false);
    }
  }
  ```
- Dialog `onOpenChange`의 `setExportProgress(null)` 호출 제거 (state 자체가 사라지므로)
- catch 블록의 `setExportProgress(null)` 제거

### 4. Dependency
- `jszip` 추가 (`bun add jszip`) — 이미 추가 완료 (jszip@3.10.1)

## Validation
- [ ] Subcontractor 1~6개: 개별 .xlsx 다운로드 (기존 동작)
- [ ] Subcontractor 7개 이상: 안내 토스트 표시 후 단일 .zip 다운로드, 압축 해제 시 모든 .xlsx 정상 열림
- [ ] view-friendly / re-import-ready 두 포맷 모두 ZIP 모드에서 동작
- [ ] Unassigned 그룹 포함 시 정상 처리
- [ ] iframe 프리뷰에서 ZIP 모드 정상 동작 (다운로드 1개라 차단 없음)
- [ ] "Save to folder" 옵션이 다이얼로그에서 완전히 사라짐
- [ ] 빌드/타입 에러 없음
