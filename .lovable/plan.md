## 변경 사항

`src/pages/DefectDashboardPage.tsx` — Captured by 테이블의 "By Priority for Outstanding Items" 그룹 내 Total 컬럼이 Closed를 제외한 카운트(= Cat A + Cat B + No Cat)를 표시하도록 수정합니다.

### 세부 변경
1. `CapturedByStat` 인터페이스에 `priTotal: number` 필드 추가 (line 955)
2. 집계 루프에서 `!isClosureComplete(it)` 일 때 `bucket.priTotal += 1` 증가 (line 980 부근)
3. 빈 bucket 초기화 두 곳(line 971, 975)에 `priTotal: 0` 추가
4. `totals` reduce / 초기값(line 995~998)에 `priTotal` 합산 추가
5. `visibleTotals` reduce(line 1070, 1072)에도 `priTotal` 추가
6. TOTAL 행의 priority Total 셀(line 1221) — `visibleTotals.total` → `visibleTotals.priTotal`
7. 각 행의 priority Total 셀(line 1250) — `r.total` → `r.priTotal`
8. 상단 `onMetricClick` 핸들러(line 609~617)에서 `metric === 'priTotal'` 인 경우 `params.notClosureDone = 'true'` 추가
9. SortKey 매핑(line 1194)에서 `priTotal` 정렬 키를 `'total'` → 새 키로 변경하거나 그대로 두기 — 단순화를 위해 `null` 처리해 정렬 비활성화하거나 SortKey에 `priTotal` 추가 후 priTotal 기준 정렬

By Quantity 그룹의 Total / Completed / Closed / In Dispute 컬럼은 변경 없음.
