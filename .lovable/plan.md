
## 목표

Progress 탭의 Gantt-lite 시간축 셀 클릭 동작을 전반적으로 재검토하고, 아래 문제를 개선하겠습니다.

```text
1. Actual 실적뿐 아니라 Plan 계획도 명확히 클릭 가능하게 개선
2. Today 날짜 셀의 Plan / Actual Test도 정상적으로 클릭되어 해당 Test 목록으로 이동
3. Plan / Actual 숫자 표기를 “3/2”처럼 모호하게 보이지 않도록 개선
4. 클릭 영역이 너무 작아서 바를 정확히 눌러야 하는 문제 개선
5. 이동 후 Subtest 목록 필터가 실제 Gantt 셀의 값과 정확히 일치하도록 보정
```

## 현재 확인된 구조

Progress Gantt-lite 셀은 현재 다음 구조입니다.

```text
상단 얇은 bar = Plan
하단 얇은 bar = Actual
아래 숫자 = plan / actual
```

현재 클릭 로직은 이미 Plan과 Actual 모두 존재하지만, 실제 사용성에는 문제가 있습니다.

```text
Plan 클릭 가능 영역   = 상단의 아주 얇은 Plan bar
Actual 클릭 가능 영역 = 하단의 아주 얇은 Actual bar
숫자 영역             = 클릭 불가
빈 bar 또는 작은 bar   = 클릭하기 어려움
```

또한 Today 셀은 강조 배경은 있지만, bar가 작거나 0으로 보이는 경우 사용자가 클릭 가능한 영역을 찾기 어렵습니다.

## 개선 방향

### 1. Gantt 셀을 Plan 영역과 Actual 영역으로 명확히 분리

현재처럼 얇은 bar만 클릭되는 방식이 아니라, 셀 내부를 두 개의 클릭 영역으로 나누겠습니다.

```text
┌────────────────────┐
│ P  5   Plan bar     │  ← Plan 클릭 영역 전체
│ A  3   Actual bar   │  ← Actual 클릭 영역 전체
└────────────────────┘
```

기존의 `/` 표기는 제거하거나 보조 정보로 낮추고, 아래처럼 명확하게 표시합니다.

```text
P 5
A 3
```

또는 공간이 부족한 Day 셀에서는 짧게 표시합니다.

```text
P:5
A:3
```

Week 셀에서는 조금 더 여유 있게 표시합니다.

```text
Plan 5
Actual 3
```

### 2. 숫자도 클릭 가능하게 변경

현재는 bar만 클릭 가능해서 실제로는 클릭이 어렵습니다.

변경 후에는 아래 전체가 클릭됩니다.

```text
Plan 숫자
Plan bar
Actual 숫자
Actual bar
```

즉 사용자는 숫자를 클릭해도 해당 Test 목록으로 이동할 수 있습니다.

### 3. Today 날짜 셀 클릭 문제 개선

Today 날짜 셀은 다음 기준으로 처리하겠습니다.

```text
Today Plan   = planned_date === today
Today Actual = actual_date === today
```

Today 셀에서 Plan 값이 있으면 Plan 영역이 항상 클릭 가능해야 합니다.

```text
Today Plan > 0  → Plan 영역 클릭 가능
Today Actual > 0 → Actual 영역 클릭 가능
```

Actual은 미래 날짜에서는 숨기거나 비활성화하되, Today는 미래가 아니므로 반드시 클릭 가능하게 유지합니다.

또한 Today 셀은 현재처럼 강조선을 유지하되, 클릭 가능한 Plan / Actual 영역에는 hover 효과를 추가해 사용자가 누를 수 있음을 알 수 있게 하겠습니다.

### 4. Plan / Actual 이동 필터를 더 정확하게 정리

현재 Progress 셀 클릭 시 이동 URL은 대략 아래 형태입니다.

```text
/?date_from=2026-04-22
 &date_to=2026-04-22
 &date_field=planned 또는 actual
 &stage=t1
 &cell_status=Done
```

개선 후에도 이 구조를 유지하되, 다음을 보정합니다.

#### Day bucket

```text
Plan 클릭:
planned_date === 해당 날짜

Actual 클릭:
actual_date === 해당 날짜
```

#### Week bucket

