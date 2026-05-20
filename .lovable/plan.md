# Daily Default Notice — Phase 1 (동적 스키마 + Settings + 입력 폼)

Puretech(서브콘) 일일 디폴트 통보를 자동 생성하는 모듈. 사이드바 최상위에 신규 메뉴로 추가합니다.

**핵심 설계 원칙**: 입력 폼의 모든 필드(라벨·옵션·필수여부·표시순서)는 **DB 기반 메타스키마**로 정의해서, 관리자가 코드 수정 없이 라벨 워딩과 선택지 값을 편집할 수 있도록 합니다. 영문 매핑 문장(Phase 2)도 같은 원칙을 따릅니다.

## 범위 (Phase 1)

- 사이드바 최상위 **Daily Default Notice** + 하위 4 라우트(`input`/`preview`/`history`/`settings`). Phase 1은 `input`/`settings`만 동작, 나머지는 placeholder.
- **메타스키마 5개 테이블** (`ddn_sections`, `ddn_fields`, `ddn_field_options`, `ddn_settings`, `ddn_entries`) + RLS.
- Settings: 단가·요율·고정 참조번호 편집 (admin only).
- **Schema Editor** (admin only): 섹션·필드 라벨/옵션/순서 편집 UI.
- 입력 폼: 메타스키마로부터 동적 렌더링 + 5초 debounce 자동저장.
- 권한: superuser/admin = 풀권한, 나머지 read-only.

## 동적 메타스키마 설계

### 왜 동적인가
- 운영 중 "Engineer (Elec) — 계획/실제" 라벨을 "전기 엔지니어 (계획/실제)"로 바꾸고 싶을 때 코드 배포 없이 가능.
- 멀티체크박스 선택지(예: §1의 "HDEC 대행 업무 6종") 추가/삭제·문구 수정 가능.
- 새 필드 추가 시 영문 매핑 룰(Phase 2)만 추가하면 폼은 자동 확장.

### 테이블

```text
ddn_sections                                 -- 8 섹션 + 고정 상단 + 누적 패널
  id           text PK                       -- 'planned_tests','sec1','sec2',...,'cumulative'
  title_ko     text                          -- "§1. Cl.4.8 Superintendence (인원·감독)"
  title_en     text                          -- 영문 (Phase 2 매핑에서 사용)
  display_order int
  collapsible  bool
  is_active    bool

ddn_fields
  id              uuid PK
  section_id      text FK → ddn_sections
  field_key       text UNIQUE                -- 'sec1.pm_attended','sec1.pm_time' (안정 키)
  label_ko        text                       -- 편집 가능한 한글 라벨
  label_en        text                       -- 영문 (Phase 2)
  help_text       text
  data_type       text                       -- 'text'|'number'|'date'|'time'|'radio_yn'
                                             -- |'radio'|'checkbox_multi'|'textarea'
                                             -- |'computed'|'repeatable_group'
  unit            text                       -- '명','m','SGD','%' 등
  required        bool
  default_value   jsonb
  validation      jsonb                      -- {min,max,pattern}
  conditional_on  jsonb                      -- {field_key,equals} (특정 답에서만 표시)
  display_order   int
  width           text                       -- 'full'|'half'|'third' (그리드)
  is_active       bool

ddn_field_options                            -- radio/checkbox_multi 선택지
  id          uuid PK
  field_id    uuid FK → ddn_fields
  value       text                           -- 안정 키 ('pt_unaware','material_late',...)
  label_ko    text
  label_en    text
  display_order int
  is_active   bool

ddn_settings  (단일 행, id='singleton')
  master_notice_ref, master_notice_date, day1_date,
  letter_no_prefix, letter_no_next,
  pm_absence_start_date, contract_completion_date,
  ld_daily_rate_sgd, ld_cap_sgd, pm_daily_rate_sgd,
  hdec_manday_rate_sgd, hdec_korean_md_rate_sgd,
  admin_overhead_pct, avg_ncr_external_cost, avg_def_external_cost,
  updated_at

ddn_entries
  id, entry_date UNIQUE, letter_no, day_n,
  status ('draft'|'finalized'|'sent'),
  inputs  jsonb,                             -- { [field_key]: value } 형태로 안정 저장
  generated_letter_html, generated_docx_path,
  created_by, created_at, updated_at
```

**핵심**: `ddn_entries.inputs`는 `field_key`(안정 키)로 저장 → 라벨이 바뀌어도 과거 데이터 무결성 유지. UI 표시할 때만 `ddn_fields.label_ko` 조인.

### 시드 데이터
마이그레이션에서 PART B 스펙(§1~§8 + 고정 상단 + 누적)을 그대로 시드. 약 80~100개 필드 INSERT. 모든 키는 `field_key`로 고정(`sec1.pm_attended`, `sec3.ncr_open`, `sec6.rto_cctv`, …).

### computed 필드
`data_type='computed'`은 입력 불가. 클라이언트가 `computed_formula`(field 정의 jsonb 필드로 별도 추가) 또는 하드코딩된 매핑(`src/lib/ddn/computed.ts`)으로 계산:
- `planned_tests.pred_pct` = round(actual/planned*100)
- `sec2.delay_days` = today − contract_completion_date
- `cumulative.pm_absent_days`, `cumulative.aggregate_back_charge` 등

