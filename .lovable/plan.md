## 문제 진단

스크린샷과 `src/pages/DefectRawDataPage.tsx` (라인 1261-1319), `src/components/raw-data/TopHorizontalScrollbar.tsx` 검토 결과:

### 문제 1: 가로 스크롤바가 너무 얇음
- `TopHorizontalScrollbar.tsx` 62번 줄에서 미러 스크롤바 높이가 **`h-[12px]`**로 하드코딩되어 있어 마우스로 잡기 어려움.
- 좌측 frozen 패널 본문 첫 행에도 동일한 `height: 12` spacer (1268번 줄)가 있어, 미러 스크롤바 높이를 변경하면 함께 맞춰야 함.

### 문제 2: 좌/우 패널 같은 행이 정렬되지 않고 동시에 움직이지 않음
세 가지 원인이 결합되어 있음:

1. **행 높이가 가변**: `estimateSize: () => 36`이지만 셀 내용(아이콘 vs 텍스트, 줄바꿈)에 따라 좌/우 패널의 실제 행 높이가 달라져 점점 어긋남. `style={{ height: virtualRow.size }}`만으로는 td 내부 컨텐츠가 더 크면 늘어나는 것을 막지 못함.
2. **수직 스크롤이 좌→우 단방향**: `handleScroll`은 우측(tableRef) 스크롤만 좌측(frozenPaneRef)에 동기화. 좌측 패널은 wheel을 우측으로 위임만 하고 자체 스크롤은 못 받음 → 트랙패드 모멘텀/터치에서 미세한 어긋남 발생.
3. **첫 행 spacer 높이 불일치 가능성**: 좌측 본문에는 12px spacer가 있지만 우측 본문에는 없음(우측은 미러 스크롤바가 테이블 밖에 있어 spacer 불필요). 현재는 의도적이지만, 미러 스크롤바 높이를 키울 경우 다시 점검 필요.

## 수정 계획

### A. `src/components/raw-data/TopHorizontalScrollbar.tsx`
- 스크롤바 트랙 높이를 **`h-[12px]` → `h-[16px]`**로 확대 (윈도우/맥 기본 스크롤바와 비슷하게 잡기 쉬운 두께).
- 콘텐츠 spacer height도 동일하게 조정.

### B. `src/pages/DefectRawDataPage.tsx` (DefectRawTableView)

**행 높이 강제 고정 (정렬 문제 핵심 수정)**
- 좌/우 양쪽 `<TableRow>`에 `style={{ height: virtualRow.size }}` 외에 **`maxHeight` 고정 + 셀 `overflow: hidden`** 적용.
- 좌측 본문 첫 줄 spacer를 12 → 16으로 변경 (미러 스크롤바 높이 변경에 맞춤).

**수직 스크롤 양방향 동기화**
- 좌측 frozen 패널을 `overflow-hidden` → `overflow-y-auto scrollbar-hide`로 바꾸고, 좌측 스크롤 이벤트도 우측 `tableRef`로 동기화하는 핸들러 추가. (현재는 `onWheel`만 처리해서 트랙패드 모멘텀 시 미세 어긋남 발생)
- 양방향 sync 무한루프 방지를 위해 `isSyncingRef` 플래그 사용 (TopHorizontalScrollbar와 동일 패턴).

**Virtualizer 단일화**
- 현재 좌/우가 같은 `rowVirtualizer`를 공유하므로 `paddingTop/paddingBottom`은 동일. 이 부분은 그대로 유지.

### C. (선택) SubtestList의 동일 컴포넌트도 같은 수정 적용 여부
- `SubtestList.tsx`도 `TopHorizontalScrollbar`를 사용 → A의 변경사항(높이 16px)이 자동 적용됨. 별도 코드 수정 불필요하나, 행 정렬 이슈가 동일하게 있다면 사용자 피드백 후 동일 패턴 적용 가능.

## 변경 파일 요약
1. `src/components/raw-data/TopHorizontalScrollbar.tsx` — 트랙 높이 12 → 16px
2. `src/pages/DefectRawDataPage.tsx` — 좌측 패널 수직 스크롤 양방향 동기화, 셀 overflow 고정, spacer 높이 조정

## 영향 범위
- Defect Raw Data 페이지의 가로 스크롤바가 두꺼워져 조작이 쉬워짐.
- 좌/우 패널 행이 픽셀 단위로 정렬되며, 트랙패드/마우스 휠/터치 어디서 스크롤해도 동시에 움직임.
- SubtestList의 가로 스크롤바도 동일하게 두꺼워짐 (보너스).
