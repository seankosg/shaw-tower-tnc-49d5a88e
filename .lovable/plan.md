## 변경 사항

`src/pages/DefectDashboardPage.tsx` 에 두 가지 수정을 함께 적용합니다.

### 1. Captured by 테이블의 By Priority 컬럼 집계 로직 수정
- Cat A / Cat B / No Cat 카운트에 `!isClosureComplete(it)` 가드를 추가하여 Closure Status가 Closed인 항목은 제외
- 결과적으로 이 합계가 Dispute in Category 배너의 `LL's CAT A` 값과 일치하게 됨
- 해당 셀 클릭 시 Raw Data로 이동하는 `onMetricClick` 핸들러에 `notClosureDone: 'true'` 파라미터를 추가하여 표시 숫자와 Raw Data 필터가 일치하도록 함

### 2. 그룹 라벨 변경
- 테이블 헤더의 "By Priority" → "By Priority for Outstanding Items" 로 변경 (line 1144 부근)

### 기술 세부
```ts
// CapturedByStatsSection 집계 부분
if (!isClosureComplete(it as any)) {
  const pri = (it as any).priority as string | null | undefined;
  if (pri === PRI_CAT_A_LABEL) bucket.priCatA += 1;
  else if (pri === PRI_CAT_B_LABEL) bucket.priCatB += 1;
  else if (!pri) bucket.priNoCat += 1;
}
```

Total / Completed / Closed / In Dispute 컬럼은 변경 없음.
