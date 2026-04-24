

## Overdue 카드 세분화 — Start / Completion / Closure 3개로 분리

### 변경 내용

```text
[현재] 2단에 Overdue (단일 통합) + Overall Progress 2칸

[변경 후] 2단을 4칸으로 확장 (md:grid-cols-4)
  Overdue - Start | Overdue - Completion | Overdue - Closure | Overall Progress

  Overdue - Start
    = planned_start_date <= dataDate && !actual_start_date && !closure_done
  Overdue - Completion
    = planned_completion_date <= dataDate && !completion_done (현 completionOverdue 동일)
  Overdue - Closure
    = planned_closure_date <= dataDate && !closure_done (현 closureOverdue 동일)
```

### 구체적 변경

**[수정] `src/lib/defect-dashboard-utils.ts`**
- `DefectDashboardStage` 타입에 `'start'` 추가:
  `export type DefectDashboardStage = 'start' | 'completion' | 'closure';`
- `getStagePlanDate`: `stage === 'start'` 시 `item.planned_start_date` 반환
- `getStageActualDate`: `stage === 'start'` 시 `item.actual_start_date` 반환
- `isStageDone`: `stage === 'start'` 시 `Boolean(item.actual_start_date) || isActualComplete(item)` (시작은 진행/완료된 항목 모두 done 처리)
- `STAGES` 상수: `['start', 'completion', 'closure']` 로 확장
  → 부수효과: `isOverdue` / `maxDelayDays` 도 start 지연을 함께 본다 (사용자 요구에 부합)

**[수정] `src/pages/DefectDashboardPage.tsx`**
- `kpis` useMemo (라인 107–119)에 추가:
  ```ts
  const startOverdue = filteredItems.filter(i => isStageDelayedAsOf(i, 'start', dataDate)).length;
  ```
  반환 객체에 `startOverdue` 포함
- 2단 그리드 (라인 188–196) 변경:
  - `md:grid-cols-2` → `md:grid-cols-2 lg:grid-cols-4`
  - 카드 4개 배치:
    1. **Overdue - Start** (`AlertTriangle` 아이콘, accent="destructive")  
       value=`kpis.startOverdue` · sub="Start 지연"  
       onClick → `goRaw({ overdue: 'true', stage: 'start', asOf: dataDate })`
    2. **Overdue - Completion** (동일 아이콘)  
       value=`kpis.completionOverdue` · sub="Completion 지연"  
       onClick → `goRaw({ overdue: 'true', stage: 'completion', asOf: dataDate })`
    3. **Overdue - Closure** (동일 아이콘)  
       value=`kpis.closureOverdue` · sub="Closure 지연"  
       onClick → `goRaw({ overdue: 'true', stage: 'closure', asOf: dataDate })`
    4. **Overall Progress** 카드 (현재 그대로)
- 하단 **AlertBanner**(라인 204) 의 Overdue 합산 표시는 `kpis.startOverdue + kpis.completionOverdue + kpis.closureOverdue` 가 아닌 기존 `kpis.overdueCount` 유지 (any-stage 지연 건수 기준 — 한 결함이 여러 stage에서 지연돼도 1건)

**[수정] `src/pages/DefectRawDataPage.tsx`** (라인 450 부근)
- `overdue=true` 필터에 `stage` 파라미터 추가 처리:
  ```ts
  const stage = searchParams.get('stage'); // 'start' | 'completion' | 'closure' | null
  if (searchParams.get('overdue') === 'true') {
    const asOf = searchParams.get('asOf') ?? todayIso();
    next = next.filter((item) => {
      if (Boolean(item.actual_closure_date)) return false;
      if (stage === 'start')
        return item.planned_start_date && item.planned_start_date <= asOf && !item.actual_start_date;
      if (stage === 'completion')
        return item.planned_completion_date && item.planned_completion_date <= asOf && !item.actual_completion_date;
      if (stage === 'closure')
        return item.planned_closure_date && item.planned_closure_date <= asOf && !item.actual_closure_date;
      return isOverdueDefect(item, asOf);
    });
  }
  ```
- `hasUrlFilters` 체크 배열(라인 377)에 `'stage'` 추가
- 필터 칩(active filters) 라벨에 stage 표시: 예) "Overdue (Start)"

### 변경하지 않는 항목

- KpiCard 컴포넌트 시그니처
- Plan vs Actual 표, S-Curve, Pie, Top Overdue 표
- AlertBanner의 Overdue 총합 (any-stage 기준 그대로)
- Stage Card (Completion/Closure) 영역
- `isAtRisk` 로직 — 시작 지연은 At-Risk가 아닌 Overdue로만 처리

### 검증

```text
1. 2단에 4개 카드 노출: Overdue-Start / Overdue-Completion / Overdue-Closure / Overall Progress
2. 각 카드의 숫자가 raw-data 페이지에서 stage별 필터 적용 결과 건수와 일치
3. Overdue-Start 클릭 → planned_start_date <= dataDate 이고 actual_start_date 없는 행만 노출
4. 모바일(<lg) 에서는 2x2 wrap, 데스크탑(lg+)에서는 1x4 배치
5. AlertBanner의 통합 Overdue 카운트는 변하지 않음 (한 결함의 다중 stage 지연 = 1건)
6. Top Overdue 표는 maxDelayDays 기반이므로 start 지연도 자동 반영됨
```

