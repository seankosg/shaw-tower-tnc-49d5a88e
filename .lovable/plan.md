

## 목표

Plan vs Actual Breakdown 표의 헤더 아래 합계 행을 추가하되, 기존 요청 범위인 `Plan / Actual / Δ / Delay` 컬럼뿐 아니라 추가 요청하신 왼쪽 컬럼의 `Total / Done / Remain` 헤더 아래에도 같은 방식으로 합계를 표시하겠습니다.

합계 대상:

```text
왼쪽 Stage 요약:
Total / Done / Remain

To Data Date:
Plan / Actual / Δ

Data Date:
Plan / Actual / Δ / Delay

Today:
Plan / Actual / Δ / Delay
```

합계는 현재 화면에 표시되는 데이터 기준으로 계산됩니다.

```text
Team 필터
System 검색 필터
System 체크박스 필터
Breakdown 탭(System / Subcontractor / Sub-Sub / HDEC PIC / Team)
Data Date 선택값
```

즉, 필터가 변경되면 헤더 아래 합계도 즉시 연동되어 다시 계산됩니다.

## 표시 방식

현재 헤더 구조를 3단으로 확장합니다.

```text
Header row 1: Group / Stage / Total / Done / Remain / To Data Date / Data Date / Today / Progress
Header row 2:             Plan / Actual / Δ / Delay 등 세부 헤더
Header row 3:             각 컬럼별 합계
```

예시:

```text
Group | Stage | Total | Done | Remain | To Data Date        | Data Date              | Today
      |       |       |      |        | Plan Actual Δ       | Plan Actual Δ Delay    | Plan Actual Δ Delay
      |       | 120   | 80   | 40     | 300  250   -50     | 20   15    -5  5      | 10   8     -2  2
```

## 왼쪽 컬럼 합계 계산

현재 각 그룹 행은 Stage별로 `Pred / T1 / T2`가 표시됩니다.

왼쪽 컬럼 합계는 화면에 표시된 모든 그룹의 Stage 값을 합산합니다.

```text
Total 합계 =
sum(Pred Total + T1 Total + T2 Total)

Done 합계 =
sum(Pred Done + T1 Done + T2 Done)

Remain 합계 =
sum(Pred Remain + T1 Remain + T2 Remain)
```

Stage별 기준은 기존 본문에서 표시하는 `Total / Done / Remain` 계산과 동일하게 맞춥니다.

```text
Total = 해당 Stage의 전체 대상 수
Done = 해당 Stage가 Done인 수
Remain = Total - Done
```

따라서 표 본문과 헤더 합계의 의미가 일치합니다.

## Plan / Actual / Δ / Delay 합계 계산

표에 렌더링되는 `PlanActualRow[]`를 그대로 사용해 계산합니다.

각 그룹의 `Pred / T1 / T2` stage를 모두 합산합니다.

### To Data Date

```text
Plan Total =
sum(pred.cumPlan + t1.cumPlan + t2.cumPlan)

Actual Total =
sum(pred.cumActual + t1.cumActual + t2.cumActual)

Δ Total =
Actual Total - Plan Total
```

### Data Date

```text
Plan Total =
sum(pred.dataDatePlan + t1.dataDatePlan + t2.dataDatePlan)

Actual Total =
sum(pred.dataDateActual + t1.dataDateActual + t2.dataDateActual)

Δ Total =
Actual Total - Plan Total

Delay Total =
sum(pred.dataDateDelay + t1.dataDateDelay + t2.dataDateDelay)
```

### Today

```text
Plan Total =
sum(pred.todayPlan + t1.todayPlan + t2.todayPlan)

Actual Total =
sum(pred.todayActual + t1.todayActual + t2.todayActual)

Δ Total =
Actual Total - Plan Total

Delay Total =
sum(pred.todayDelay + t1.todayDelay + t2.todayDelay)
```

Today Delay는 이전에 수정한 오늘 기준 로직을 그대로 사용합니다.

```text
Today Delay = planned_date === today AND stage is not Done
```

따라서 Today Plan 합계가 0이면 Today Delay 합계도 0으로 유지됩니다.

## 가운데 맞춤

요청하신 대로 헤더와 합계 행은 보기 좋게 가운데 맞춤으로 정리합니다.

적용 범위:

```text
상위 그룹 헤더
Stage / Total / Done / Remain 헤더
Plan / Actual / Δ / Delay 세부 헤더
헤더 아래 합계 숫자
```

본문 숫자는 기존처럼 우측 정렬을 유지합니다.

```text
헤더/합계: 가운데 정렬
본문 데이터: 기존 우측 정렬 유지
```

이렇게 하면 헤더 요약 정보는 균형 있게 보이고, 본문 숫자는 행별 비교가 쉬운 현재 형태를 유지할 수 있습니다.

## 색상 규칙

합계 숫자도 각 컬럼의 기존 로직에 맞춰 표시합니다.

```text
Total:
0이면 흐린 회색
0보다 크면 기본 숫자색

Done:
0이면 흐린 회색
0보다 크면 완료/긍정 계열 색상 또는 기본 숫자색

Remain:
0이면 흐린 회색
0보다 크면 잔여 항목이 잘 보이도록 강조

Plan / Actual:
0이면 흐린 회색
0보다 크면 기본 숫자색

Δ:
0이면 흐린 회색
양수면 초록색
음수면 빨간색

Delay:
0이면 흐린 회색
0보다 크면 빨간색/강조색
```

기존 본문 셀의 스타일과 충돌하지 않도록 합계 전용 표시 컴포넌트를 추가하거나 기존 숫자 표시 로직을 재사용하겠습니다.

## UI 구조 변경

`PlanActualTable`의 header table에 합계 행을 추가합니다.

