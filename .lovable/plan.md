

# Phase 3 구현: Executive Dashboard + Admin Workspace

## 개요
Phase 3는 두 가지 주요 기능을 포함합니다:
1. **Executive Dashboard** — 시스템별/상태별 통계 차트 + 지연 알림 테이블
2. **Admin Workspace** — 사용자 관리, 권한 관리, 시스템 마스터, 필드 설정, 감사 로그

---

## 1. Executive Dashboard (`src/pages/DashboardPage.tsx`)

### 통계 카드 (상단)
- 전체 Subtest 수, T1 완료율, T2 완료율, 지연 건수

### 차트 (recharts 사용)
- **시스템별 진행률** — 가로 Bar 차트 (시스템별 Done/WIP/Planned 비율)
- **T1/T2 상태 분포** — Pie 또는 Donut 차트
- **월별 완료 추이** — Line 차트 (actual_date 기준)

### 지연 알림 테이블
- T1/T2 planned_date가 지났는데 status가 Done이 아닌 행 목록
- 클릭 시 SubtestDetail로 이동

---

## 2. Admin Workspace — 탭 기반 구조

### Admin 페이지 (`src/pages/AdminPage.tsx`)
Tabs 컴포넌트로 하위 섹션 구분:

#### Tab 1: User Management
- `profiles` + `user_roles` 조회
- 역할 변경 (Select dropdown → update `user_roles`)
- 사용자 활성/비활성 토글

#### Tab 2: System Master
- `system_master` CRUD 테이블
- system_code, discipline, system_name_std 편집
- `is_auto_created` / `requires_admin_review` 표시 및 리뷰 처리

#### Tab 3: Permissions
- `user_system_permissions` 관리
- 사용자별 시스템별 권한 매트릭스 (view/edit/import/export/create_key)

#### Tab 4: Field Config
- `field_config` 테이블 관리
- 필드 표시명, 활성/필수 토글, 역할별 가시성

#### Tab 5: Audit Logs
- `subtest_change_log` 최근 기록 조회 (필터: 날짜, 사용자, 필드)
- `upload_batches` 임포트 이력 요약

---

## 신규 파일
| 파일 | 설명 |
|------|------|
| `src/pages/DashboardPage.tsx` | Executive Dashboard (차트 + 알림) |
| `src/pages/AdminPage.tsx` | Admin Workspace (탭 5개) |

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/App.tsx` | `/dashboard` → DashboardPage, `/admin` → AdminPage 라우트 변경 |
| `src/components/layout/AppSidebar.tsx` | Admin 하위 메뉴 확장 (선택적) |

## 의존성
- `recharts` — 차트 라이브러리 (이미 shadcn chart 컴포넌트 존재)

## 참고
- 모든 Admin 작업은 `isAdminOrSuperuser` 체크 후 수행
- UI 라벨은 영어로 유지

