## 목표
T&C(Subtests)와 Defects의 Raw Data 첫 컬럼에 `Critical` 체크박스를 추가하고, 체크된 항목을 각 Dashboard 하단(Top 10 Overdue + Status Distribution 자리)에 가로 폭 전체로 표시. 팀/협력업체 필터와 연동.

## 1) DB 스키마 변경 (migration)

- `subtests` 테이블: `is_critical BOOLEAN NOT NULL DEFAULT false` 컬럼 추가
- `defects` 테이블: `is_critical BOOLEAN NOT NULL DEFAULT false` 컬럼 추가
- 두 테이블에 부분 인덱스: `WHERE is_critical = true`
- RLS는 기존 정책이 모든 컬럼에 자동 적용되므로 추가 정책 불필요. 단 D.Super User 등 기존 UPDATE 권한 정책으로 토글 가능 여부 확인됨(기존 UPDATE 정책 그대로 사용).

## 2) Raw Data 첫 컬럼 추가

### Subtests Raw Data (`src/pages/SubtestList.tsx` 또는 해당 raw-data 페이지)
- 컬럼 정의 배열의 맨 앞에 `critical` 체크박스 컬럼 삽입
  - 헤더: "Critical"
  - 셀: `<Checkbox checked={row.is_critical} onCheckedChange={...}>` → `supabase.from('subtests').update({ is_critical }).eq('id', row.id)` 호출 후 로컬 상태 갱신
  - 너비 고정(56px), pinned 아닌 일반 컬럼
- 기존 컬럼 필터 시스템에 `is_critical` boolean 필터 추가(All / Critical only / Non-critical)

### Defects Raw Data (`src/pages/DefectRawDataPage.tsx`)
- 동일 패턴으로 첫 컬럼 추가, `defects` 테이블 update

## 3) Dashboard 하단 섹션 교체

### `src/pages/DashboardPage.tsx` (T&C Dashboard)
- 라인 578~633의 `grid lg:grid-cols-2` 블록(Top 10 Overdue Subtests + Status Distribution) 삭제
- 그 자리에 가로 풀폭 `<CriticalSubtestsPanel />` 카드 삽입

### `src/pages/DefectDashboardPage.tsx` (Defect Dashboard)
- 라인 599~602의 동일 grid 블록 삭제
- 그 자리에 가로 풀폭 `<CriticalDefectsPanel />` 카드 삽입

## 4) Critical 패널 컴포넌트 (신규)

`src/components/dashboard/CriticalSubtestsPanel.tsx`
`src/components/dashboard/CriticalDefectsPanel.tsx`

각 패널 구성:
- 헤더: "Critical Items" + 총 개수 배지 + "Open in Raw Data" 버튼(`?critical=1` 파라미터로 이동)
- 필터 toolbar:
  - Group by: Team / Subcontractor (Tabs)
  - Team 멀티 셀렉트 / Subcontractor 멀티 셀렉트 (기존 raw-data 필터 옵션 재사용)
- 본문: 그룹화된 테이블
  - 그룹별 카운트 헤더(예: `Team A · 5 items`)
  - 행: 핵심 식별자(System/Item No/MOS or Issue No/Level) + Subcontractor + 상태 + Days Late + 행 클릭 시 상세 페이지 이동
- 데이터 소스: 이미 Dashboard에서 로딩한 `subtests`/`defects` 배열을 prop으로 받아 `is_critical = true` 필터링(추가 fetch 불필요)
- 빈 상태: "No critical items"

## 5) Raw Data ↔ Dashboard 연동

- Critical 패널의 행/그룹 클릭 → Raw Data 페이지로 이동 시 `?critical=1&team=...` 또는 `?critical=1&subcontractor=...` 쿼리 추가
- Raw Data 페이지가 마운트 시 `critical=1`이면 `is_critical` 컬럼 필터를 "Critical only"로 초기화. `team`/`subcontractor` 파라미터도 기존 dashboard-param 처리 로직에 추가

## 범위 외
- snapshot/import 파이프라인은 손대지 않음 (`is_critical`은 사용자 토글 전용, 기본값 false)
- 일괄 편집 바(BulkEditBar)에는 추가하지 않음 — 추후 요청 시
- Excel export 컬럼 추가 여부는 현재 요청에 없으므로 보류

## 기술 노트
- `Checkbox` 셀의 onClick 이벤트는 `e.stopPropagation()`로 행 네비게이션과 분리
- 권한이 없는 사용자(예: guest)는 체크박스 disabled 처리
- 패널 카드는 `lg:grid-cols-1` 단일 폭, 내부 그룹은 모바일에서 collapsible accordion 고려(우선 단순 테이블 구현, 모바일은 `overflow-auto`)
