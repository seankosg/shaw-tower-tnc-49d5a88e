## 목표
Punch Import에서 업로드 파일의 컬럼이 `0/0 cols mapped`로 표시되는 문제를 수정해, 현재 파일처럼 1행이 비어 있고 2행이 실제 헤더인 엑셀도 정상적으로 자동 매핑되게 합니다.

## 확인된 원인
업로드된 파일은 실제 헤더가 2행에 있습니다.
현재 `src/lib/punch-excel-utils.ts`의 헤더 탐지 로직은 `sheet_to_json(..., blankrows: false)`로 상단 행을 읽고 있어, 빈 1행이 제거된 상태의 인덱스를 `range`에 그대로 재사용하고 있습니다.
그 결과:
- 탐지 단계에서는 2행 헤더를 `index 0`으로 인식
- 실제 파싱 단계에서는 `range: 0`으로 다시 읽음
- 빈 1행부터 읽히면서 헤더가 `__EMPTY_*`로 생성
- UI에서는 mapped header가 0개로 보임

즉, 매핑 테이블 문제가 아니라 Punch 전용 헤더 행 좌표 계산이 잘못된 문제입니다.

## 구현 계획
1. **Punch 헤더 탐지 로직을 Defect/TNC 방식으로 정렬**
   - `punch-excel-utils.ts`에 헤더 탐지 helper를 분리합니다.
   - 탐지용 스캔은 `blankrows: true`로 바꿔 실제 시트 좌표를 유지합니다.
   - 스캔 범위도 다른 import 모듈과 동일하게 더 넉넉하게 잡아 제목/빈 행/메타행이 있어도 대응하게 합니다.

2. **탐지된 실제 헤더 행부터 파싱하도록 수정**
   - 탐지된 `headerRowIdx`를 그대로 `range`에 사용해 올바른 헤더 행에서 JSON을 생성합니다.
   - 현재의 `excludedHeaders`, `headerMap`, `headerSamples`, `selectedSheet` 동작은 그대로 유지합니다.

3. **업로드된 파일 케이스로 회귀 검증 가능하게 정리**
   - 이번 파일처럼 `1행 blank + 2행 header` 패턴에서 `Item No`, `Outsanding Works`, `Level`, `Location` 등이 정상 인식되도록 검증합니다.
   - 가능하면 같은 유형이 다시 깨지지 않도록 parser regression test 또는 최소 재현 케이스를 추가합니다.

## 기술 상세
- 대상 파일: `src/lib/punch-excel-utils.ts`
- 참고 패턴:
  - `src/lib/defect-parser.ts`
  - `src/lib/import-parser.ts`
- 핵심 수정 포인트:
  - `blankrows: false` 기반 헤더 탐지 제거
  - 헤더 탐지와 실제 파싱의 row index 기준 통일
  - 필요 시 `HEADER_SCAN_LIMIT` 상수화

## 기대 결과
수정 후에는 현재 첨부하신 파일도 Punch Import에서 컬럼이 자동 인식되고, `Configure Columns`에서도 실제 헤더 목록이 보이며, `0/0 cols mapped` 상태가 사라집니다.