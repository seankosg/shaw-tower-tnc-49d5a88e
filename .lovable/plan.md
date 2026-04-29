## 문제 정의
지금 보이는 문제는 더 이상 "행 높이" 문제가 아닙니다. 스크린샷 기준으로는 **행끼리의 세로 정렬은 어느 정도 맞았지만**, 테이블 셸 자체가 잘못 구성되어 있어서 다음 두 문제가 새로 드러났습니다.

1. **가로 스크롤바가 고정 컬럼 영역까지 침범함**
2. **컬럼 헤더가 고정 컬럼처럼 유지되지 않아 화면에서 사라짐**

즉, 현재 상태는 부분 수정으로 유지할 구조가 아니라, **헤더/바디/상단 스크롤바의 좌표계를 다시 설계해야 하는 상태**입니다.

## Do I know what the issue is?
Yes.

## 정확한 원인
### 1) 헤더에는 sticky 고정이 적용되지 않았습니다
현재 `src/pages/DefectRawDataPage.tsx`를 확인해보면:
- 바디 셀(`TableCell`)에는 `position: sticky`, `left: stickyLefts[cellIdx]`가 적용되어 있습니다.
- 하지만 헤더 셀(`TableHead`)에는 동일한 sticky 처리가 없습니다.

결과:
- 바디의 왼쪽 고정 컬럼은 남아 있음
- 헤더는 전체가 통째로 좌우 스크롤됨
- 그래서 가로 스크롤 시 **헤더 텍스트가 화면 밖으로 밀려 사라지는 것처럼 보임**

사용자 화면에서 "데이터는 보이는데 헤더는 안 보이는" 이유가 이것입니다.

### 2) 상단 가로 스크롤바의 기준 폭이 잘못되었습니다
현재 `TopHorizontalScrollbar`는 `width={totalWidth}`를 그대로 사용하고 있고, 바 전체가 테이블 전체 폭 기준으로 렌더됩니다.

하지만 실제 UI에서는:
- 왼쪽 일부 컬럼은 고정 영역
- 오른쪽만 진짜 가로 스크롤 대상

이어야 합니다.

그런데 지금은 상단 스크롤바가 **고정 영역 + 스크롤 영역 전체**를 모두 자기 영역으로 간주하고 있어,
사용자 눈에는 스크롤바가 고정 컬럼 위까지 이어진 것처럼 보입니다.

### 3) 헤더/상단 스크롤바/바디가 서로 다른 레이어로 분리되어 있습니다
현재 구조는 크게 3조각입니다.

```text
[별도 헤더 컨테이너]
[별도 상단 가로스크롤 미러]
[별도 바디 스크롤 컨테이너]
```

이 구조는 다음 문제가 있습니다.
- 헤더는 자체적으로 스크롤되지 않고 body의 scrollLeft를 복사받음
- 상단 바도 body의 scrollLeft를 복사받음
- 바디만 실제 스크롤 원본임

즉, 한 축을 3개 레이어로 억지 동기화하는 구조라서,
행 정렬 문제가 일부 해결되어도 **헤더/스크롤바 좌표 불일치가 계속 발생**합니다.

## 결론: 계속 덧패치할지, 다시 작업할지
**다시 작업하는 쪽이 맞습니다.**

정확히는 전체 페이지를 다시 만드는 것이 아니라,
`Defect Raw Data`의 **테이블 셸(shell)** 만 다시 구성해야 합니다.

계속 현재 구조에 패치를 얹으면:
- 헤더 sticky 보정
- 상단 스크롤바 보정
- scrollLeft 복제 보정
- z-index/background 보정
- frozen width spacer 보정

이 식으로 증상별 응급처치가 반복됩니다.

이번에는 **행 렌더링은 유지하되, 헤더/스크롤/고정컬럼 레이어 구조를 재설계**하는 방식으로 가야 합니다.

## 실행 계획
### 1) 헤더를 별도 미러 컨테이너에서 분리하고, 같은 좌표계로 재배치
현재의 `headerScrollRef` 기반 복제 구조를 제거합니다.

