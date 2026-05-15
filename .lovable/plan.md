## 문제
업로드 파일 분석 결과:
- **1행**: 비어있음
- **2행**: 실제 헤더 (`Item No`, `구분1`, `Outsanding Works`, `Subcontractor` 등)
- **A열**: 비어있고 데이터는 B열부터 시작
- **3행~89행**: 실제 데이터

현재 `parsePunchWorkbook`은 항상 1행을 헤더로 가정하므로, `XLSX.utils.sheet_to_json`이 빈 1행에 대해 `__EMPTY`, `__EMPTY_1` … 자동 헤더를 생성 → 25개 컬럼 모두 매핑 실패 (0/25 cols mapped, 87 rows rejected).

또한 사용자가 업로드하는 파일마다 헤더가 1~5행 사이 어디에든 올 수 있으므로, 위치에 관계없이 자동으로 헤더 행을 찾아야 합니다.

## 해결책
`src/lib/punch-excel-utils.ts`의 `parsePunchWorkbook`에 **헤더 행 자동 탐지** 로직을 추가합니다.

### 동작
1. 시트를 `header: 1` 옵션으로 row 배열 형태로 먼저 읽음
2. 처음 **최대 10행**(1~5행 요구사항보다 여유 있게)을 검사하여, 각 행의 셀들 중 `resolveHeader(cell)`로 registry alias에 매칭되는 셀 개수를 카운트
3. **매칭 점수가 가장 높은 행**을 헤더 행으로 선택. 동률이면 위쪽 행 우선
4. 매칭이 0인 경우만 fallback으로 1행 사용 (회귀 방지)
5. 선택된 헤더 행 인덱스 `H`로 `XLSX.utils.sheet_to_json(ws, { range: H, ... })` 재호출
6. 빈 헤더 셀(공백 문자열/`null`)은 결과에서 제거 → A열처럼 비어있는 컬럼이 `__EMPTY_N`으로 들어가지 않음
7. 이후 `headerMap`, `headerSamples`, 행 파싱 흐름은 동일 유지

### 부가
- 빈 행/빈 컬럼이 섞인 파일도 자연스럽게 처리됨
- 헤더가 1행에 정상적으로 있는 기존 파일도 동일 로직으로 1행이 최고 점수 → 회귀 없음
- preferredSheet, excludedHeaders 등 기존 옵션 동작 변경 없음

## 영향 범위
- 변경 파일: `src/lib/punch-excel-utils.ts` 1개
- DB / UI / 다른 파서 변경 없음

## 검증
1. 업로드된 `Outstanding_Works_MECH_FACADE_Archi_External_r4.xlsx`(헤더 2행) 다시 import → 25개 중 대부분 컬럼이 매핑되고 87 rows가 ready 상태가 되는지
2. 헤더가 1행에 있는 기존 파일 import → 정상 동작 유지
3. 헤더가 3~5행에 있는 가상 케이스도 동일 로직으로 처리 가능
