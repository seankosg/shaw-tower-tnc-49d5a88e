## 변경 사항

### 1. 라벨 변경 (`src/pages/DefectDashboardPage.tsx`)
- Line 1111: `Captured By — Defect Statistics` → `PM's Defect Statistics`
- Line 1082: `"Captured By"` → `"PM's Defect Statistics"` (no-data 메시지)

### 2. Excel 다운로드 버튼 (`src/pages/DefectDashboardPage.tsx`)
- CardHeader 우측 (line 1103~1116, 인원수 표시 옆)에 `Download className="h-3.5 w-3.5"` 아이콘 + `Excel` 텍스트의 `Button size="sm" variant="outline"` 추가
- collapse 토글 버튼과 분리(stopPropagation), `visibleRows` / `visibleTotals` / `activeTab` / `nameFilter` 기반으로 export 함수 호출

### 3. 신규 파일 `src/lib/defect-captured-by-export.ts`
- `xlsx-js-style` 사용, 기존 `excel-export.ts`의 `STYLE_TITLE / STYLE_META_LABEL / STYLE_META_VALUE / STYLE_HEADER / STYLE_DATA / setCell / FONT_NAME` 재사용
- 시트 구조 (다른 export와 동일한 시인성):
  ```
  Row 1: SHAW T&C — PM's Defect Statistics                        [TITLE 머지]
  Row 2: Exported: ... by {user} ({role})
  Row 3: Tab: {activeTab}
  Row 4: Name Filter: {names or (none)}
  Row 5: Rows: {n}
  Row 6: (blank spacer)
  Row 7: 그룹 헤더  [공백][By Quantity ×4][By Priority for Outstanding Items ×4]  (병합)
  Row 8: 컬럼 헤더  Name | Total | Completed | Closed | In Dispute | Total | Cat. A | Cat. B | No Cat.
  Row 9~: TOTAL 행 (visibleTotals, 강조 스타일) + 데이터 행
  ```
- 컬럼 폭 지정 (Name 28, 숫자 컬럼 12), freeze pane: ySplit=8, xSplit=1
- 숫자 셀은 `t:'n'` + 우측 정렬 스타일
- 파일명: `SHAW_PM_Defect_Statistics_YYYYMMDD_HHMM.xlsx`
- export 함수 시그니처:
  ```ts
  exportCapturedByToExcel({
    rows: VisibleRow[],
    totals: { total, completed, closed, dispute, priTotal, priCatA, priCatB, priNoCat },
    meta: { userName, userType },
    activeTab: string,
    nameFilter: string[],
  })
  ```

### 4. 사용자 메타데이터
- 기존 페이지가 이미 사용 중인 `useAuth` / 프로필에서 `userName`, `userType`(role)을 가져와 export 호출에 전달. 없으면 'Unknown' 폴백
