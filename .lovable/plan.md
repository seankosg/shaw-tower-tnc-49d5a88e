## 문제

현재 Card 2(Average Productivity)가 0.04 / 0.03으로 표시됨. 하지만 하부 Productivity 테이블의 Average 컬럼 Nos/Man 값(2.7 / 2.3)과 일치해야 함.

원인: 카드의 `plannedMan` / `actualMan`이 **qty 이벤트마다** 해당 날짜의 manpower를 누적함. 즉 동일 날짜의 manpower가 qty 개수만큼 중복 합산되어 분모가 비정상적으로 커짐.

테이블은 sub × workplace 단위로 `mSum = Σ getMan(sub, date, wp)` (날짜별로 1회) 를 사용하므로 `qSum / mSum = 2.7` 이 나옴.

## 수정 (src/components/analysis/ProductivitySummaryCards.tsx)

`stats` useMemo의 인원 누적 로직을 테이블과 동일한 방식으로 변경:

1. qty 누적은 그대로 유지 (planned/actual qty 카운트)
2. man 누적은 **별도 패스**로 처리:
   - 필터된 subcontractor 목록을 subtest/defect 데이터에서 추출 (혹은 dmrRows의 subcontractor와 fSubs 교집합)
   - 각 (sub, wp) 조합에 대해 (wp는 showTC면 'T&C', showDefect면 'Defect')
   - `mSum = Σ_{d ∈ dates} getMan(sub, d, wp)` 를 한 번만 계산해서 plannedMan / actualMan 양쪽에 동일하게 합산
3. 즉 분모는 "선택된 날짜 범위 × 선택된 sub × 선택된 wp의 manpower 총합"

결과:
- planProd = plannedQty / manTotal
- actProd  = actualQty  / manTotal
- 테이블의 Average 컬럼 Nos/Man과 동일한 값으로 표시됨

## 변경 범위

- 파일: `src/components/analysis/ProductivitySummaryCards.tsx` 1개
- Card 1(Average Work Volume), Card 3(Difference) 로직 유지
- 데이터 fetch 로직 변경 없음
