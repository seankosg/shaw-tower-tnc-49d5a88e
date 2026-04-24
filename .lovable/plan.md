

## Plan vs Actual 표 — Difference 행 Total/Done/Remain 정의 수정

### 현재 문제

```text
ACU 그룹: Completion Done = 87, Closure Done = 87
  → Difference 행이 다음처럼 표시되어야 함:
       Total = 0, Done = 0, Remain = 0  (검측 대기 0건)
  → 그러나 현재:
       Total = 87 (그룹 전체 결함수 그대로)
       Done  = 0  ← 이건 맞음 (87−87)
       Remain = "—" (의미 모호)
```

원인: `row.totalDefects` 가 모든 stage(Completion/Closure/Difference)에서 그대로 사용됨. Difference 의 "Total" 의미가 잘못 정의되어 있음.

### 정의 변경 (사용자 확정)

```text
[Completion / Closure 행]  변동 없음
  Total  = row.totalDefects (그룹 전체 결함 수)
  Done   = stage.cumActual
  Remain = Total − Done

[Difference 행 — 검측 대기 적체]  ← 재정의
  Total  = Completion.cumActual − Closure.cumActual   (검측 대기 건수)
  Done   = Total                                       (= 동일값)
  Remain = 0                                           (남은 작업 없음)

  나머지 컬럼(Cum Plan/Actual/Δ, Data Date, Today, Delay)은
  현재처럼 Comp metric − Closure metric 차이값 그대로 유지.

  Progress % = "—" (의미 없음, 현재와 동일)
```

검증 예시:
```text
ACU      → Comp.Done 87, Closure.Done 87 → Diff Total/Done/Remain = 0/0/0  ✅
ECOPLUS  → Comp.Done 2,  Closure.Done 2  → Diff Total/Done/Remain = 0/0/0  ✅
Painting → Comp.Done 40, Closure.Done 28 → Diff Total/Done/Remain = 12/12/0
```

### 영향 받는 파일

```text
[수정] src/pages/DefectDashboardPage.tsx
  - PlanActualTable 본문 렌더링부 (라인 418–467 부근)
    isDiff 일 때:
      Total  셀  → row.totalDefects 대신 metrics.cumActual (= Comp−Closure) 표시
      Done   셀  → metrics.cumActual 그대로 (변경 없음)
      Remain 셀  → "—" 대신 0 표시 (tabular-nums)
    Completion / Closure 행은 변경 없음
  - 헤더 합계(stageTotal/stageDone/stageRemain) 계산 로직 (라인 308–334)
    Difference 행이 더해질 때:
      acc.stageTotal += row.totalDefects   →  acc.stageTotal += d.cumActual
    Completion/Closure 합산은 기존 로직 유지
    헤더 stageRemain 계산식은 그대로 (= stageTotal − stageDone)

[수정] src/lib/defect-dashboard-excel-export.ts
  - 동일한 Total/Done/Remain 규칙으로 Excel 출력 정정 (라인 72–75)
      isDiff 일 때:
        col 2 (Total)  = m.cumActual          (Comp.cumActual − Closure.cumActual)
        col 3 (Done)   = m.cumActual          (동일)
        col 4 (Remain) = 0 (S_NUM 스타일, "—" 제거)
```

### 변경하지 않는 항목

```text
- diffMetrics() 함수 자체 (Comp − Closure 차이 계산은 그대로)
- Cum Plan/Actual/Δ, Data Date Plan/Actual/Δ/Delay, Today Plan/Actual/Δ/Delay
- Difference 행 클릭 시 raw-data 이동 필터 (actualComplete=true & closureComplete=false)
- KPI 카드의 "Difference" 값 (이미 actualDone − closureDone 으로 올바름)
- 색상 / Δ 부호 의미 / 점선 보더
```

### 검증

```text
1. Defect Dashboard 진입 → ACU/ECOPLUS 처럼 Comp.Done == Closure.Done 인 그룹의
   Difference 행이 Total=0, Done=0, Remain=0 으로 표시
2. Comp.Done > Closure.Done 인 그룹은 Total = Done = (차이), Remain = 0
3. 헤더(컬럼 합계)의 Total/Done/Remain 도 Difference 기여분이 동일 규칙으로 합산되어
   stageTotal == stageDone (Difference 부분), 전체 stageRemain 은
   sum(Comp.Remain) + sum(Closure.Remain) + 0 과 일치
4. Excel export 에서도 동일 값이 출력
5. 기존 Cum/Data Date/Today 컬럼 값 변동 없음
```

