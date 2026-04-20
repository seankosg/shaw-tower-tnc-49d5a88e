

## 가로 스크롤바를 sticky 컬럼 우측 영역에만 위치시키기 — 재수정

### 지난 시도가 실패한 이유
이중 컨테이너(`overflow-y-auto` 외부 + `overflow-x-auto` 내부)로 분리했지만:
- 내부 가로 스크롤 컨테이너가 **자체 콘텐츠 높이만큼 늘어남** → 가로 스크롤바가 viewport 하단이 아닌 **행들의 맨 아래**에 위치
- 행이 많거나 가상화로 큰 가짜 높이가 생기면 스크롤바가 보이지 않거나 페이지 끝에 매달림
- 결과: 사용자가 가로 스크롤하려면 페이지 전체가 같이 움직이는 듯한 인상

### 진짜 해법 — 단일 스크롤 컨테이너 + sticky 양방향
이중 컨테이너를 **하나로 통합**합니다:

```
<div ref={tableRef} className="rounded-md border max-h-[calc(100vh-220px)] overflow-auto">
  <Table style={{ width: totalSize, tableLayout: 'fixed' }}>
    <TableHeader className="sticky top-0 z-20"> ...
    <TableBody> ... sticky left columns ...
  </Table>
</div>
```

**작동 원리**:
- 단일 컨테이너에 `overflow: auto` → 가로/세로 스크롤바 모두 이 컨테이너 **자체 가장자리**(우측·하단)에 부착
- 가로 스크롤바는 컨테이너 **바닥**(= viewport 하단 부근)에 항상 고정
- `position: sticky top: 0` → 헤더가 위에 고정 (현재도 작동)
- `position: sticky left: <offset>` → 좌측 3컬럼이 가로 스크롤 시 그대로 정지
- 가로 스크롤바 트랙 자체는 컨테이너 너비 전체에 걸쳐 있지만, **사용자는 "스크롤되는 콘텐츠"가 sticky 컬럼 우측에서만 움직이는 것**을 보게 되므로 시각적/기능적으로 의도한 동작 그대로

### 가상 스크롤 호환성
- `useVirtualizer` 의 `getScrollElement: () => tableRef.current` 그대로 → 이미 통합 컨테이너를 가리키므로 변경 불필요
- 세로 가상화와 가로 sticky가 같은 스크롤 컨텍스트에서 자연스럽게 공존

### 변경 요약
| 파일 | 변경 |
|---|---|
| `src/pages/SubtestList.tsx` | `SubtestTableView` 의 외부 div `overflow-y-auto overflow-x-hidden` → `overflow-auto`, 내부 `<div className="overflow-x-auto">` 래퍼 **제거** |

가상 스크롤, sticky 헤더, sticky 컬럼, 캐싱, debounce 등 다른 로직은 그대로.

### 추가로 가로 스크롤바를 "sticky 컬럼 너비만큼 좌측은 가린 것처럼" 보이게 하려면 (선택)
브라우저 기본 스크롤바는 컨테이너 전체 너비에 걸쳐 그려지므로, **시각적으로 좌측 일부를 가리려면** sticky 컬럼 영역 위에 배경색이 같은 작은 div를 `position: sticky; bottom: 0; left: 0; width: <stickyTotal>; height: <scrollbarHeight>; z-index: 25` 로 덮어 가로 스크롤바 좌측 부분을 시각적으로 마스크. 단, 이건 화장적 효과일 뿐 실제 스크롤 동작은 위 단일 컨테이너 방식으로 이미 정상.

**권장**: 일단 단일 컨테이너 방식만 적용하고, 시각적으로 거슬리면 마스크 div 추가.

