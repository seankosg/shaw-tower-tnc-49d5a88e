## 목표
`Defect Progress Status` 페이지(`src/pages/DefectProgressPage.tsx`)를 대시보드/Raw Data와 동일한 방식으로 **Pre CSC / Post CSC 탭**으로 분리한다. `defect_items.is_post_csc` 필드를 기준으로 데이터셋을 분리하고, URL 파라미터 `?csc=pre|post`로 탭 상태를 유지한다.

## 변경 사항

### 1. `src/pages/DefectProgressPage.tsx`
- `useSearchParams`에서 `csc` 파라미터 읽어 `cscTab: 'pre' | 'post'` state 추가 (기본값 `pre`).
- 페이지 상단 헤더 아래에 `Tabs` UI 추가:
  - `Pre CSC` / `Post CSC` 두 개 트리거
  - 선택 시 `setSearchParams`에 `csc` 반영 (기존 필터 파라미터 유지)
- `useDefectCache()`로 로드한 전체 `defects` 배열을 **`is_post_csc` 기준으로 필터**한 결과를 하위 로직(스케줄 매트릭스, KPI, 통계, 엑셀 내보내기, Critical Watchlist)에 전달.
  - `const scopedDefects = useMemo(() => defects.filter(d => cscTab === 'post' ? d.is_post_csc === true : d.is_post_csc !== true), [defects, cscTab])`
  - 이후 페이지 내에서 `defects`를 참조하는 모든 계산 지점을 `scopedDefects`로 교체.
- 엑셀 파일명(`exportDefectScheduleToExcel`, `exportDefectArrayToExcel`)에 `pre-csc` / `post-csc` 접미사 추가.
- Post CSC에 아직 데이터가 없을 때 매트릭스 하단에 안내 메시지(빈 상태 배너)만 표시하고 기존 컴포넌트 렌더는 그대로 유지.

### 2. 진입 경로 유지
- 대시보드/Raw Data의 `goProgress` 유틸이 있는 경우 현재 `csc` 값을 함께 전달. (없으면 이번 작업 범위 외)
- 사이드바 링크는 기본 `?csc=pre`를 붙이지 않고, 페이지 내부에서 미지정 시 `pre`로 fallback 처리.

## 기술 메모
- 데이터 소스: `useDefectCache()` (이미 `is_post_csc` 컬럼 포함되어 있음, 기존 마이그레이션 완료).
- 스키마/DB 변경 없음. 프론트엔드 전용 수정.
- 기존 필터 상태(team, plan_mode, stage_view, hide_past, group 등)와 CSC 탭은 독립적으로 동작하며 URL에 공존.