현재:

```text
<TableHead rowSpan={2}>Group</TableHead>
<TableHead rowSpan={2}>Stage</TableHead>
<TableHead rowSpan={2}>Total</TableHead>
<TableHead rowSpan={2}>Done</TableHead>
<TableHead rowSpan={2}>Remain</TableHead>
...
<TableRow>Plan / Actual / Δ / Delay</TableRow>
```

변경 후:

```text
<TableHead rowSpan={3}>Group</TableHead>
<TableHead rowSpan={3}>Stage</TableHead>
<TableHead>Total</TableHead>
<TableHead>Done</TableHead>
<TableHead>Remain</TableHead>
...
<TableRow>Plan / Actual / Δ / Delay</TableRow>
<TableRow>합계 숫자</TableRow>
```

단, `Total / Done / Remain`도 합계가 들어가야 하므로 해당 컬럼은 합계 행과 정렬되도록 구조를 조정합니다.

예상 구조:

```text
Row 1:
Group | Stage | Total | Done | Remain | To Data Date | Data Date | Today | Progress

Row 2:
빈칸 또는 보조 헤더 | Plan | Actual | Δ | ...

Row 3:
Total 합계 | Done 합계 | Remain 합계 | Plan 합계 | Actual 합계 | ...
```

`Group / Stage / Progress`는 합계 대상이 아니므로 필요에 따라 `rowSpan={3}`을 유지하거나 합계 행에서 빈 셀을 사용해 컬럼 정렬이 깨지지 않도록 맞추겠습니다.

## 구현 상세

### 1. Header totals 계산 추가

`src/pages/DashboardPage.tsx`의 `PlanActualTable` 내부에서 현재 표시 중인 `rows` 기준으로 합계를 계산합니다.

```text
const headerTotals = {
  stageTotal,
  stageDone,
  stageRemain,

  cumPlan,
  cumActual,
  cumDelta,

  dataDatePlan,
  dataDateActual,
  dataDateDelta,
  dataDateDelay,

  todayPlan,
  todayActual,
  todayDelta,
  todayDelay,
}
```

`rows`는 이미 필터 적용 후 전달되므로 별도 필터 로직은 추가하지 않습니다.

### 2. Stage 합계 계산 헬퍼 추가

Pred / T1 / T2별 Done / Remain 계산이 본문에서 이미 사용되고 있다면 해당 로직을 재사용합니다.

필요 시 헬퍼를 추가합니다.

```text
getStageSummary(row, stage)
```

반환값:

```text
{
  total,
  done,
  remain
}
```

이 헬퍼를 본문과 합계 계산 양쪽에서 사용해 숫자 불일치를 방지합니다.

### 3. 합계 표시 컴포넌트 추가

예시:

```text
HeaderTotalNumber
HeaderTotalVariance
HeaderTotalDelay
HeaderTotalRemain
```

역할:

```text
가운데 정렬
tabular-nums 적용
0 값 흐린 회색 처리
Δ 색상 처리
Delay 강조 처리
Remain 강조 처리
```

### 4. 헤더 행 정렬 개선

헤더 셀에는 다음 스타일을 적용합니다.

```text
text-center
align-middle
```

합계 행에는 다음 스타일을 적용합니다.

```text
text-center
tabular-nums
font-semibold
bg-muted/20
```

본문은 기존 정렬과 클릭 동작을 유지합니다.

### 5. 빈 데이터 처리

필터 결과가 없으면 모든 합계는 0으로 표시합니다.

```text
Total 0
Done 0
Remain 0
Plan 0
Actual 0
Δ 0
Delay 0
```

0 값은 기존 규칙대로 흐린 회색으로 표시합니다.

## 적용 대상 파일

```text
src/pages/DashboardPage.tsx
```

이번 변경은 화면 표의 헤더/합계 표시 개선입니다. 기존 집계 데이터 구조를 활용하므로 데이터베이스 변경은 필요 없습니다.

## 검증 항목

구현 후 아래를 확인하겠습니다.

1. `Total / Done / Remain` 헤더 아래 합계가 표시되는지 확인
2. `Plan / Actual / Δ / Delay` 헤더 아래 합계가 표시되는지 확인
3. 모든 합계가 현재 필터 적용 후 보이는 행 기준으로 계산되는지 확인
4. Breakdown 탭 전환 시 합계가 해당 탭 기준으로 재계산되는지 확인
5. Team 필터 변경 시 합계가 즉시 갱신되는지 확인
6. System 검색 필터 변경 시 합계가 즉시 갱신되는지 확인
7. System 체크박스 필터 변경 시 합계가 즉시 갱신되는지 확인
8. Data Date 변경 시 Data Date 관련 합계가 갱신되는지 확인
9. `Total = Done + Remain` 관계가 합계에서도 유지되는지 확인
10. `Δ = Actual - Plan` 관계가 합계에서도 유지되는지 확인
11. Today Plan이 0이면 Today Delay 합계도 0인지 확인
12. 0 값은 흐린 회색으로 표시되는지 확인
13. 음수 Δ는 빨간색, 양수 Δ는 초록색으로 표시되는지 확인
14. Delay가 0보다 크면 기존 Delay 컬럼 로직에 맞게 강조되는지 확인
15. Remain이 0보다 크면 기존 Remain 컬럼 로직에 맞게 표시되는지 확인
16. 헤더와 합계 숫자가 가운데 맞춤으로 보이는지 확인
17. 본문 숫자는 기존 정렬과 클릭 동작이 유지되는지 확인
18. 헤더/본문 컬럼 폭 정렬과 가로 스크롤이 깨지지 않는지 확인
19. 기존 Raw Data 이동 필터가 유지되는지 확인
20. `npm run build`로 빌드 검증

