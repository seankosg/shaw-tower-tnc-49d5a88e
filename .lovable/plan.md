# Captured By 테이블에 Unknown 행 추가

## 목적
상단 Priority 카드 합계와 Captured By 테이블 합계 간 불일치 해결. `captured_by_name`이 비어있는 1,990건을 `Unknown` 행으로 표시하고 Total에 합산.

## 변경 범위
- 파일: `src/pages/DefectDashboardPage.tsx` (단일 파일)
- 데이터 모델, RLS, KPI 로직, Raw Data 페이지 변경 없음

## 구현 내용

1. **Unknown 행 추가**
   - 기존 `unknown` 버킷(현재 테이블에서 숨김 처리됨)을 `name: 'Unknown'` 가상 행으로 변환하여 테이블에 포함
   - 항상 정렬 결과의 맨 아래에 고정 배치
   - By Quantity 4개 컬럼(Total/Completed/Closed/In Dispute), By Priority 4개 컬럼(Total/Cat A/Cat B/No Cat) 모두 값 채움

2. **Total 행 합산**
   - `visibleTotals` 계산에 Unknown 값 포함 → 상단 카드와 일치
   - 예: Cat A Total = 23(명명된 담당자) + 1,347(Unknown) = 1,370

3. **Drill-down 활성화**
   - Unknown 행의 각 셀 클릭 시 Raw Data로 이동
   - `capturedBy` 쿼리 파라미터에 특수값 `__unknown__` 전달 (Raw Data 페이지가 이미 빈 값 필터를 지원하는지 확인 후, 미지원 시 해당 페이지에 빈 값 매칭 로직 한 줄 추가)
   - Priority 컬럼 클릭 시 `capturedBy=__unknown__` + `priority=<해당값>` 동시 적용

4. **스타일링**
   - Unknown 행의 모든 텍스트 및 숫자를 붉은색(`text-destructive`)으로 표시
   - 클릭 가능 유지 (hover, cursor-pointer 동작 정상)

5. **Reconciliation 배너 정리**
   - "Unknown excluded: 1990" 문구 제거 (이제 테이블에 포함되므로 불필요)
   - 헤더의 "16 persons · Unknown 1990" 표기는 분류 정보로 유지

## 기술 메모
- `rowsWithGroup` 생성 시 `unknown.total > 0`이면 Unknown 객체를 push
- 정렬 함수에서 `name === 'Unknown'`이면 항상 마지막으로 sink
- `onMetricClick`에 Unknown 분기 추가하여 `capturedBy` 파라미터를 `__unknown__`으로 라우팅
- Raw Data 페이지의 필터 로직에서 `__unknown__` 수신 시 `captured_by_name IS NULL OR = ''` 조건으로 매핑
