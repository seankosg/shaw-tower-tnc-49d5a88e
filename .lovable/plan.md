## 변경 범위
`src/pages/analysis/DmrDashboardPage.tsx`의 상단 서머리 카드 4장(Total man-days / Avg per day / Peak day / Days covered)을 모두 제거하고, 동일 위치(필터 바로 아래, ProductivityTable 위)에 생산성 기반 신규 카드 4장을 추가합니다.

## 신규 카드 4장

각 카드는 현재 필터(Team / Trade / Subcontractor / Workplace)에 연동되며, T&C(=T1+T2) 와 Defect(=Completion 기준)를 선택된 Workplace에 한해 합산합니다. 분모 인원(Man)은 ProductivityTable과 동일한 규칙(매칭 workplace의 DMR manpower 합)을 사용합니다.

1. **Work Volume**
   - Planned Q'ty: 선택 범위의 TC Planned + Defect Planned 합계 (Nos)
   - Actual Q'ty: 선택 범위의 TC Actual + Defect Actual 합계 (Nos)

2. **Productivity (Nos/Man)**
   - Planned: Σ Planned Qty ÷ Σ matching Man (소수 1자리)
   - Actual: Σ Actual Qty ÷ Σ matching Man

3. **Average** (필터 기간 내 일평균)
   - Plan: Σ Planned Qty ÷ 활성 일수
   - Actual: Σ Actual Qty ÷ 활성 일수
   - 단위: Nos/day

4. **Difference**
   - Actual Productivity − Planned Productivity
   - 표시: 부호 포함 숫자 + 단위 `Nos/Man`
   - 양수 녹색 / 음수 빨강(semantic token), 0 또는 계산 불가는 `-`

## 기술 세부 사항

- 새 컴포넌트 `src/components/analysis/ProductivitySummaryCards.tsx`를 만들고 `DmrDashboardPage`에서 사용. Props는 ProductivityTable과 동일(`dmrRows, dates, fTeams, fSubs, fWp, subs`).
- 내부에서 `subtests` / `defect_items` 쿼리를 동일 키로 재사용(react-query 캐시 공유). 정규화(`norm`) 및 필터 로직은 ProductivityTable과 동일하게 구현.
- 집계 후 4개 카드를 `grid grid-cols-2 lg:grid-cols-4 gap-3`로 렌더.
- `DmrDashboardPage.tsx`에서:
  - 기존 4개 Card 블록(라인 305–310) 삭제
  - `<ProductivitySummaryCards .../>`로 교체
  - 더 이상 사용되지 않으면 `totalMandays / avgPerDay / peak / daysCovered` 계산도 정리(차트 KPI에서 쓰이지 않으면 제거)
- ProductivityTable의 표시/계산 로직은 변경하지 않음.