목표는 두 가지 중 하나입니다.
- **우선안**: 같은 스크롤 컨테이너 안에 헤더를 두고 `sticky top-0` 적용
- **대안**: 헤더를 분리 유지하되, 바디와 동일하게 frozen/sticky 계산을 적용

이번 케이스에서는 **우선안**이 더 안전합니다. 이렇게 하면:
- 헤더와 바디가 같은 horizontal scroll context를 공유
- 왼쪽 frozen 헤더도 body와 동일한 `left` 오프셋 사용 가능
- 현재처럼 "body만 sticky, header는 비sticky" 상태가 사라짐

### 2) 헤더 셀에도 frozen sticky 로직을 동일 적용
바디에서 쓰는 아래 개념을 헤더에도 똑같이 적용합니다.
- `cellIdx < frozenCount`
- `left: stickyLefts[idx]`
- 적절한 `z-index`
- 배경색 고정
- 마지막 frozen 컬럼 그림자 처리

즉,
- **헤더의 고정 컬럼**
- **바디의 고정 컬럼**

둘이 완전히 같은 기준으로 움직이게 만듭니다.

### 3) 상단 가로 스크롤바를 "스크롤 가능 영역만" 담당하도록 재구성
현재처럼 전체 폭 위에 얇은 바를 얹는 구조 대신,
상단 바를 아래처럼 분리합니다.

```text
[왼쪽 frozen spacer: frozenWidth]
[오른쪽 top scrollbar: totalWidth - frozenWidth]
```

핵심은:
- 상단 바의 시작 위치를 `frozenWidth` 뒤로 밀기
- 실제 thumb 계산도 non-frozen 영역 기준으로 맞추기
- 시각적으로 스크롤바가 고정 컬럼 위를 지나가지 않게 만들기

필요하면 `TopHorizontalScrollbar.tsx` 자체를 수정해서,
`leftOffset` 또는 `stickyOffset` 개념을 받도록 바꿉니다.

### 4) 스크롤 원본을 하나만 남기고 나머지는 파생 뷰로 단순화
현재는 body scroll → header mirror / top scrollbar mirror 구조입니다.

수정 후에는:
- 실제 가로 스크롤 원본은 body 1개
- 헤더는 같은 컨테이너 안에서 자동 동작하거나 최소한 동일 좌표계 사용
- top scrollbar는 body의 단순 미러이되 frozen 영역을 제외한 레이아웃으로 표시

즉, 동기화 포인트를 줄여서 다시 깨질 가능성을 낮춥니다.

### 5) 시각적 검증 기준을 명확히 두고 마무리
다음 조건을 모두 통과해야 완료로 보겠습니다.
- 왼쪽 frozen 컬럼의 헤더가 항상 보일 것
- 가로 스크롤 시 헤더와 바디의 컬럼 경계가 일치할 것
- 상단 스크롤바가 frozen 영역 위를 덮지 않을 것
- 스크롤 중 헤더 텍스트가 사라지지 않을 것
- 현재 맞춰놓은 행 정렬을 다시 깨지 않을 것

## 수정 대상 파일
- `src/pages/DefectRawDataPage.tsx`
- `src/components/raw-data/TopHorizontalScrollbar.tsx`
- 필요 시 `src/components/ui/table.tsx`는 건드리지 않고 페이지 레벨에서 처리

## 기술 메모
현재 구조:
```text
Header (별도) + Top scrollbar (별도) + Body (별도 scroll source)
=> 같은 축을 3개 레이어가 복제
=> frozen/header/scrollbar 불일치 발생
```

목표 구조:
```text
Single horizontal coordinate system
- sticky header
- sticky left columns for both header/body
- top scrollbar visually starts after frozen area
```

## 기대 결과
이번 수정의 목표는 단순 미세조정이 아니라:
- 헤더가 사라지는 문제 제거
- 상단 가로스크롤바가 고정컬럼을 침범하는 문제 제거
- 앞으로 frozen 컬럼 개수 변경에도 덜 깨지는 구조 확보

승인해 주시면 이번에는 **현재 구조를 계속 덧대는 방식이 아니라, 테이블 셸을 다시 정리하는 방식**으로 작업하겠습니다.