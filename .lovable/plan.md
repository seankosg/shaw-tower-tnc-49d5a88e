## 목표
4개 Docs Raw Data 상세 페이지(Drawing/OMM/Warranty/Spare Part) 헤더에 권한 기반 삭제(soft delete) 버튼을 추가합니다. 라이트 페이지에서 사용 중인 `DocsRowDeleteButton` + `softDeleteDocsRow` 로직을 그대로 재사용합니다.

## 권한 규칙 (기존 `canEdit` 패턴과 동일)
- 표시 대상 역할: `admin`, `superuser`, `d_superuser`, `senior_user`, `user`
- `d_superuser`는 RLS에 의해 본인 team 행만 삭제 가능 (서버 측 강제 — UI에서는 일단 노출, 서버가 거절 시 토스트로 표시)
- `guest`, `super_guest`에게는 버튼 숨김

## 변경 사항

### 1) 4개 상세 페이지 공통 패턴
`src/pages/docs/DocsDrawingDetailPage.tsx`, `DocsOMMDetailPage.tsx`, `DocsWarrantyDetailPage.tsx`, `DocsSparePartDetailPage.tsx`

각 페이지 헤더 바(현재 Back 버튼 ↔ Save 버튼 영역)에 다음 추가:
- `DocsRowDeleteButton` 컴포넌트를 Save 버튼 옆에 배치
- `canDelete` (= 기존 `canEditRow`와 동일 역할 집합) 가 true 일 때만 렌더
- props:
  - `table`: 페이지별 테이블명 (`docs_drawings` / `docs_omm` / `warranty_items` / `docs_spare_part`)
  - `id`: 현재 record id
  - `recordLabel`: 페이지별 식별자 (Drawing=`document_no`, OMM=`document_no`, Warranty=`sn` 또는 `item_no`, Spare Part=`item_no`)
  - `onDeleted`: 삭제 성공 시 `navigate(-1)` 또는 해당 Raw Data 목록으로 이동 + toast (이미 컴포넌트 내부에서 toast 처리됨)

### 2) `DocsRowDeleteButton` 소폭 보강 (선택)
- 상세 페이지에서는 아이콘만이 아닌 라벨 포함 변형이 더 자연스러움 → `variant?: 'icon' | 'button'` prop 추가, 기본은 기존 `icon` 유지하여 목록 사용처는 무변경. `'button'` 모드는 `Trash2` + "Delete" 라벨 + `variant="destructive"` outline 스타일.

### 3) 동작
- 삭제 확인 다이얼로그는 기존 컴포넌트 그대로 사용 (영문 문구 유지 — 프로젝트 UI 라벨 규칙)
- 성공 시:
  - toast 노출
  - 상세 페이지 닫기: `if (window.history.length > 1) navigate(-1); else navigate('/docs/<list>')`
- 실패 시: 토스트로 사유 노출, 페이지 유지

## 영향 범위
- 추가 마이그레이션 없음 (RLS/`is_active` 컬럼 기 적용)
- 통계/대시보드/엑스포트는 직전 작업에서 `is_active=true` 필터가 이미 들어갔거나 본 작업 범위 외 (이번 PR에서는 detail UI 만 변경)
- 데이터 로직 변경 없음, 순수 UI/권한 게이팅
