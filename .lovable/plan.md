## 목표

전체 export 엑셀 파일에서 날짜 컬럼을 **진짜 Excel 날짜 셀(serial number + dd-mmm 형식)** 로 출력하여, Excel 이 해당 셀을 날짜로 인식하도록 한다. 이로써:
- 정렬/필터가 날짜 순으로 정확히 동작
- 사용자가 "TBD", "내일" 같은 텍스트 입력 시 셀 형식이 어긋나 시각적으로 즉시 구분
- 사용자가 다양한 날짜 형식("5/4", "May 4")을 입력하면 Excel 이 자동으로 dd-mmm 으로 변환

xlsx-js-style 라이브러리 한계로 진정한 Data Validation(잘못된 입력 차단 팝업)은 불가능. 위와 같은 약한 보호임을 사용자가 이미 인지하고 선택함.

## 변경 파일

### 1. 신규 파일

`src/lib/excel-date-cell.ts`
- `isoToExcelSerial(iso)`: ISO 날짜 → Excel serial number (1900 date system, 1899-12-30 epoch 사용)
- `isoTimestampToExcelSerial(iso)`: ISO 타임스탬프 → time fraction 포함 serial
- `DATE_NUMFMT = 'dd-mmm'`, `DATETIME_NUMFMT = 'dd-mmm-yyyy hh:mm'` 상수

### 2. Subtest export — `src/lib/excel-export.ts`

- `formatCellValue` 가 날짜 컬럼은 빈 문자열 외 더이상 변환하지 않게 하고, **raw ISO 를 보존**하는 분기 추가 (또는 별도 `getRawDateValue` 헬퍼 사용)
- `setCell` 시그니처 확장: `setCell(ws, r, c, value, style, opts?)` — `opts` 에 `numFmt` 와 `type: 'date'` 추가
- 데이터 row 작성 루프에서 `DATE_COLUMN_IDS.has(col.id)` 인 경우:
  - row.original 에서 raw ISO 추출
  - `isoToExcelSerial()` 변환
  - 성공 시 `{ t: 'n', v: serial, z: 'dd-mmm', s: { ...STYLE_DATA, numFmt: 'dd-mmm' } }`
  - 실패 또는 빈 값 시 빈 문자열 셀

### 3. Defect export — `src/lib/defect-excel-export.ts`

위와 동일한 패턴:
- `DATE_FIELDS` 6개 + `classified_at` → date serial
- `DATETIME_FIELDS` (`updated_at`, `created_at`) → datetime serial + `dd-mmm-yyyy hh:mm` 형식
- `view` 포맷과 `reimport` 포맷 모두 동일하게 진짜 날짜 셀로 출력
- `reimport` 포맷은 import 파서가 이미 Excel serial 을 처리할 수 있으므로 round-trip 안전

### 4. 기타 export 파일 검토

- `schedule-excel-export.ts`, `dashboard-excel-export.ts`, `defect-schedule-excel-export.ts`, `defect-dashboard-excel-export.ts`: 이 파일들은 **집계 데이터**(헤더에 "20-Jan", "20-Jan~26-Jan" 같은 bucket 라벨, 셀 값은 누적 카운트 숫자)이므로 "사용자가 직접 편집할 날짜 컬럼"이 없음. 헤더는 라벨 텍스트로 유지. 변경 불필요.
- `defect-export-utils.ts`: `defect-excel-export.ts` 의 헬퍼이므로 동일 변경 흐름에 포함되거나 영향 없음 — 확인 후 필요 시 동일 처리.

## 검증

1. Subtest Master DB export → T1/T2 planned/actual 컬럼이 Excel 에서 셀 클릭 시 "사용자 지정 (dd-mmm)" 형식으로 표시되는지 확인
2. Defect Raw Data export → 6개 날짜 컬럼 + classified_at, updated_at 동일 확인
3. 정렬: Excel 에서 날짜 컬럼 정렬 시 알파벳순(04-Apr 다음 04-Aug)이 아니라 시간순으로 정렬되는지 확인
4. Round-trip: export 한 파일에 임의로 "TEST" 텍스트 입력 → 다시 import 시 import 파서의 normalizeDate 가 그 행을 "정상 날짜 아님" 으로 처리하는지 확인 (현재 normalizeDate 는 invalid 입력에 null 반환)
5. 빈 날짜 셀이 빈칸으로 보이고 0(=1899-12-30) 으로 표시되지 않는지 확인

## 위험

- Excel serial 변환 시 timezone 문제: UTC 기반으로 통일 → DB의 ISO 날짜가 'YYYY-MM-DD' 형태이므로 안전
- 1900 leap-year bug: epoch 를 1899-12-30 으로 잡아 회피
- `xlsx-js-style` 의 `z` 속성 vs `s.numFmt` 속성: 둘 다 함께 지정해 호환성 확보
