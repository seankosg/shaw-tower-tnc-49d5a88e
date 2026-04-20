

## Sticky Header & Sticky Left Column 구현

### 현재 상태
`ScheduleMatrix.tsx`의 헤더가 `sticky top-0`로 되어있으나, 매트릭스 컨테이너 자체가 `overflow-x-auto`만 있고 세로 스크롤이 페이지 전체에서 발생 → 헤더가 페이지 스크롤 시 따라 사라짐.

### 변경 방안

**1. Matrix 컨테이너에 고정 높이 + 세로 스크롤**
- `overflow-x-auto` → `overflow-auto` (가로+세로 둘 다)
- `max-h-[calc(100vh-260px)]` 부여 (toolbar+KPI 높이 제외)
- 이로써 sticky top이 컨테이너 내부에서 동작

**2. 헤더 sticky 보강**
- 헤더 행: `sticky top-0 z-30` (현재 z-20 → 30으로 상향)
- 헤더의 좌측 4열(Group/Done-Total/Cum Plan/Cum Actual)은 `sticky left-0 z-40` (corner cell)

**3. 본문 행의 좌측 4열 sticky 유지**
- 이미 `sticky left-0`인데 z-index 정리:
  - 본문 좌측 sticky cell: `z-10`
  - 헤더 우측 날짜 cell: `z-20`
  - 헤더 좌측 corner: `z-30`

**4. 배경색 누락 보정**
sticky 셀은 배경 불투명 필수. 현재 `bg-card` / `bg-muted/60` 적용 중인데, hover 시 비치지 않도록 본문 좌측 sticky div에 명시적 `bg-card` 유지 (행 hover는 우측 셀에만 영향).

### 변경 파일
- `src/components/schedule/ScheduleMatrix.tsx` 단일 파일 수정 (컨테이너 클래스 + z-index 조정)

### 검증
1. 페이지 세로 스크롤 → Toolbar/KPI는 페이지와 함께 스크롤(정상), Matrix는 자체 영역 내 스크롤
2. Matrix 세로 스크롤 → 날짜 헤더 행 고정
3. Matrix 가로 스크롤 → System/통계 4열 고정
4. 양방향 스크롤 → 좌상단 corner(헤더 좌측 4열)가 모든 것 위에 고정
5. 행 펼침(Pred/T1/T2 sub-row) 후에도 sticky 정상 동작

