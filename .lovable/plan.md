## Punch Module Phase 1 — Step 2: Field Registry / Sidebar / Raw Data + Detail

이번 단계는 DB 위에 얹는 **프론트 기반 작업**입니다. Import/Export/대시보드는 다음 단계에서 진행합니다.

### 1. Field Registry — `src/lib/punch-field-registry.ts`

각 필드 1개 entry, Export ↔ Import 라운드트립을 보장하기 위한 단일 진실 소스(SSOT).

```ts
type PunchFieldDef = {
  field: string;           // DB column
  exportLabel: string;     // Export 시 헤더 (= 1순위 alias)
  aliases: string[];       // Import 시 매칭 후보 (정규화 후)
  group: 'identity' | 'classification' | 'people' | 'schedule' |
         'progress' | 'pre_engineering' | 'meta';
  dataType: 'text' | 'date' | 'number' | 'pct' | 'enum' | 'bool';
  enumValues?: string[];   // status / health 등
  readOnly?: boolean;      // 파생값 — Import 무시, Export O
  required?: boolean;
};
```

핵심 필드 그룹:
- **identity**: `item_no`, `outstanding_work`, `location`, `level`
- **classification**: `category1/2/3`, `critical_level`, `work_type`
- **people**: `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `team`
- **schedule**: `planned_start_date`, `actual_start_date`, `planned_completion_date`, `actual_completion_date`
- **progress**: `planned_progress_pct`, `actual_progress_pct`, `progress_variance_pct`*, `health_status`*, `completion_status`, `data_date`
- **pre_engineering**: `material_approval_status/date`, `material_procurement_status/date`, `drawing_approval_status/date`, `mos_approval_status/date`, `pre_engineering_ready`*, `pre_engineering_blockers`*
- **meta**: `remarks`

(* = `readOnly: true`, 트리거가 자동 계산)

또한 export header → field 역매핑용 `PUNCH_FIELDS_BY_LABEL` Map과 `normalizePunchHeader(raw)` → `field | null` 헬퍼를 함께 export.

### 2. Sidebar / Routing / Module Status

**`AppSidebar.tsx`**
- 새 그룹 `Punch Management` 추가 (Defect 그룹 아래).
- 메뉴: Dashboard, Raw Data, Import, Export (이번 단계는 Raw Data만 라우팅 활성, 나머지는 PlaceholderPage).
- 아이콘: `ListChecks` (lucide-react).
- `useModuleStatus()`에 `punch` 추가 → Paused 뱃지/그룹 숨김 동작 동일 적용.

**`module-status-context.ts` / `ModuleStatusContext.tsx`**
- `ModuleKey`에 `'punch'` 추가, `KEY_MAP.punch = 'module_punch_status'`.
- `app_settings`의 punch RLS는 이미 admin 전용으로 들어가도록 마이그레이션에서 처리 필요(아래 마이그레이션 항목).

**`role-permissions.ts`**
- `/punch/raw-data`, `/punch/:id` → super_guest+
- `/punch/import`, `/punch/export` → user+
- `/punch/dashboard` → super_guest+ (기본 Punch 진입점)

**`App.tsx`**
- 라우트 추가:
  - `/punch/dashboard` → PlaceholderPage
  - `/punch/raw-data` → `PunchRawDataPage`
  - `/punch/import` → PlaceholderPage
  - `/punch/export` → PlaceholderPage
  - `/punch/:id` → `PunchDetailPage`

### 3. 마이그레이션 (작은 보조 1건)

`app_settings` 모듈키 RLS 정책을 `module_punch_status`까지 포함하도록 갱신:

```sql
-- WHERE key IN ('module_tnc_status','module_defect_status','module_docs_status','module_punch_status')
```

(`app_settings`의 ALL 정책을 DROP 후 재생성)

### 4. Raw Data 페이지 — `src/pages/PunchRawDataPage.tsx`

Defect Raw Data 패턴을 그대로 따르되 **이번 단계는 핵심만** 구현 (BulkEdit/Reassign/QuickUpdate는 Phase 2):

- 데이터 fetch: `supabase.from('punch_items').select('*').eq('is_active', true)` + 페이지네이션 1000행 chunk.
- TanStack Table + 가상화(`useVirtualizer`).
- 컬럼은 `PUNCH_FIELDS` 순서대로 자동 생성, `useFieldConfig('punch')`(없으면 registry default)로 visible/순서 결정.
- 특수 셀 렌더러:
  - **Stage Progress 칸**: 4개 Pre-Engineering 게이트 미니 인디케이터 (Material Approval / Material / Drawing / MOS) — 색상 dot + tooltip.
  - **Health Status 뱃지**: Ahead(green) / On Track(blue) / Behind(amber) / Critical(red).
  - **Variance %**: 음수 빨강, 0 회색, 양수 초록.
  - **% 컬럼**: `formatPct` 재사용.
  - **날짜**: `formatDdMmm`.
- 필터: 검색바 + 컬럼별 필터(텍스트 / Enum / 숫자 범위) — 기존 `inferFilterType` 헬퍼 재사용.
- 행 클릭 → `/punch/:id`.
- 상단 액션: Search, Filter chip, Export(이번 단계는 disabled placeholder).
- 권한: `can_write_for_team` 패턴은 RLS가 처리하므로 UI는 항상 클릭 가능, 실패는 toast.

> **Phase 2로 미루는 항목**: 일괄 편집/Reassign/Duplicate, Bulk delete, Critical Pending Bar, 댓글 패널, Top horizontal scrollbar.

### 5. Detail 페이지 — `src/pages/PunchDetailPage.tsx`

좌측 폼 / 우측 사이드 정보 2-컬럼 레이아웃 (Defect Detail과 동일 톤).

**섹션 구성:**
1. **Identity** (read-only): Item No, Outstanding Work, Location/Level
2. **Classification**: Category 1/2/3, Critical Level, Work Type — Select
3. **People & Team**: Subcontractor / Sub-sub / HDEC PIC / Team
4. **Schedule**: 4개 날짜(Planned/Actual Start/Completion) — DatePicker
5. **Progress**:
   - Planned % (자동 계산, 읽기 전용 표시 + "Recalculate" 버튼)
   - Actual % (입력)
   - Variance / Health (자동, 뱃지 표시)
   - Completion Status (Select)
   - Data Date (DatePicker, 기본값 today)
6. **Pre-Engineering Gates** (가장 중요한 신규 섹션):
   - 4개 Card: Material Approval, Material Procurement, Drawing Approval, MOS Approval
   - 각 카드: Status Select (`Pending / In Progress / Approved / Rejected / N/A`) + Date picker
   - 하단에 자동 계산된 `Pre-Engineering Ready` 뱃지(✓/✗) + `pre_engineering_blockers` 칩 리스트
7. **Remarks**: Textarea
8. **History 사이드 패널**: 최근 `punch_change_log` 10건 (변경 필드 / before→after / 시각 / 사용자).

**저장 로직:**
- `row_version` Optimistic Concurrency: UPDATE 시 `eq('row_version', current)` → 0건 영향 시 "다른 사용자가 수정" 토스트 + reload.
- 변경된 필드만 `update()` payload에 포함.
- 성공 후 trigger가 derived 컬럼을 다시 계산 → `select()`로 다시 받아 폼 갱신.

**권한 분기:**
- `RoleGuard`로 라우트 진입 통제.
- D.Super User는 row.team !== profile.team이면 모든 입력 disabled + 안내 배너.
- guest/super_guest는 view-only.

### 6. 기술 노트 (구현 순서)

```text
1) field registry 작성 + 단위 테스트(라운드트립 골격만)
2) module-status-context 'punch' 추가
3) role-permissions / App.tsx 라우트
4) AppSidebar 그룹 추가
5) PunchRawDataPage 스캐폴드 → 컬럼/필터/검색
6) PunchDetailPage 스캐폴드 → Pre-Eng 게이트 카드
7) app_settings RLS 마이그레이션
```

### 다음(Step 3) 예고

- Import 페이지 + 라운드트립 매핑 검증
- Export 페이지 (registry 기반)
- Import Logs (`failed` 상태 처리 포함)
- 기본 Dashboard (KPI + Critical Watchlist + Pre-Eng Bottleneck)
- 댓글 시스템

이 계획으로 진행해도 될까요?