```text
Plan 클릭:
planned_date가 해당 week 시작일 ~ 종료일 범위 안에 있음

Actual 클릭:
actual_date가 해당 week 시작일 ~ 종료일 범위 안에 있음
```

#### Stage row 클릭

```text
Pred row 클릭 → pred stage만 필터
T1 row 클릭   → t1 stage만 필터
T2 row 클릭   → t2 stage만 필터
```

#### Group row 클릭

`Stage = All` 상태의 합산 row를 클릭하면 기존처럼 Pred / T1 / T2 중 해당 날짜 조건에 맞는 Test를 모두 보여줍니다.

### 5. Subtest 목록 필터 표시와 해제 동작 개선

현재 URL 필터 표시에서 날짜 필터를 지워도 `stage`, `cell_status`가 남을 수 있어 사용자가 “필터가 왜 남아있지?”라고 느낄 수 있습니다.

개선하겠습니다.

```text
Gantt 셀에서 이동한 필터:
- group
- date_from
- date_to
- date_field
- stage
- cell_status
```

이 필터들이 하나의 클릭 맥락으로 보이도록 표시를 정리하고, 날짜 필터를 해제할 때 관련 `stage`, `cell_status`도 함께 해제되도록 개선하겠습니다.

예시 표시:

```text
Plan · T1 · 2026-04-22
Actual · All stages · 2026-04-22 · Done
```

### 6. “해당 Test로 이동” 의미를 유지

Gantt 셀은 한 개 이상의 Test를 포함할 수 있으므로, 클릭 시 개별 상세 페이지로 바로 이동하기보다는 현재처럼 Subtest 목록으로 이동해 해당 조건에 맞는 Test 목록을 보여주는 방식을 유지합니다.

단, 클릭 후 필터 결과가 정확히 Gantt 셀 숫자와 일치하도록 검증하겠습니다.

## 수정 대상

```text
src/components/schedule/ScheduleCell.tsx
src/components/schedule/ScheduleMatrix.tsx
src/pages/SchedulePage.tsx
src/pages/SubtestList.tsx
src/test/dashboard-utils.test.ts
```

## 세부 구현 계획

### 1. ScheduleCell UI 재구성

`ScheduleCell`을 다음 형태로 변경합니다.

```text
기존:
- Plan bar만 클릭
- Actual bar만 클릭
- 숫자는 "plan/actual"로 표시
- 숫자 클릭 불가

변경:
- Plan 영역 전체 클릭
- Actual 영역 전체 클릭
- 숫자는 P / A 라벨로 구분
- Today 셀에서도 동일하게 클릭 가능
```

클릭 가능할 때는 다음 스타일을 추가합니다.

```text
cursor-pointer
hover:bg-accent/40
hover:ring-1
title tooltip
aria-label
```

### 2. Future / Today 판정 보정

현재 `isFuture={vc.index > todayBucketIdx}` 방식은 유지하되, Today 셀은 절대 Future로 처리되지 않도록 확인합니다.

```text
Today cell:
isFuture = false
Plan click 가능
Actual click 가능
```

Week 모드에서도 오늘이 포함된 week bucket은 Today bucket으로 취급되도록 기존 `todayBucketIdx` 로직을 유지하면서 클릭 비활성 조건을 다시 점검합니다.

### 3. Plan / Actual 숫자 표기 변경

현재:

```text
5 / 3
```

변경:

```text
P 5
A 3
```

또는 좁은 Day 셀에서는:

```text
P:5
A:3
```

차이값은 기존처럼 유지하되, 의미가 분명하게 보이도록 보조 위치에 표시합니다.

```text
Δ -2
Δ +1
```

색상은 기존 규칙을 유지합니다.

```text
Actual - Plan < 0 → short 색상
Actual - Plan > 0 → over 색상
```

### 4. 이동 URL 생성 로직 정리

`SchedulePage`의 `handleCellClick`을 정리해 Gantt 클릭임을 명확히 표시하는 파라미터를 추가하겠습니다.

예:

```text
source=schedule_cell
```

그리고 필터 파라미터는 기존 SubtestList가 이해하는 방식으로 유지합니다.

```text
date_from
date_to
date_field
stage
cell_status
system / subcon / subsub / hdec_pic / team
```

