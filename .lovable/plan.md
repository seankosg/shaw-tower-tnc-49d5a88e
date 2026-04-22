
# Plan: Progress 탭 테이블 스크롤/우측 패널 사용성 개선

## 목표

1. Progress 탭의 Schedule 테이블에서 가로 스크롤바가 Sticky 컬럼 영역까지 침범하지 않도록 수정합니다.
2. 오른쪽의 High Risk / T1 Bottleneck / Lagging Groups 패널은 기본적으로 숨김 상태로 두고, 필요할 때 펼쳐볼 수 있게 변경합니다.

## 변경 범위

### 1. 테이블 가로 스크롤 영역 분리

대상 파일:

```text
src/components/schedule/ScheduleMatrix.tsx
```

현재 구조는 헤더/바디 전체 폭에 가로 스크롤이 걸려 있어, Sticky 컬럼 영역 위로 스크롤바가 지나가며 조작성이 떨어집니다.

수정 방향:

```text
Sticky 영역: System + Total Scope + Up to Today
Timeline 영역: 날짜 컬럼만 가로 스크롤
```

즉 스크롤 조작 영역을 Timeline 날짜 컬럼 쪽으로 제한해서, Sticky 컬럼은 항상 고정되고 스크롤바가 Sticky 컬럼 위를 덮지 않게 합니다.

구현 방식:

- 기존 `headerScrollRef`, `bodyScrollRef` 동기화 구조는 유지합니다.
- 스크롤 컨테이너의 시각적/조작 영역이 Sticky 컬럼을 덮지 않도록 레이아웃을 조정합니다.
- Sticky 컬럼 오른쪽 경계에 배경/그림자/z-index를 명확히 지정해 Timeline 셀이 뒤로 지나가더라도 침범해 보이지 않게 합니다.
- 필요 시 스크롤바가 날짜 영역 하단에만 나타나도록 패딩 또는 wrapper 구조를 조정합니다.

예상 결과:

```text
Before:
[Sticky columns + Timeline 전체에 스크롤바 표시]

After:
[Sticky columns 고정] [Timeline 영역에만 스크롤바 표시]
```

### 2. 우측 High Risk / Bottleneck 패널 기본 숨김

대상 파일:

```text
src/pages/SchedulePage.tsx
src/components/schedule/CriticalWatchlist.tsx
```

현재는 Progress 테이블 오른쪽에 `CriticalWatchlist`가 항상 표시되어 테이블 가로 공간을 줄이고 있습니다.

수정 방향:

- 기본 상태: 우측 패널 숨김
- 사용자가 버튼을 누르면 펼침
- 다시 누르면 접힘
- 접힌 상태에서는 테이블이 전체 폭을 사용

UI 예시:

```text
[ Progress table full width ]                          [Show Risk Panel]

클릭 후:

[ Progress table ]  [ High Risk / T1 Bottleneck / Lagging Groups ]
```

구현 방식:

- `SchedulePage.tsx`에 `showRiskPanel` state 추가
- 기본값은 `false`
- Toolbar 또는 Matrix 상단 우측에 작은 버튼 추가:
  - 숨김 상태: `Show Risk Panel`
  - 펼침 상태: `Hide Risk Panel`
- `showRiskPanel === true`일 때만 `CriticalWatchlist` 렌더링
- 펼친 상태에서도 화면이 좁으면 레이아웃이 깨지지 않도록 반응형 처리

### 3. 우측 패널 접기/펼치기 UX 개선

대상 파일:

```text
src/components/schedule/CriticalWatchlist.tsx
```

패널이 펼쳐졌을 때 사용자가 쉽게 닫을 수 있도록 패널 상단에 닫기 버튼을 추가합니다.

예상 형태:

```text
High Risk / Bottleneck
[Close]
```

또는 `SchedulePage.tsx`의 토글 버튼 하나로 제어해도 됩니다.

### 4. 기존 데이터/계산 로직 유지

이번 변경은 레이아웃 및 표시 방식 개선입니다.

다음 로직은 변경하지 않습니다.

- High Risk 계산
- T1 Bottleneck 계산
- Lagging Groups 계산
- 날짜별 Plan / Actual 집계
- 테이블 셀 클릭 필터 이동
- Overdue / Critical / Upcoming KPI 계산

## 예상 결과

수정 후 Progress 탭은 다음처럼 동작합니다.

```text
1. 테이블 Sticky 컬럼은 안정적으로 고정됩니다.
2. 가로 스크롤바가 Sticky 컬럼 위를 침범하지 않습니다.
3. 날짜 Timeline 영역을 더 쉽게 스크롤할 수 있습니다.
4. High Risk / Bottleneck 패널은 기본적으로 숨겨져 테이블 폭이 넓어집니다.
5. 필요할 때 버튼으로 우측 패널을 펼쳐 확인할 수 있습니다.
```

## 검증 항목

구현 후 아래를 확인합니다.

```text
- Progress 탭 진입 시 우측 패널이 기본 숨김인지
- 테이블이 기존보다 넓게 표시되는지
- Timeline 가로 스크롤이 Sticky 컬럼을 덮지 않는지
- 날짜 헤더와 바디 스크롤이 계속 동기화되는지
- Show/Hide Risk Panel 버튼이 정상 동작하는지
- High Risk / T1 Bottleneck / Lagging Groups 항목 클릭 이동이 기존처럼 동작하는지
```
