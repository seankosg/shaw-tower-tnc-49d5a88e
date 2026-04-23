
## 구현 계획: Defect Dashboard Plan vs Actual table을 T&C Dashboard layout과 동일하게 재구성

현재 `DefectDashboardPage.tsx`의 `PlanActualTable`은 기능은 들어가 있지만, T&C Dashboard와 달리 header/body가 한 개 table 안에 압축되어 있어 긴 데이터에서 header 고정/스크롤 UX가 제대로 맞지 않습니다. T&C의 `PlanActualTable` 구조를 기준으로 Defect table을 재작성하겠습니다.

## 1. `PlanActualTable` 구조를 T&C 방식으로 분리

현재 구조:

```text
overflow-x-auto
  min-w-[1270px]
    Table
      TableHeader
      TableBody
```

변경 구조:

```text
overflow-x-auto
  min-w-[1270px]
    header wrapper
      Table
        TableHeader
    body wrapper max-h-[440px] overflow-y-auto
      Table
        TableBody
```

적용 포인트:

```text
- header table과 body table을 분리
- 동일한 colgroup을 양쪽 table에 적용
- body만 vertical scroll
- horizontal scroll은 전체 wrapper가 담당
- scrollbar-gutter: stable 적용
```

이렇게 해서 T&C Dashboard처럼 table body가 길어져도 header가 고정된 것처럼 유지됩니다.

## 2. T&C와 동일한 column width / min-width 유지

Defect table도 T&C와 같은 17-column layout을 유지합니다.

```text
Group                 210px
Stage                  86px
Total                  58px
Done                   58px
Remain                 64px
Plan/Actual/Δ/Delay    56px each
Progress              140px
```

최소 너비:

```text
min-w-[1270px]
```

이 값은 T&C Dashboard와 동일하게 유지해 컬럼 정렬과 horizontal scroll behavior를 맞춥니다.

## 3. Header 3-row 구성을 T&C와 동일하게 정리

Defect table header를 다음 3단 구조로 유지하되, T&C와 동일한 spacing/class 구조로 정리합니다.

```text
Row 1:
Group | Stage | Total/Done/Remain | To Data Date | Data Date | Today | Progress

Row 2:
All | Done | Open | Plan | Actual | Δ | Plan | Actual | Δ | Delay | ...

Row 3:
Header totals
```

수정 사항:

```text
- TableHeader에 bg-background 적용
- total row에 h-8 / px-2 적용
- muted total row hover 방지
- border-l / border-r 위치를 T&C와 동일하게 맞춤
- "Open" 표기는 T&C와 동일하게 유지하거나 Defect 의미상 "Remain"과 혼용되지 않도록 header만 정리
```

## 4. Body table을 T&C row rendering 방식으로 재작성

현재 한 줄로 압축된 row rendering을 T&C처럼 읽기 쉬운 구조로 풀어 작성합니다.

Defect stage mapping은 유지합니다.

```text
Planned:
- Plan: planned_date
- Actual: actual_date
- Done filter: actualComplete=true

Target:
- Plan: target_date
- Actual: actual_date
- Done filter: actualComplete=true

Closure:
- Plan: target_date
- Actual: closed_date
- Done filter: closureComplete=true
```

Row 구성:

```text
- group rowSpan=3
- Planned / Target / Closure stage rows
- group 간 border-t-2
- StageBadge 유지
- summary cells는 bg-muted/10
- Progress column은 bar + percent
```

## 5. Clickable drill-down 동작 유지 및 정리

기존 Defect table의 클릭 이동은 유지합니다.

대상:

```text
/defects/raw-data
```

유지할 query behavior:

```text
group filter:
- subTrade
- subcontractor
- subsub
- hdecPic
- team

date filters:
- dateField
- dateStart
- dateEnd

status filters:
- actualComplete=true
- closureComplete=true
- overdue=true
- asOf
```

추가로 T&C table과 동일하게 다음 요소도 클릭 가능 상태를 명확히 유지합니다.

```text
- cumulative plan / actual
- data date plan / actual / delay
- today plan / actual / delay
- row click for group-level drill-down
```

## 6. Sub Trade filter dropdown 유지

`By Sub Trade` tab의 header filter는 유지하되 T&C의 `SystemHeaderFilter`와 동일한 위치/동작으로 정리합니다.

적용:

```text
Group header cell 안에:
Sub Trade + filter icon
```

기능:

```text
- text search
- multi-select
- clear
- selected count 또는 clear action
```

## 7. 보조 helper 정리

`DefectDashboardPage.tsx` 하단의 table helper들을 정리합니다.

대상:

```text
HeaderTotalNumber
VarianceCell
ClickNum
StageBadge
FilterDropdown
PlanActualTable
```

정리 내용:

```text
- T&C와 동일한 naming/style에 맞춤
- 너무 긴 single-line JSX를 multi-line JSX로 변경
- table 구조가 유지보수 가능하도록 분리
- stray "TS" 텍스트 제거
```

## 8. 검증 항목

구현 후 다음을 확인합니다.

```text
1. /defects/dashboard에서 Plan vs Actual - Summary table이 표시됨
2. table header와 body가 분리되어 body만 vertical scroll됨
3. horizontal scroll 시 header/body column alignment가 유지됨
4. header totals가 표시됨
5. By Sub Trade / By Subcontractor / By Sub-Sub / By HDEC PIC / By Team tab 모두 동일 layout 사용
6. Sub Trade filter dropdown이 header 안에서 동작함
7. Planned / Target / Closure rows가 각 group마다 3줄로 표시됨
8. Data Date / Today labels가 header에 표시됨
9. 숫자 클릭 시 /defects/raw-data로 drill-down됨
10. empty state가 body 영역에 표시됨
11. T&C Dashboard에는 영향 없음
12. build가 성공함
```

## 수정 대상

```text
src/pages/DefectDashboardPage.tsx
```

필요 시 table helper만 같은 파일 안에서 정리하고, 별도 컴포넌트 파일은 만들지 않겠습니다. 이번 작업의 범위는 Defect Dashboard의 Plan vs Actual table layout parity에 집중합니다.
