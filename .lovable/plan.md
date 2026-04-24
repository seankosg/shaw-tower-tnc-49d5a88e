

## Defect Import — 시트 자동 스캔 + 헤더 행 자동 감지

### 목적

현재 `parseDefectExcel` 가 **첫 시트만**, **첫 행을 헤더로 가정**하여 파싱하기 때문에 다음 케이스에서 "No defect rows found" 오류 발생:
- 데이터가 두 번째 이후 시트에 있을 때
- 상단에 제목/병합 셀이 있고 실제 헤더가 2~5행에 위치할 때

### 동작 변경

```text
[시트 자동 스캔]
  workbook.SheetNames 를 순서대로 순회하면서
  "유효 헤더 + 1개 이상 데이터 행" 을 가진 첫 시트를 채택.
  유효 헤더 판정 = toFieldName 결과에 'issue_no' 가 포함된 행 존재.

[헤더 행 자동 감지]
  각 시트에 대해 sheet_to_json({ header: 1 }) 로 2D 배열 추출.
  상위 최대 10행을 스캔 → 'issue_no' 로 매핑되는 셀이 있는 첫 행을 헤더 행으로 채택.
  채택 후 그 행을 헤더로, 이후 행들을 데이터로 재구성한 객체 배열 생성
  (sheet_to_json({ range: headerRowIndex }) 사용).

[최종 결과]
  - 어떤 시트도 'issue_no' 헤더를 못 찾으면 → 명확한 오류 메시지:
      "No 'Issue No' column found. Scanned sheets: [Sheet1, Summary, Data]"
  - 헤더는 찾았지만 데이터 행이 0개면:
      "No data rows found in sheet '<name>' (header detected at row N)"
```

### 영향 받는 파일

```text
[수정] src/lib/defect-parser.ts
  - parseDefectExcel(file)
      1. workbook.SheetNames 루프
      2. 각 시트마다 detectHeaderRow(worksheet) 호출
      3. 'issue_no' 매핑되는 헤더 행 발견 + 데이터 ≥ 1행이면 채택, 즉시 break
      4. 채택된 시트로 sheet_to_json({ range: headerRowIdx, defval: '' }) 재호출
      5. rawRowNo 계산: index + headerRowIdx + 2 (Excel 행번호 보존)
      6. 미채택 시 throw new Error(상세 메시지)
  - 신규 helper:
      function detectHeaderRow(worksheet): { headerRowIdx: number; headers: string[] } | null

[수정] src/pages/DefectImportPage.tsx
  - 기존 "No defect rows found" 분기는 parseDefectExcel 가 throw 한
    오류 메시지를 그대로 사용자에게 표시하도록 변경 (catch 블록에서 err.message 노출).
```

### 변경하지 않는 항목

```text
- FIELD_ALIASES, toFieldName, parseArea 등 매핑 로직
- ParsedDefectRow 형태, headers 배열 구조
- 호출부 (DefectImportPage 의 parseDefectExcel 호출 시그니처)
- raw_payload 구조 (헤더 행 기준의 객체 그대로)
```

### 검증

```text
1. 첫 시트 1행이 헤더인 정상 파일 → 기존과 동일하게 파싱 (회귀 없음)
2. 데이터가 두 번째 시트에 있는 파일 → 두 번째 시트에서 자동 채택, 정상 import
3. 첫 시트 1~3행이 제목/병합 셀이고 4행이 헤더 → 4행을 헤더로 인식, 5행부터 데이터
4. rawRowNo 가 실제 Excel 행번호와 일치 (Import Logs 에서 클릭 시 정확한 행 추적)
5. 'Issue No' 컬럼 자체가 없는 파일 → 명확한 오류 메시지 + 스캔한 시트 목록 표시
6. 헤더는 있지만 데이터가 0행 → "header detected at row N" 메시지
```

