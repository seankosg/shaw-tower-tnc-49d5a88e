

## Stage 진도율 카드를 Completion/Closure Done 카드 아래로 이동

### 변경 내용

```text
[현재]
  1단 (5칸): Total | Completion Done | Open Defect | Closure Done | Remain Inspection
  2단 (4칸): Overdue-Start | Overdue-Completion | Overdue-Closure | Overall Progress
  3단 (2칸): StageCard "Completion" | StageCard "Closure"

[변경 후]
  1단 (5칸): Total | Completion Done | Open Defect | Closure Done | Remain Inspection
  2단 (5칸): (빈칸) | StageCard "Completion" | (빈칸) | StageCard "Closure" | (빈칸)
            → Completion Done / Closure Done 바로 아래에 정렬
  3단 (4칸): Overdue-Start | Overdue-Completion | Overdue-Closure | Overall Progress
```

즉 기존 3단(StageCard 2개)을 1단 KPI 그리드 바로 아래로 끌어올리고, Overdue 4칸은 그 아래로 내려갑니다.

### 구체적 변경

**[수정] `src/pages/DefectDashboardPage.tsx` (라인 181–204)**

순서를 다음과 같이 재배치:

1. **1단** — 기존 5칸 KPI 그리드 (라인 181–187) 그대로 유지
2. **2단(NEW 위치)** — StageCard 2개를 5컬럼 그리드 안에 배치하여 1단의 Completion Done(2번째)과 Closure Done(4번째) 칸 위치에 정렬:
   ```tsx
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
     <div className="hidden md:block" />               {/* Total 자리 */}
     <StageCard stage="Completion" ... />              {/* Completion Done 아래 */}
     <div className="hidden md:block" />               {/* Open Defect 자리 */}
     <StageCard stage="Closure" ... />                 {/* Closure Done 아래 */}
     <div className="hidden md:block" />               {/* Remain Inspection 자리 */}
   </div>
   ```
   - 모바일(<md)에서는 빈 div가 숨겨져 StageCard 2개만 자연스럽게 1열/2열로 배치됨
3. **3단** — Overdue 3개 + Overall Progress (현재 라인 189–199 그리드) 그대로 유지하되 위치만 아래로 이동

### 변경하지 않는 항목

- KpiCard / StageCard 컴포넌트 시그니처
- KPI 계산 로직 (`kpis` useMemo)
- Overdue 그리드 내부 구조 (lg:grid-cols-4)
- AlertBanner, Plan vs Actual 표, S-Curve, Pie 등 하단 영역

### 검증

```text
1. 데스크탑(md+): 1단 5칸 KPI 바로 아래에 StageCard 2개가 Completion Done(2번째)과
   Closure Done(4번째) 컬럼 위치에 수직 정렬되어 표시
2. 그 아래로 Overdue 3개 + Overall Progress 카드 노출
3. 모바일(<md): StageCard 2개가 빈 placeholder 없이 1열로 wrap
4. 다른 영역(Alert, 표, 차트)은 변경 없음
```