Actual 클릭 시에는 완료 실적만 보여야 하므로 `cell_status=Done`을 유지합니다.

Plan 클릭 시에는 상태와 관계없이 해당 날짜에 계획된 Test를 보여야 하므로 `cell_status`를 넣지 않습니다.

### 5. SubtestList URL 필터 처리 개선

Subtest 목록에서 Gantt 클릭 필터를 더 자연스럽게 표시하고 해제되게 하겠습니다.

개선 내용:

```text
1. date_field=planned → Plan으로 표시
2. date_field=actual  → Actual로 표시
3. stage=t1/t2/pred   → Stage 표시를 사람이 읽기 좋게 변환
4. source=schedule_cell인 경우 날짜 필터 해제 시 stage/cell_status/source도 함께 제거
```

### 6. 빈 그룹 또는 `(None)` 그룹 클릭 보정

Progress의 Group이 `(None)`인 경우 기존 multi-select 필터와 맞지 않아 이동 후 목록이 비어 보일 수 있습니다.

이 부분도 함께 점검해, 필요하면 SubtestList의 빈 값 필터 토큰과 연결되도록 보정하겠습니다.

대상 그룹:

```text
Subcontractor = empty
Sub-Sub = empty
PIC = empty
Team = empty
```

### 7. 테스트 추가

기존 테스트에 다음 검증을 추가하겠습니다.

```text
1. Progress Plan cell 클릭 URL이 planned date 필터를 생성하는지
2. Progress Actual cell 클릭 URL이 actual date + Done 필터를 생성하는지
3. Today bucket의 Plan 값이 있는 경우 클릭 가능한 상태인지
4. Today bucket의 Actual 값이 있는 경우 클릭 가능한 상태인지
5. Week bucket 클릭 시 date_from/date_to가 7일 범위로 생성되는지
6. Stage row 클릭 시 stage 파라미터가 유지되는지
7. All row 클릭 시 stage 파라미터 없이 전체 stage 기준으로 필터되는지
8. SubtestList에서 Gantt 날짜 필터 해제 시 관련 stage/cell_status가 함께 정리되는지
```

## 검증 항목

구현 후 아래를 확인하겠습니다.

```text
1. Progress Day 모드에서 Plan 숫자/영역 클릭 시 해당 계획 Test 목록으로 이동
2. Progress Day 모드에서 Actual 숫자/영역 클릭 시 해당 실적 Test 목록으로 이동
3. Progress Week 모드에서 Plan 클릭 시 해당 주간 계획 Test 목록으로 이동
4. Progress Week 모드에서 Actual 클릭 시 해당 주간 실적 Test 목록으로 이동
5. Today 날짜의 Plan Test가 클릭 가능한지 확인
6. Today 날짜의 Actual Test가 클릭 가능한지 확인
7. Future 날짜의 Actual은 기존 의도대로 비활성 또는 숨김 유지
8. Plan / Actual 숫자가 `/` 없이 명확히 구분되어 보이는지 확인
9. Stage All / Pred / T1 / T2 필터별 클릭 결과가 맞는지 확인
10. Group 기준 System / Subcontractor / Sub-Sub / PIC / Team별 클릭 결과가 맞는지 확인
11. Team 필터 적용 상태에서도 클릭 결과가 현재 화면 값과 일치하는지 확인
12. 이동 후 Subtest 목록의 필터 chip 표시가 이해하기 쉬운지 확인
13. 필터 해제 시 Gantt 클릭 관련 필터가 깔끔하게 제거되는지 확인
14. 기존 Dashboard Plan vs Actual 클릭 이동 로직은 깨지지 않는지 확인
15. `npm run test`와 `npm run build`로 최종 검증
```

## 최종 결과

개선 후 Progress Gantt-lite는 다음처럼 동작하게 됩니다.

```text
Plan 영역 클릭   → 해당 날짜/주간에 계획된 Test 목록
Actual 영역 클릭 → 해당 날짜/주간에 완료 실적이 있는 Test 목록
Today 셀 클릭    → 오늘 계획/실적 Test 목록 정상 이동
```

그리고 숫자 표기는 아래처럼 명확해집니다.

```text
기존:
5 / 3

변경:
P 5
A 3
Δ -2
```
