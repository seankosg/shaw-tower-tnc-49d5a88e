
## Defect Raw Data 에 T&C 형식의 Export Excel 추가

### 현황

```text
T&C SubtestList:
  [Import] [Export Excel ★ 화면에서 즉시 스타일 export] [Export → /export 페이지 이동]
  → exportSubtestsToExcel(table, fieldConfig, globalFilter, searchParams, meta)
  → 파일명: SHAW_Subtests_<ts>.xlsx
  → 시트: 제목 / Exported / Source / Search / Filters / Sort / 헤더 / 데이터
  → freeze panes (헤더+좌측 3컬럼), 컬럼 너비 자동, 셀 스타일 (제목/메타/헤더/데이터)

Defect Raw Data:
  [Import] [Export → /defects/export 별도 페이지로 이동만 함]
  → 화면 즉시 export 버튼 없음
```

### 변경 범위

**T&C 의 `exportSubtestsToExcel` 와 동일한 형식/로직을 Defect Raw Data 화면에서 즉시 동작하는 "Export Excel" 버튼으로 추가.** 기존 "Export"(별도 페이지) 버튼은 그대로 유지.

### 구현

**1. 신규 파일: `src/lib/defect-excel-export.ts`**

`src/lib/excel-export.ts` 와 동일한 구조로 작성하되 Defect 도메인에 맞게 조정:

- `exportDefectRawToExcel<TRow>(opts: ExportDefectRawOptions<TRow>)` — `exportSubtestsToExcel` 시그니처와 동일.
- `ExportDefectRawOptions`:
  ```text
  table: Table<TRow>
  fieldConfig: DefectFieldConfigRow[]    // useDefectFieldConfig().fields
  globalFilter: string
  searchParams: URLSearchParams
  meta: { userName: string; userType: string }
  ```
- 스타일 상수 (`STYLE_TITLE/META_LABEL/META_VALUE/HEADER/DATA`, `FONT_NAME='Calibri'`, 색상) — T&C 와 100% 동일.
- 메타 블록 7행: 제목 / Exported / Source / Search / Filters / Sort / blank, 그 다음 헤더 + 데이터.
- 제목: `'SHAW T&C — Defect Raw Data Export'`
- 파일명: `SHAW_Defects_<YYYYMMDD_HHMM>.xlsx`
- 시트명: `'Defects'`
- Freeze: `ySplit=8` (헤더 행), `xSplit = min(3, visibleCols.length)` — T&C 와 동일.
- 컬럼 너비: react-table `c.getSize() / 7` (T&C 동일 공식, min 8 / max 60).
- 라벨 helper: `DefectFieldConfigRow` 의 `display_name` 우선 → 없으면 `DEFECT_DEFAULT_FIELD_LABELS[id]` → 없으면 column header → id.

**2. Source label inference (Defect URL 파라미터 기준)**

T&C 는 `t1_status`, `subcon`, `at_risk_days` 등을 분기. Defect 도 동일 패턴으로 `searchParams` 로부터 라벨 도출:

```text
- ?team=Mech         → 'Defects → Team: Mechanical'  (formatTeamLabel)
- ?subcontractor=… → 'Defects → Subcontractor: …'
- ?subsub=…           → 'Defects → Sub-Sub: …'
- ?hdecPic=…          → 'Defects → HDEC PIC: …'
- ?status=… / ?closureStatus=… / ?level=… / ?mainTrade=… / ?subTrade=… / ?workType=… / ?classificationSource=… / ?issueNo=… / ?subcontractorIssueNo=…
- ?dateField=…&dateStart=…&dateEnd=… → 'Defects → <dateField label> = <range>'
- ?overdue / ?atRisk / ?actualComplete / ?closureComplete / ?stage 등 플래그성
- 없으면 'Defect Raw Data (direct)'
```

**3. Cell value formatter (UI 와 동일하게 export)**