Phase 1은 하드코딩 매핑으로 시작(라벨만 동적). Phase 3에서 수식 DSL 도입 검토.

## RLS

- 5개 테이블 모두 RLS 활성화.
- `ddn_sections`, `ddn_fields`, `ddn_field_options`: SELECT = 인증 사용자 / INSERT·UPDATE·DELETE = `has_role(uid,'admin')`.
- `ddn_settings`: SELECT = 인증 사용자 / 쓰기 = admin.
- `ddn_entries`: SELECT = 인증 사용자 / 쓰기 = `has_role(uid,'superuser') OR has_role(uid,'admin')`.

## UI

### Sidebar
`AppSidebar.tsx`에 `Daily Default Notice` 그룹(아이콘 `FileWarning`) + 4 하위 NavLink.

### `/ddn/input` — 오늘의 입력
- Sticky 헤더: 날짜 picker, `Day N`, status 뱃지, 자동저장 표시, 진행률.
- **DynamicForm**: `ddn_sections` + `ddn_fields` fetch → 섹션별 Accordion → 필드별 컴포넌트 렌더링.
  - `data_type`별 렌더러: `<TextField/>`, `<NumberField/>`, `<DateField/>`, `<TimeField/>`, `<RadioYNField/>`, `<RadioField/>`, `<CheckboxMultiField/>`, `<TextareaField/>`, `<ComputedField/>`, `<RepeatableGroupField/>`.
  - `conditional_on` 평가 후 표시/숨김.
  - `unit` 표시 (input 우측 suffix).
- **CumulativePanel**: `data_type='computed'` 필드만 모아 read-only로 표시.
- 자동저장: 5초 debounce → `ddn_entries` upsert(entry_date 기준), draft 상태.
- 권한 없으면 전체 `disabled` + 상단 read-only 배너.

### `/ddn/settings` — 설정 (admin)
탭 2개:
1. **Cost & References**: `ddn_settings` 단일 폼.
2. **Form Schema Editor**:
   - 좌측: 섹션 트리(드래그로 순서 변경).
   - 우측: 선택한 섹션의 필드 목록 → 클릭하면 라벨/옵션/필수/표시순서 인라인 편집.
   - `field_key`는 read-only(키 변경 시 과거 데이터 깨짐). 라벨/옵션 label만 자유 편집.
   - 옵션 추가/숨김(soft delete = `is_active=false`).
   - Phase 1은 필드 **신규 추가/삭제는 미지원**(시드된 필드의 라벨/옵션만 편집). Phase 3에서 확장.

### `/ddn/preview`, `/ddn/history`
Placeholder ("Coming in Phase 2/3").

## 기술 구현

신규 파일:
- `src/lib/ddn/schema-types.ts` — `DdnSection`, `DdnField`, `DdnFieldOption`, `DdnInputs` 타입.
- `src/lib/ddn/schema-cache.ts` — react-query로 메타스키마 fetch + 캐시.
- `src/lib/ddn/computed.ts` — computed 필드 계산 함수 맵 (`field_key` → fn(inputs, settings, history)).
- `src/lib/ddn/auto-save.ts` — `useDdnAutoSave(entryDate)` 훅.
- `src/components/ddn/DynamicForm.tsx` — 섹션/필드 동적 렌더.
- `src/components/ddn/fields/*.tsx` — 데이터타입별 필드 컴포넌트 10개.
- `src/components/ddn/CumulativePanel.tsx`.
- `src/components/ddn/SchemaEditor.tsx` — 라벨/옵션 편집 UI.
- `src/pages/ddn/DdnLayout.tsx` (Outlet).
- `src/pages/ddn/DdnInputPage.tsx`.
- `src/pages/ddn/DdnSettingsPage.tsx`.
- `src/pages/ddn/DdnPreviewPage.tsx`, `src/pages/ddn/DdnHistoryPage.tsx` — placeholder.
- `src/lib/role-permissions.ts`에 `canEditDdn`, `canManageDdnSettings` 추가.

라우팅: `src/App.tsx`에 `/ddn/*` + `ProtectedRoute`.

## Phase 2/3 (참고)

- **Phase 2**: 매핑 엔진. `ddn_mapping_rules` 테이블 추가(트리거 조건 + 영문 템플릿, `{{field_key}}` 치환). 영문 문구도 admin이 편집 가능. Preview(A4 HTML serif).
- **Phase 3**: DOCX 생성(`docx` lib) + Lovable Cloud Storage `daily-notices` 버킷 업로드 + History(필터·ZIP) + Schema Editor에 필드 추가/삭제 + 수식 DSL.

## 작업 순서

1. **migration**: 5개 테이블 + RLS + `updated_at` 트리거 + `ddn_settings` singleton 시드 + `ddn_sections`/`ddn_fields`/`ddn_field_options` 풀 시드(PART B 전부).
2. `schema-types.ts` + `schema-cache.ts` + `computed.ts`.
3. 필드 컴포넌트 10종 + `DynamicForm`.
4. `DdnInputPage` + `useDdnAutoSave` + `CumulativePanel`.
5. `DdnSettingsPage` (Cost 탭 → 동작 검증) → Schema Editor 탭.
6. Sidebar + 라우팅 + placeholder.
7. 수동 검증: admin 로그인 → settings 저장 → schema editor에서 라벨 수정 → 입력 폼 반영 확인 → 자동저장 → DB row 확인.
