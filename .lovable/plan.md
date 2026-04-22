
## 목표

Plan vs Actual Breakdown 표에서 업로드하신 이미지 영역의 현재 표시 방식:

```text
Total Subtests | Stage
40             | Pred 40/40 (0)
               | T1   0/40 (40)
               | T2   0/40 (40)
```

을 Stage별로 더 명확하게 읽히도록 아래 구조로 재정렬하겠습니다.

```text
Group | Stage | Total | Done | Remain | To Data Date ... | Data Date ... | Today ... | Progress
```

즉, 각 Stage 행마다 `Total / Done / Remain`을 독립 컬럼으로 보여주고, 기존처럼 Stage 셀 안에 `40/40 (0)`을 작게 붙여두는 방식은 제거하겠습니다.

## 변경 방향

### 1. Plan vs Actual 표의 좌측 컬럼 재구성

현재 좌측 컬럼:

```text
System/Subcontractor/...
Total Subtests
Stage
```

수정 후:

```text
System/Subcontractor/...
Stage
Total
Done
Remain
```

예시:

```text
System        Stage   Total   Done   Remain
Fire Lift     Pred       40     40        0
              T1         40      0       40
              T2         40      0       40
```

### 2. Stage별 Done / Remain 계산 기준

기존 Stage 셀에서 이미 사용 중인 기준을 유지하겠습니다.

```text
Total  = 해당 그룹의 전체 Subtest 수
Done   = 해당 Stage의 To Data Date Actual, 즉 cumActual
Remain = Total - Done
```

따라서 기존 `40/40 (0)` 표시는 다음과 같이 분리됩니다.

```text
기존: Pred 40/40 (0)

변경:
Stage  = Pred
Total  = 40
Done   = 40
Remain = 0
```

### 3. 디자인 개선

좌측 Stage 요약 영역을 표 안에서 더 잘 구분되도록 개선하겠습니다.

적용 방향:

- `Stage`는 기존 badge 스타일 유지
- `Total`, `Done`, `Remain`은 숫자 정렬을 맞추기 위해 `tabular-nums` 적용
- `Done`은 완료 의미가 잘 보이도록 약간 강조
- `Remain`은 남은 수량이 있을 때만 시각적으로 강조
- `0` 값은 기존 요청처럼 흐린 회색 유지
- 좌측 요약 컬럼과 Plan/Actual 지표 영역 사이에 border를 추가해 영역 구분 강화
- 행 높이와 padding을 조정해 업로드 이미지처럼 조밀하지만 읽기 쉬운 형태로 정리

예상 형태:

```text
System     Stage   Total   Done   Remain | To Data Date ... | Data Date ... | Today ...
Fire Lift  Pred      40     40      0    | ...
           T1        40      0     40    | ...
           T2        40      0     40    | ...
```

### 4. 헤더 정렬 및 스크롤 구조 유지

현재 Plan vs Actual 표는 헤더와 본문을 분리해 스크롤 정렬을 맞추고 있으므로, 다음 항목을 함께 조정하겠습니다.

- `colgroup` 폭 재계산
- 헤더 테이블과 본문 테이블의 컬럼 수 일치
- `colSpan` 값 수정
- 빈 데이터 row의 `colSpan` 수정
- 가로 스크롤 최소 너비 조정
- group row의 `rowSpan={3}` 구조 유지

### 5. Excel export도 동일 구조로 업데이트

화면에서 좌측 구조가 바뀌면 Excel export도 동일하게 맞추겠습니다.

현재 Excel 좌측:

```text
Group | Total Subtests | Stage
```

수정 후:

```text
Group | Stage | Total | Done | Remain
```

Excel에서도 Stage별 Total / Done / Remain이 별도 컬럼으로 표시되도록 수정하겠습니다.

## 수정 대상 파일

```text
src/pages/DashboardPage.tsx
src/lib/dashboard-excel-export.ts
```

## 검증 항목

구현 후 아래를 확인하겠습니다.

1. Plan vs Actual Breakdown 표 좌측이 `Stage / Total / Done / Remain` 순서로 표시되는지 확인
2. Pred / T1 / T2 각 행마다 Total, Done, Remain이 독립적으로 표시되는지 확인
3. 기존 `40/40 (0)` 형태가 제거되고 가독성이 개선되는지 확인
4. 0 값은 흐린 회색으로 유지되는지 확인
5. Remain 값이 있는 경우 눈에 잘 띄는지 확인
6. System 필터 버튼과 필터 팝업 동작 유지
7. 숫자 클릭 시 Raw Data 이동 필터 유지
8. 헤더와 본문 컬럼 정렬 유지
9. 가로/세로 스크롤 동작 유지
10. Excel export도 변경된 좌측 구조와 동일하게 출력되는지 확인
11. `npm run build`로 빌드 확인
