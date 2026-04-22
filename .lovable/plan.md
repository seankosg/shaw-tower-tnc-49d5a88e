
## 목표

Plan vs Actual 표의 숫자를 클릭했을 때 Raw Data(Subtest Master Database)로 이동한 뒤, 클릭한 숫자의 의미와 정확히 일치하는 subtest만 list되도록 수정하겠습니다.

특히 예시처럼 **Predecessor Stage의 Delay 숫자**를 클릭했을 때:

```text
해당 그룹(System/Subcontractor/Sub-Sub/HDEC PIC/Team)
AND Predecessor planned_date <= 기준일
AND Predecessor가 Done이 아님
```

인 subtest만 보여야 하며, 다른 stage의 delay나 전체 system subtest가 섞여 보이지 않도록 하겠습니다.

## 확인된 현재 구조

현재 Plan vs Actual의 Delay 숫자는 대부분 아래처럼 stage별 URL filter를 사용하고 있습니다.

```text
pred_delay_asof
t1_delay_asof
t2_delay_asof
```

Raw Data 쪽에서도 이 filter를 받아서 `isStageDelayedAsOf()`로 stage별 delay를 검사하고 있습니다.

다만 Plan vs Actual의 일부 숫자, 특히 누적 Δ 클릭 로직은 현재 다음처럼 동작합니다.

```text
status=overdue&as_of={dataDate}
```

이 방식은 특정 stage가 아니라 **Pred/T1/T2 중 하나라도 overdue인 subtest**를 보여주므로, Predecessor 행에서 클릭해도 T1/T2 delay까지 섞여 보일 수 있습니다.

또한 Dashboard의 Team tab에서 이동할 때 `team` URL filter가 Raw Data에서 아직 column filter로 매핑되어 있지 않아, Team 기준 클릭 결과가 정확히 제한되지 않을 가능성이 있습니다.

## 수정 계획

### 1. Plan vs Actual 숫자 클릭 로직 점검 및 stage별 필터로 통일

`src/pages/DashboardPage.tsx`의 `PlanActualTable`에서 숫자 클릭 URL을 전수 점검합니다.

특히 아래 클릭 동작을 수정합니다.

#### 현재 문제 가능성이 있는 로직

```text
누적 Δ가 음수일 때:
status=overdue&as_of={dataDate}
```

#### 수정 방향

각 stage 행에서 누른 Δ는 해당 stage 기준 delay filter로 이동하게 변경합니다.

```text
Pred row Δ 클릭 → pred_delay_asof={dataDate}
T1 row Δ 클릭   → t1_delay_asof={dataDate}
T2 row Δ 클릭   → t2_delay_asof={dataDate}
```

즉, Predecessor 행의 숫자를 눌렀는데 T1/T2 delay subtest가 섞이는 일이 없도록 합니다.

### 2. Delay Column 클릭 결과 유지 및 안전성 보강

Data Date / Today의 Delay Column은 이미 stage별 filter를 쓰는 구조입니다.

```text
Data Date Pred Delay → pred_delay_asof={dataDate}
Today Pred Delay     → pred_delay_asof={today}
```

이 로직이 `SubtestList.tsx`의 실제 필터와 정확히 연결되는지 재확인하고, 필요한 경우 filter parameter 처리부를 정리합니다.

기준은 다음과 같습니다.

```text
isStageDelayedAsOf(row, stage, asOfDate)
= planned_date <= asOfDate
AND stage is not Done
```

### 3. Raw Data URL filter 매핑 보완

`src/pages/SubtestList.tsx`에서 Dashboard에서 넘어오는 URL parameter를 table filter로 변환하는 `urlMap`을 보완합니다.

현재 포함된 항목:

```text
system
subcon
subsub
hdec_pic
pred_status
t1_status
t2_status
```

여기에 누락된 Team filter를 추가합니다.

```text
team → team
```

이렇게 하면 Plan vs Actual의 Team tab에서 숫자를 클릭했을 때도 해당 Team 데이터만 정확히 표시됩니다.

### 4. Active Filter 표시 정리

Raw Data 상단의 active URL filter chip에서 stage별 delay filter가 명확하게 보이도록 유지/정리합니다.

예:

```text
Pred Delay ≤ 2026-04-21
T1 Delay ≤ 2026-04-21
T2 Delay ≤ 2026-04-21
```

필요하면 `as_of` 같은 보조 parameter가 단독으로 남아 혼동을 주지 않도록 clear 동작도 함께 정리합니다.

### 5. 클릭별 기대 결과 기준 정리

수정 후 Plan vs Actual 숫자 클릭은 아래 기준으로 동작하게 됩니다.

```text
Cumulative Plan:
stage planned_date <= Data Date

Cumulative Actual:
stage actual_date <= Data Date

Cumulative Δ 음수:
해당 stage가 Data Date 기준 delay

Data Date Plan:
stage planned_date == Data Date

Data Date Actual:
stage actual_date == Data Date

Data Date Delay:
해당 stage가 Data Date 기준 delay

Today Plan:
stage planned_date == Today

Today Actual:
stage actual_date == Today

Today Delay:
해당 stage가 Today 기준 delay
```

### 6. 검증 항목

구현 후 아래를 확인하겠습니다.

1. Plan vs Actual > System tab
   - Predecessor Delay 숫자 클릭
   - Raw Data에서 해당 System + Pred delay subtest만 표시되는지 확인

2. T1 / T2 Delay 숫자 클릭
   - 각각 T1 delay, T2 delay만 표시되는지 확인
   - 다른 stage delay가 섞이지 않는지 확인

3. 누적 Δ 음수 클릭
   - 기존처럼 전체 overdue가 아니라 해당 stage delay 기준으로 이동하는지 확인

4. Team tab 숫자 클릭
   - Team filter가 Raw Data에 정상 적용되는지 확인

5. URL parameter 확인
   - 예시:

```text
/?system=Lighting+%2F+Smart+Lighting&pred_delay_asof=2026-04-21
```

6. Build 확인
   - TypeScript build가 정상 통과하는지 확인
