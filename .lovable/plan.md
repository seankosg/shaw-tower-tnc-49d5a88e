
## 문제 재정의
업로드한 캡처 기준으로 현재 동작은 정상 아닙니다.

사용자가 원하는 것은 **엑셀 틀고정**인데, 현재 구현은 아직도:
1. **단일 테이블 + sticky left** 방식이라 가로 스크롤바가 테이블 전체 폭 기준으로 그려지고
2. 페이지 레벨에서도 **가로 오버플로우가 살아 있어서** 스크롤바가 고정컬럼 아래를 넘어 **사이드바 하부까지** 침범하고 있습니다.

즉, 이전 수정은 “컬럼이 붙어 보이게”만 했지, **엑셀식 분리 패널 구조**는 아직 구현되지 않았습니다.

## 코드상 실제 원인
### 1) `src/pages/SubtestList.tsx`
현재 `SubtestTableView` 는 여전히 아래 구조입니다.

```tsx
<div ref={tableRef} className="rounded-md border max-h-[calc(100vh-220px)] overflow-auto">
  <Table style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}>
```

이건 **하나의 스크롤 컨테이너** 안에서 sticky 컬럼만 붙이는 방식입니다.  
그래서 가로 스크롤바는 본질적으로 **전체 컨테이너 하단**에 깔릴 수밖에 없습니다.

### 2) `src/components/layout/AppLayout.tsx`
현재 메인 영역이:

```tsx
<main className="flex-1 overflow-auto p-4">
```

입니다.  
여기서 넓은 테이블이 들어오면 **페이지 메인 자체가 가로로 커질 수 있어서**, 스크롤이 테이블 내부가 아니라 **레이아웃 전체**로 퍼집니다.

### 3) `src/components/ui/sidebar.tsx`
`SidebarInset` 에 `min-w-0` 이 없습니다.  
flex 레이아웃에서 이 값이 없으면 자식 콘텐츠(넓은 테이블)가 부모보다 커지면서 **옆 레이아웃을 밀어내는 현상**이 생길 수 있습니다.

## 수정 계획
### 1) Excel 방식으로 테이블 구조를 완전히 재구성
`src/pages/SubtestList.tsx` 의 `SubtestTableView` 를 아래처럼 **2패널 구조**로 바꿉니다.

```text
[FrozenPane: 현재 보이는 첫 3개 컬럼 | no horizontal scrollbar]
[ScrollPane: 나머지 컬럼들 | horizontal scrollbar only here]
```

- **FrozenPane**
  - 현재 보이는 첫 3개 visible column만 렌더
  - `overflow: hidden`
  - 가로 스크롤 없음
- **ScrollPane**
  - 4번째 컬럼 이후만 렌더
  - `overflow-x: auto; overflow-y: auto`
  - 가로 스크롤바는 **여기 하부에만** 존재

이렇게 해야만 스크롤바가 고정컬럼 아래에 나타나지 않습니다.

### 2) 세로 스크롤 동기화
두 패널은 별도 DOM 이 되므로:
- 오른쪽 ScrollPane의 `scrollTop` 을 기준으로
- 왼쪽 FrozenPane의 `scrollTop` 을 동기화합니다.

또한 마우스 휠이 왼쪽 고정영역 위에 있어도 자연스럽게 세로 스크롤되도록 휠 이벤트를 오른쪽 패널에 위임합니다.

### 3) 기존 sticky-left 로직 제거
현재의:
- `stickyOffsets`
- `stickyIdSet`
- `lastStickyId`
- `getStickyStyle(position: sticky, left: ...)`

이 로직은 제거합니다.  
엑셀 틀고정은 sticky-left 보정이 아니라 **패널 분리**가 핵심입니다.

### 4) 가상 스크롤은 유지
성능 최적화는 그대로 유지합니다.

- `useVirtualizer` 는 **오른쪽 ScrollPane** 에 붙이고
- 같은 `virtualRows` 결과를 좌/우 두 패널이 함께 사용합니다.

즉:
- 렌더링 행 수는 계속 적게 유지
- 좌우 패널의 행 높이/인덱스는 동일하게 유지

### 5) 레이아웃 레벨의 가로 오버플로우 차단
#### `src/components/layout/AppLayout.tsx`
메인 영역을 다음 방향으로 수정합니다.

- `flex-1` 유지
- `min-w-0` 추가
- `overflow-y-auto overflow-x-hidden` 로 분리

목적:
- 넓은 테이블 때문에 **페이지 전체**가 가로로 늘어나지 않게 함
- 가로 스크롤은 오직 테이블의 오른쪽 패널 안에서만 발생하게 함

#### `src/components/ui/sidebar.tsx`
`SidebarInset` 에 `min-w-0` 추가

목적:
- flex 자식이 콘텐츠 폭 때문에 부모를 밀어내는 현상 방지
- 사이드바 침범/하단 전체 스크롤바 확장 방지

## 세부 구현 포인트
- 고정 대상: **현재 보이는 첫 3개 컬럼**
- frozen width = 첫 3개 visible column width 합
- scroll width = 나머지 visible column width 합
- 헤더는 좌/우 패널 각각 `sticky top-0`
- 행 클릭 이동은 좌/우 모두 동일 적용
- hover 강조도 좌/우 패널이 함께 보이도록 row hover index state 로 동기화
- loading / empty 상태는 오른쪽 패널 기준으로 표시

## 변경 파일
| 파일 | 변경 |
|---|---|
| `src/pages/SubtestList.tsx` | 단일 테이블 + sticky 방식 제거, Excel식 `FrozenPane + ScrollPane` 구조로 재작성 |
| `src/components/layout/AppLayout.tsx` | 메인 콘텐츠 영역에 `min-w-0`, `overflow-x-hidden`, `overflow-y-auto` 적용 |
| `src/components/ui/sidebar.tsx` | `SidebarInset` 에 `min-w-0` 추가해 레이아웃 오버플로우 차단 |

## 구현 후 기대 결과
- 가로 스크롤바가 **현재 보이는 첫 3개 컬럼 아래에는 나타나지 않음**
- 가로 스크롤바가 **오른쪽 스크롤 컬럼 영역 아래에서만** 보임
- 사이드바 하부까지 이어지는 전체 페이지 가로 스크롤바 제거
- 좌측 3개 컬럼은 엑셀 틀고정처럼 완전히 고정
- 대용량 데이터에서도 기존 가상 스크롤 성능 유지

## 검증 기준
수정 후 Test Status 화면에서 아래 4가지를 확인합니다.
1. 하단 가로 스크롤바 시작점이 **4번째 visible column 아래부터**인지
2. 스크롤바가 **사이드바 아래까지 이어지지 않는지**
3. 첫 3개 컬럼이 가로 스크롤 중 완전히 고정되는지
4. 세로 스크롤 시 좌/우 패널 행이 어긋나지 않는지

## 참고 판단
이번 문제는 “스타일 미세조정”이 아니라 구조 문제입니다.  
따라서 `sticky left` 보정이나 마스킹 div 같은 임시방편이 아니라, **엑셀식 2패널 구조로 교체**하는 것이 맞습니다.
