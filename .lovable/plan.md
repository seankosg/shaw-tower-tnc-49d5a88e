# Daily Default Notice — Phase 1 (스키마 + Settings + 입력 폼 골격)

Puretech(서브콘) 일일 디폴트 통보를 자동 생성하기 위한 신규 모듈을 사이드바 최상위에 추가합니다. Phase 1에서는 **데이터 모델, Settings, 입력 폼(8개 섹션)** 까지 구현하고, 영문 매핑·미리보기·DOCX 생성·이력·Storage 업로드는 Phase 2~3로 분리합니다.

## 범위 (Phase 1)

- 사이드바 최상위 신규 메뉴 **Daily Default Notice** + 하위 4개 라우트(`/ddn/input`, `/ddn/preview`, `/ddn/history`, `/ddn/settings`).
  - Phase 1에서는 `input` / `settings`만 실제 동작, 나머지는 "Coming soon" placeholder.
- DB 스키마(`ddn_settings`, `ddn_entries`) + RLS.
- Settings 페이지: admin 전용, master_notice_ref/date, day1_date, letter_no_prefix/next, 각종 단가·요율 편집.
- 입력 폼: Korean accordion 8 섹션 + 고정 상단(금일 계획된 테스트) + 누적 read-only 패널.
  - 자동저장(5초 debounce, draft 상태로 upsert).
  - 입력값은 `ddn_entries.inputs` jsonb로 저장.
  - 누적 패널은 settings + 과거 entries 합산으로 라이브 계산.
- 권한: **superuser/admin = 풀권한(편집·저장)**, 나머지(senior_user 이하) = read-only(폼은 disabled, history/preview는 추후 Phase에서 열람 허용).

## Phase 2/3 (참고용, 본 계획 외)

- Phase 2: 영문 매핑 엔진(`ddn-mapping.ts`) + Preview 페이지(A4 HTML serif 렌더) + 조건부 섹션.
- Phase 3: DOCX 생성(`docx` lib) + Lovable Cloud Storage(`daily-notices` 버킷) 업로드 + History 테이블(필터/ZIP 일괄 다운로드) + finalize 시 letter_no_next 증가.

## 데이터 모델

```text
ddn_settings (단일 행, id='singleton' text PK)
  master_notice_ref        text
  master_notice_date       date
  day1_date                date
  letter_no_prefix         text     -- "HD/SHAW/SC/26-"
  letter_no_next           int      -- 다음 발행 번호
  pm_absence_start_date    date
  contract_completion_date date
  ld_daily_rate_sgd        numeric
  ld_cap_sgd               numeric
  pm_daily_rate_sgd        numeric
  hdec_manday_rate_sgd     numeric
  hdec_korean_md_rate_sgd  numeric
  admin_overhead_pct       numeric  -- 0.03
  avg_ncr_external_cost    numeric
  avg_def_external_cost    numeric
  updated_at               timestamptz

ddn_entries
  id                       uuid PK
  entry_date               date UNIQUE
  letter_no                text          -- finalize 시점에 부여
  day_n                    int           -- entry_date - day1_date + 1 (생성 시)
  status                   text          -- 'draft' | 'finalized' | 'sent'
  inputs                   jsonb         -- 전체 폼 페이로드
  generated_letter_html    text          -- Phase 2
  generated_docx_path      text          -- Phase 3
  created_by               uuid          -- auth.users
  created_at, updated_at   timestamptz
```

RLS:
- `ddn_settings`: SELECT = 로그인 사용자 전체 / INSERT·UPDATE = `has_role(uid,'admin')`만.
- `ddn_entries`: SELECT = 로그인 사용자 전체 / INSERT·UPDATE·DELETE = `has_role(uid,'superuser')` OR `has_role(uid,'admin')`.
- 기존 `public.has_role()` security definer 함수 재사용.

## UI 구성

