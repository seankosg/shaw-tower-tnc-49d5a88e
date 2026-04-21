

# 모바일 레이아웃 개선 계획

## 발견된 문제점

### 1. Dashboard KPI 카드 (심각)
- `grid-cols-3`으로 375px 화면에서 6개 카드가 3열로 표시
- 라벨이 "Sy...", "Tot...", "Re...", "Ov..."로 잘림
- **수정**: 모바일에서 `grid-cols-2`, 태블릿에서 `grid-cols-3`, 데스크탑에서 `grid-cols-6`

### 2. S-Curve 카드 헤더 (심각)
- `flex-row`로 타이틀 + 날짜 피커 2개 + Daily/Weekly 토글이 한 줄에 배치
- 375px에서 버튼들이 넘치거나 잘림
- **수정**: 모바일에서 타이틀/컨트롤을 세로 스택으로 변경, 날짜 피커와 토글을 `flex-wrap`

### 3. Plan vs Actual Breakdown 탭 (중간)
- 5개 탭(System, Subcontractor, Sub-Sub, HDEC PIC, Team)이 한 줄에 배치
- 모바일에서 탭이 잘리거나 스크롤 불가
- **수정**: `TabsList`에 `flex-wrap` 또는 가로 스크롤 적용

### 4. Schedule 페이지 툴바 (중간)
- 5개 ToolbarGroup(Group, Team, Bucket, Stage, Range, Lookup)이 `flex-wrap`이지만, 개별 그룹 내 탭/버튼이 모바일에서 여전히 밀집
- **수정**: 모바일에서 2열 그리드 또는 수직 스택으로 변경

### 5. AppLayout 헤더 (경미)
- 브레드크럼 + Import 인디케이터가 `h-12` 안에 배치 — 모바일에서 텍스트가 잘릴 수 있음
- **수정**: Import 인디케이터 텍스트를 모바일에서 축약

## 변경 파일 및 내용

### `src/pages/DashboardPage.tsx`

| 영역 | 변경 |
|------|------|
| KPI 그리드 (line 222) | `grid-cols-3 md:grid-cols-6` → `grid-cols-2 sm:grid-cols-3 md:grid-cols-6` |
| S-Curve 카드 헤더 (line 268) | `flex-row` → `flex-col sm:flex-row`, 컨트롤 영역에 `flex-wrap gap-2` |
| Breakdown 탭 (line 363) | `TabsList`에 `flex-wrap h-auto` 추가 |

### `src/pages/SchedulePage.tsx`

| 영역 | 변경 |
|------|------|
| 툴바 카드 (line 239) | `flex-wrap` 유지하되 모바일에서 각 ToolbarGroup이 `w-full sm:w-auto`로 전체 너비 사용 |

### `src/components/layout/AppLayout.tsx`

| 영역 | 변경 |
|------|------|
| Import 인디케이터 (line 55-63) | 파일명 `max-w-[180px]`을 모바일에서 `max-w-[100px] sm:max-w-[180px]`으로 축소 |

## 변경하지 않는 부분

- **사이드바**: 이미 모바일에서 Sheet(오버레이)로 동작 — 정상
- **로그인 페이지**: 모바일에서 적절히 표시됨
- **MobileUpdatePage**: 이미 모바일 전용으로 설계됨 — 카드 기반 레이아웃