화면 표시값과 일치시키기:
- `team` → `formatTeamLabel(value)` ('Mechanical' 등)
- `closure_status` / `status` / `completion_status` → 텍스트 값 그대로 (`'Planned' | 'WIP' | 'Done' | 'Delay'` 등)
- `planned_progress_pct` / `actual_progress_pct` → `formatPct(value)` ('45.0%')
- `classification_source` → 소문자 텍스트 그대로
- `*_date` (planned/actual + start/completion/closure), `classified_at` → `formatDdMmm(value.slice(0,10))`
- `updated_at` / `created_at` → `formatDdMmmYyyy(value)`
- 기타 → `String(value ?? '')`

**4. `src/pages/DefectRawDataPage.tsx` 수정**

- `useToast` import 추가.
- `useAuth()` 에서 `profile` 사용 (이미 user 만 사용 중 → profile 추가).
- `useDefectFieldConfig()` 의 `fields` 도 destructure.
- `USER_TYPE_LABELS` import (`@/types/enums`).
- 신규 `exportDefectRawToExcel` import.
- 헤더 영역 (현재 line 660-667) 에 **Export Excel** 버튼을 Import 와 Export 사이에 삽입:

  ```text
  [Import] [Export Excel ★ 신규] [Export → /defects/export]
  ```
- 버튼 onClick:
  ```text
  - table.getSortedRowModel().rows.length === 0 → toast destructive
  - try: exportDefectRawToExcel({ table, fieldConfig: fields, globalFilter, searchParams, meta:{userName, userType} })
  - 성공: toast 'Export complete' '<n> rows → <fileName>'
  - 실패: toast destructive
  ```

**5. 기존 "Export" 버튼 (→ `/defects/export`) 유지**

별도 advanced export 페이지(`DefectExportPage`)는 다른 워크플로우(컬럼 모드 선택, summary/info 시트) 라서 보존. T&C 도 두 버튼 공존.

### 변경하지 않는 항목

- DB, RLS, Edge Function
- `src/lib/excel-export.ts` (T&C용 그대로)
- `src/lib/defect-export-utils.ts`, `DefectExportPage.tsx` (Advanced export 워크플로우)
- Field Config / 컬럼 순서 / frozen 설정 / 필터 / 정렬 / 검색 로직
- 다른 Defect 페이지

### 검증

```text
1. /defects/raw-data 진입 → 헤더에 [Import] [Export Excel] [Export] 3개 버튼
2. 필터 없이 Export Excel 클릭 → SHAW_Defects_<ts>.xlsx 다운로드
   - Defects 시트 1개
   - 1행: 'SHAW T&C — Defect Raw Data Export' (title 스타일)
   - 2-6행: Exported / Source / Search / Filters / Sort 메타
   - 8행: 헤더 (현재 화면 visible 컬럼 + Field Config 순서)
   - 9행~: 데이터 (화면 표시값 = team 풀네임, status 그대로, % 포맷, 날짜 dd-MMM)
3. 검색어 입력 + 컬럼 필터 + 정렬 적용 후 export
   → 메타에 Search/Filters/Sort 요약 정확히 표시, 데이터도 필터/정렬 결과만 포함
4. URL ?team=Mech&dateField=planned_completion_date&dateStart=2025-01-01 진입 후 export
   → Source 라벨에 'Defects → Team: Mechanical' 또는 dateField 정보 노출
5. Field Config 에서 일부 컬럼 disable → export 헤더/데이터 모두 해당 컬럼 빠짐
6. 빈 결과에서 클릭 → 'No rows to export' 토스트
7. Freeze panes: 헤더 행 + 좌측 3개 컬럼 고정 (엑셀 파일 열어서 확인)
8. 모든 셀 스타일 (헤더 진한 배경, 데이터 얇은 보더) T&C 와 동일
```

### 영향 받는 파일

```text
NEW   src/lib/defect-excel-export.ts
EDIT  src/pages/DefectRawDataPage.tsx
```
