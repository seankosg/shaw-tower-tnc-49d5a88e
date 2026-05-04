# Plan: Subcontractor별 Export — "Save to folder" 방식 추가

## Goal
Edge/Chrome의 다중 다운로드 차단을 우회하기 위해, Subcontractor별 .xlsx 파일을 **사용자가 선택한 폴더에 직접 저장**하는 옵션을 추가합니다. 파일은 분리된 상태로 유지되며 압축 해제도 필요 없습니다.

## UX 변경

Defect Raw Data → "Export Excel" 다이얼로그의 **Mode** 섹션을 다음과 같이 재구성:

```text
○ Single file
    Exports the current view as one .xlsx (N rows).

○ One file per Subcontractor — Save to folder…   [Chrome/Edge only]
    Pick a folder once; each Subcontractor is saved as a separate .xlsx
    in that folder. No download blocking, no zip extraction needed.

○ One file per Subcontractor — Download separately (legacy)
    Triggers N downloads. May be blocked by the browser if N > ~10.
```

- File System Access API 미지원 브라우저(Firefox / Safari)에서는 "Save to folder…" 옵션을 **disabled + 안내 문구**로 표시.
- 폴더 선택 시 동일한 파일명이 이미 있으면 자동으로 `..._2.xlsx`, `..._3.xlsx` 접미사를 붙여 덮어쓰기 방지.
- Export 진행 중에는 다이얼로그 내에 `n / total saved (subconName)` 형태의 진행 상태를 표시.
- 사용자가 폴더 선택 다이얼로그를 취소하면 안전하게 작업 중단 + "Cancelled" 토스트.
- 완료 시 토스트: `N file(s) saved to "<폴더명>"`.

## 기술 사양

### 1. `src/lib/defect-excel-export.ts`
- 신규 함수 `exportDefectRawToFolderBySubcontractor()`:
  - 시그니처: 기존 `exportDefectRawToExcelBySubcontractor`와 동일 옵션 + `dirHandle: FileSystemDirectoryHandle` + `onProgress?: (done, total, label) => void`.
  - 그룹핑/정렬 로직은 기존 함수와 동일하게 재사용 (헬퍼로 추출: `groupRowsBySubcontractor`).
  - 각 Subcontractor에 대해 `XLSX.write(wb, { type: 'array', bookType: 'xlsx' })`로 ArrayBuffer 생성 → `dirHandle.getFileHandle(name, { create: true })` → `createWritable()` → `write()` → `close()`.
  - 동일 파일명 충돌 시 `name (2).xlsx`, `name (3).xlsx`로 자동 변경.
  - 비동기 순차 처리(메모리 안정), 각 파일 완료 시 `onProgress` 호출.
  - 반환값: `{ fileCount, rowCount, folderName }`.
- 기존 `exportDefectRawToExcelBySubcontractor`는 **legacy로 유지**(라벨만 "Download separately (legacy)"로 변경).

### 2. `src/pages/DefectRawDataPage.tsx`
- `exportMode` 타입 확장: `'single' | 'per-subcon-folder' | 'per-subcon-download'`.
- 기능 감지 헬퍼:
  ```ts
  const supportsDirPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  ```
- 다이얼로그에서 "Save to folder" RadioItem은 `supportsDirPicker`가 false면 disabled + "Use Chrome or Edge to enable this option." 보조 문구.
- Export 핸들러 분기:
  - `per-subcon-folder` 선택 시:
    1. `const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'defect-raw-export' });`
    2. `AbortError` (사용자 취소) 캐치 → "Cancelled" 토스트 후 반환.
    3. `exportDefectRawToFolderBySubcontractor({ ..., dirHandle, onProgress })` 호출.
    4. 진행 상태를 `useState`로 다이얼로그 footer에 표시.
  - `per-subcon-download` 선택 시: 기존 함수 그대로 호출.
- 다이얼로그 닫기는 export 완료 또는 취소 후에만.

### 3. 타입
- File System Access API는 `lib.dom.d.ts`에서 일부 누락되어 있을 수 있음. `window as any` 캐스트로 처리하거나 좁은 범위의 ambient 타입을 `src/vite-env.d.ts`에 추가:
  ```ts
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
  }
  ```

### 4. 파일명 규칙
- 기존과 동일: `SHAW_Defects[_REIMPORT]_<sanitizedSubconName>_<timestamp>.xlsx`.
- 폴더 내 중복 발견 시 ` (2)`, ` (3)` 자동 부여.

## Out of Scope
- ZIP 다운로드 옵션은 이번에 추가하지 않음 (사용자 선택에 따라).
- 시트 분할(Single workbook with sheets) 옵션도 추가하지 않음.
- Docs 모듈 export는 이번 변경 대상이 아님 (필요 시 후속 작업).

## Validation Checklist
- [ ] Chrome/Edge에서 폴더 선택 → 20+ Subcontractor의 파일이 모두 정상 저장
- [ ] Firefox/Safari에서 "Save to folder" 옵션이 disabled 상태로 표시
- [ ] 사용자가 폴더 선택을 취소하면 다이얼로그가 정상 상태로 복귀
- [ ] View-friendly / Re-import ready 두 포맷 모두 새 모드에서 동작
- [ ] 동일 이름 파일이 폴더에 이미 있을 때 ` (2)` 접미사가 부여됨
- [ ] Export 도중 진행 상태가 다이얼로그에 표시됨
- [ ] 기존 "Download separately (legacy)" 동작은 변경 없이 유지됨
