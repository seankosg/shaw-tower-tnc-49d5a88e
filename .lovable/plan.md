

# SHAW T&C Management System — 점진적 구축 계획

프로젝트가 매우 대규모이므로 **3단계(Phase)**로 나누어 구축합니다. 이번 첫 번째 구현에서는 **Phase 1**을 완성합니다.

---

## Phase 1: 기반 구축 (이번 구현)

### 1. Lovable Cloud 설정 — DB 스키마 생성
11개 테이블 전체를 Supabase 마이그레이션으로 생성:
- `projects`, `system_master`, `system_alias_map`
- `tests`, `subtests` (핵심 비즈니스 테이블, unique constraints 포함)
- `user_roles` (별도 역할 테이블), `user_system_permissions`
- `upload_batches`, `upload_row_logs`
- `subtest_change_log`
- `field_config`
- RLS 정책, `has_role()` security definer 함수
- SHAW 프로젝트 시드 데이터

### 2. 인증 및 역할 기반 접근제어
- Supabase Auth 연동 (이메일 로그인)
- `user_roles` 테이블 기반 역할 관리
- AuthContext + PermissionContext 구현
- 역할별 라우팅 보호

### 3. 앱 레이아웃 및 네비게이션
- 사이드바/탑바 레이아웃 (프로페셔널 스타일, Inter 폰트)
- 역할별 메뉴 표시: Subtests, Dashboard, Import, Export, Admin
- 반응형 모바일 레이아웃

### 4. 핵심 페이지 — Subtest 목록 (Master DB View)
- 데이터 그리드 + 페이지네이션
- 필터: Project, System, Item No, Subtest ID, T1/T2 Status, Updated By, Date Range, 자유 텍스트
- 정렬 가능 컬럼
- 상태 배지, Data Source 태그
- 지연 항목 하이라이트 (actual > planned)
- 행 클릭 → 상세 페이지 이동

### 5. Subtest 상세/편집 페이지
- 모든 T1/T2 필드 편집 (드롭다운 상태, 날짜 선택)
- R1/R2, Aconex, Remarks, Punchlist 필드
- 권한 기반 편집 가능 여부
- 변경 이력(Change History) 섹션
- 저장 시 `subtest_change_log` 기록

### 6. 로그인 페이지
- 깔끔한 로그인 화면, SHAW 브랜딩

---

## Phase 2 (다음 단계)
- Legacy Import 파서 + Standard Import
- Import 결과/로그 페이지
- Export 기능 (Excel)
- Mobile Quick Update 페이지

## Phase 3 (최종 단계)
- Executive Dashboard (차트 + Alert 테이블)
- Admin 워크스페이스 전체 (User/Permission/System/Field Config/Audit)
- App Configuration 페이지

---

## 기술 세부사항

### 추가 패키지
- `xlsx` — Excel import/export (Phase 2 준비)
- `@supabase/supabase-js` — Lovable Cloud 연동
- `@tanstack/react-table` — 고성능 데이터 그리드

### 디렉토리 구조
```text
src/
├── contexts/       # AuthContext, PermissionContext
├── hooks/          # useAuth, usePermissions, useSubtests
├── lib/
│   ├── supabase.ts
│   └── constants.ts
├── types/          # database.ts, enums.ts
├── components/
│   ├── layout/     # AppSidebar, TopBar, ProtectedRoute
│   ├── subtests/   # SubtestTable, SubtestFilters, SubtestDetail
│   └── shared/     # StatusBadge, DataSourceTag
├── pages/
│   ├── Login.tsx
│   ├── SubtestList.tsx
│   ├── SubtestDetail.tsx
│   ├── Dashboard.tsx (placeholder)
│   ├── Import.tsx (placeholder)
│   ├── Export.tsx (placeholder)
│   └── admin/      # (placeholder pages)
```

### DB 핵심 사항
- `subtests` 테이블에 `unique(project_id, system_id, item_no, mos_code)` + `unique(subtest_id)`
- T1/T2 Status는 CHECK constraint로 `NULL, 'Planned', 'WIP', 'Done', 'Hold'`만 허용
- `data_source_type`은 enum으로 관리
- `row_version` 컬럼으로 낙관적 잠금 지원

Phase 1을 승인해 주시면 바로 구현을 시작하겠습니다.