### 사이드바
`src/components/layout/AppSidebar.tsx`에 신규 그룹/아이템 `Daily Default Notice` 추가(아이콘 `FileWarning`). 4개 하위 라우트.

### `/ddn/input` — 오늘의 입력
- 상단 sticky 헤더: 날짜 picker(기본 today), `Day N` 자동, draft/finalized 뱃지, 자동저장 인디케이터, 진행률 바.
- **고정 상단 카드**: 금일 계획된 테스트 (Pred / T1 / T2 행, 계획·실적·달성률(자동)·지연 항목 repeatable).
- **Accordion 8 섹션** (§1~§8): 스펙 PART B 그대로 — Korean label, shadcn Input/Select/RadioGroup/Checkbox/Textarea/Calendar.
- **누적 read-only 패널** (우측 또는 §8 영역): settings + 과거 entries 합산 라이브 계산.
- 자동저장: 폼 상태 변경 후 5초 debounce → `ddn_entries` upsert(entry_date 기준).
- 권한 없는 사용자: 모든 입력 `disabled`, 저장 버튼 숨김, 상단에 "Read-only" 배너.

### `/ddn/settings` — 설정 (admin only)
- 단일 폼으로 `ddn_settings` 편집. `RoleGuard` admin 전용.
- 저장 시 upsert + toast.

### `/ddn/preview`, `/ddn/history`
- Phase 1: 단순 placeholder ("Coming in Phase 2/3"). Sidebar에는 표시하되 페이지 안에 안내만.

## 기술 구현

신규 파일:
- `src/pages/ddn/DdnLayout.tsx` — 좌측 sub-nav 또는 단순 Outlet.
- `src/pages/ddn/DdnInputPage.tsx` — 입력 폼.
- `src/pages/ddn/DdnSettingsPage.tsx` — Settings.
- `src/pages/ddn/DdnPreviewPage.tsx`, `src/pages/ddn/DdnHistoryPage.tsx` — placeholder.
- `src/components/ddn/sections/Section1Superintendence.tsx` … `Section8Cumulative.tsx` — 섹션별 폼 분리(파일당 ~150줄).
- `src/components/ddn/PlannedTestsCard.tsx` — 고정 상단 카드.
- `src/components/ddn/CumulativePanel.tsx` — 누적 read-only.
- `src/lib/ddn/types.ts` — `DdnInputs` TypeScript 타입 (jsonb 페이로드 형상).
- `src/lib/ddn/calc.ts` — 누적/back-charge 계산 함수 (Phase 2 매핑에서도 재사용).
- `src/lib/ddn/auto-save.ts` — 5초 debounce upsert 훅 `useDdnAutoSave`.

라우팅: `src/App.tsx`에 `/ddn/*` 추가, `ProtectedRoute`로 감싸기.

사이드바: `AppSidebar.tsx` 신규 그룹.

권한 헬퍼: `src/lib/role-permissions.ts`에 `canEditDdn(role)` (superuser|admin), `canManageDdnSettings(role)` (admin) 추가.

## 작업 순서

1. **migration**: `ddn_settings`, `ddn_entries` 테이블 + RLS + `updated_at` 트리거. 빈 settings 시드 1행 insert.
2. `src/lib/ddn/types.ts` + `calc.ts` 작성.
3. `DdnSettingsPage` — admin 폼 (단순 CRUD)으로 데이터 흐름 검증.
4. `PlannedTestsCard` + Section1~8 컴포넌트 + `DdnInputPage` 조합.
5. `useDdnAutoSave` 훅 + draft 로딩.
6. `CumulativePanel` 계산 연동.
7. Sidebar + 라우팅 + placeholder 페이지.
8. 권한 가드(읽기 전용 모드) + 수동 검증(admin 로그인 → settings 저장 → 입력 폼 자동저장 → DB row 확인).

Phase 2(매핑·Preview)와 Phase 3(DOCX·Storage·History)는 본 단계 완료 후 별도 계획으로 진행합니다.
