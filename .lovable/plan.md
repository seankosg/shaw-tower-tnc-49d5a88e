# Docs Management 모듈 — Phase 1 구현 계획

## 사용자 결정 반영 요약
1. **Aconex Status**: `A`, `B`만 "Approved"로 처리 (A안 채택)
2. **SC Date 기본값**: SHAW 프로젝트 = **2026-06-15** seed
3. **Subcontractor 매칭 실패**: 자동생성 안 함. Import 결과에 unmatched 리스트 표시 + `/docs/config`에 raw label → subcontractor 매핑 admin 페이지 추가 (A안)
4. **사이드바 표시**: `Module Control`에 **Docs 토글** 신설 → 기본 **비활성화**. 일반 사용자는 사이드바 미표시. **Admin은 항상 정상 사용 가능** (T&C/Defect와 동일 패턴)
5. **공통 설정 공유**: 별도 Setting 페이지를 만들지 않고, **기존 Admin 탭의 Setting을 그대로 공유**
   - Header Mappings, Custom Fields, Field Config, Event Log, Module Control 모두 기존 인프라 재사용
   - Docs 모듈 전용 데이터는 `module = 'docs_drawings'` 디스크리미네이터로 같은 테이블에 저장

---

## Phase 1 범위

**포함**
- 사이드바 `Docs Management` 그룹 신설 (As-Built 메뉴 + OMM/Warranty/Spare는 비활성 placeholder)
- Module Control에 `Docs` 토글 추가 (기본 disabled)
- DB: `docs_drawings`, `docs_upload_batches`, `docs_upload_row_logs`, `docs_change_log`, `docs_org_alias`
- 프로젝트별 SC Date + sub-module별 lead time 설정 (`app_settings`에 저장, 기존 `useAppSetting` 재사용)
- Import 엔진 (멀티시트 + ELEC 파서 + 8-worker 동시성)
- Risk 계산 (실시간, 순수 TS)
- Dashboard, Raw Data, Import, Detail 페이지

**제외 (후속 Phase)**
- OMM / Warranty / Spare sub-module 구현
- Aconex API 직접 연동 (Phase 1은 엑셀 업로드만)

---

## 기술 상세

### 1. DB 스키마 (마이그레이션)

```text
docs_drawings
  id uuid pk, project_id uuid, sub_module text default 'as_built'
  document_no text, revision text, title text
  organisation_raw text, subcontractor_id uuid null
  discipline text, document_type text
  aconex_status text, is_submitted boolean
  submitted_date date, approved_date date
  raw_payload jsonb, source_upload_id uuid
  created_at, updated_at, updated_by, row_version
  unique(project_id, document_no)

docs_upload_batches  -- defect_upload_batches와 동형
docs_upload_row_logs -- defect_upload_row_logs와 동형
docs_change_log      -- defect_change_log와 동형
docs_org_alias       -- raw_label → subcontractor_id 매핑
```

RLS: 기존 Defect 모듈 패턴 그대로 (read=authenticated, write=user+, delete=admin).
`module_docs_status` 키를 `app_settings`에 추가하고 RLS의 module key 화이트리스트에 포함.

### 2. Module Control 토글

`src/contexts/ModuleStatusContext.tsx`:
- `KEY_MAP`에 `docs: 'module_docs_status'` 추가
- `docs: ModuleStatus` state 추가, refresh/setStatus 확장
- 기본값은 `enabled: false` (DB seed로 `{enabled: false, reason: 'not_ready'}` 삽입)

`src/pages/admin/ModuleControlTab.tsx`:
- T&C, Defect 카드 아래에 `Docs` 카드 추가 (동일 UI)

`src/components/layout/RoleGuard.tsx`:
- `detectModule`에 `/docs/...` → `'docs'` 매핑 추가
- admin은 통과하는 기존 분기 그대로 → admin은 비활성 상태에서도 사용 가능

### 3. 사이드바

`src/components/layout/AppSidebar.tsx`:
- `useModuleStatus()`에서 `docs` 추출
- `docsNav` 배열 추가 (Dashboard / Raw Data / Import / Export / Org Mapping)
- `showDocsGroup = isAdmin || docs.enabled`
- 그룹 라벨에 Paused 뱃지 (T&C/Defect와 동일)
- OMM/Warranty/Spare는 `disabled` prop으로 grayed out + "Coming soon" tooltip

### 4. 라우팅

`src/App.tsx`에 추가:
```text
/docs/dashboard      → DocsDashboardPage
/docs/raw-data       → DocsRawDataPage
/docs/import         → DocsImportPage
/docs/import/logs    → DocsImportLogsPage
/docs/export         → DocsExportPage
/docs/org-mapping    → DocsOrgMappingPage  (admin only)
/docs/:id            → DocsDrawingDetailPage
```

`<DocsImportProvider>`로 감싸기 (DefectImportProvider 패턴 그대로).

### 5. 권한

`src/lib/role-permissions.ts`:
- `/docs/dashboard` → 0 (everyone)
- `/docs/raw-data`, `/docs/:id` → 1 (super_guest+)
- `/docs/import`, `/docs/export` → 2 (user+)
- `/docs/org-mapping` → 4 (superuser/admin)

### 6. Import 파서

`src/lib/docs-import-parser.ts`:
- 멀티시트 sweeper: 시트별로 헤더 행 자동 탐지
- 헤더 fuzzy match: `DOCUMENT NUMBER`, `REVISION`, `TITLE`, `STATUS`, `DATE` 변형 인식
- ELEC 파서: doc no에서 organisation/discipline 추출 (예: `SHAW-ELEC-XXX-001`)
- Aconex Status: `A`/`B` → `is_submitted = true` (approved), 그 외 → false
- Organisation 매칭:
  1. `docs_org_alias` 룩업
  2. 실패 시 `subcontractor_master` fuzzy
  3. 둘 다 실패 → `subcontractor_id = null` + unmatched 리스트에 추가
- 8-worker 동시성 (ImportContext 패턴 재사용), throttled progress (200ms)

### 7. Risk 엔진

`src/lib/docs-risk.ts` (순수 함수):
```text
computeRisk(drawing, scDate, leadDays):
  if drawing.is_submitted → 'green'
  target = scDate - leadDays (working days)
  diff = target - today
  diff < 0 → 'red'
  diff < 7 → 'amber'
  else     → 'green'
```
설정값(SC date, lead time)은 `useAppSetting`로 실시간 구독 → 변경 즉시 UI 반영.

### 8. 설정 저장 위치 (기존 Admin Setting 공유)

신규 키를 `app_settings`에 추가:
- `docs_sc_date_<project_id>` → `'2026-06-15'` (SHAW seed)
- `docs_lead_days_as_built` → `30` (기본값, 추후 조정)
- `docs_lead_days_omm` / `_warranty` / `_spare` → 각 기본값
- `module_docs_status` → `{enabled: false}`

기존 Admin 탭에서 별도 UI 추가 없이, Module Control 카드 안에 "Docs Settings" expandable 섹션으로 SC Date / lead times 입력 필드 노출.

### 9. UI 페이지

- **DocsDashboardPage**: KPI (총 도면 수 / Approved / Pending / Red Risk), Risk 분포 차트, Critical bottleneck 패널 (Red 항목 top 20)
- **DocsRawDataPage**: 테이블 (defect raw data 패턴), Risk 컬럼, 필터 (status/discipline/organisation/risk), Frozen column 지원
- **DocsImportPage**: 업로드 → 시트 선택 → 컬럼 매핑 확인 → Dry-run 미리보기 → Commit. 결과 화면에 unmatched organisation 리스트 표시 (admin은 거기서 바로 매핑 가능)
- **DocsDrawingDetailPage**: 단일 도면 상세 + change log + raw payload viewer
- **DocsOrgMappingPage** (admin): `docs_org_alias` CRUD

---

## 파일 변경 목록

**신규**
- `supabase/migrations/<timestamp>_docs_module.sql`
- `src/contexts/DocsImportContext.tsx`
- `src/lib/docs-import-parser.ts`, `src/lib/docs-risk.ts`, `src/lib/docs-utils.ts`
- `src/pages/docs/DocsDashboardPage.tsx`, `DocsRawDataPage.tsx`, `DocsImportPage.tsx`, `DocsImportLogsPage.tsx`, `DocsExportPage.tsx`, `DocsDrawingDetailPage.tsx`, `DocsOrgMappingPage.tsx`
- `src/components/docs/` (KpiCard, RiskBadge, OrgMappingDialog 등)

**수정**
- `src/App.tsx` — 라우트 + Provider
- `src/components/layout/AppSidebar.tsx` — Docs 그룹
- `src/components/layout/RoleGuard.tsx` — `/docs` 모듈 감지
- `src/contexts/ModuleStatusContext.tsx` — `docs` 상태 추가
- `src/pages/admin/ModuleControlTab.tsx` — Docs 토글 + Docs Settings 섹션
- `src/lib/role-permissions.ts` — `/docs/*` 라우트 권한

---

## 구현 순서 (실제 작업)
1. DB 마이그레이션 + `module_docs_status` seed (disabled)
2. ModuleStatusContext + RoleGuard + role-permissions 확장
3. ModuleControlTab에 Docs 토글 + Settings 섹션 (SHAW SC date 2026-06-15 seed 포함)
4. AppSidebar에 Docs 그룹 + 라우팅
5. Import 파서 + DocsImportContext
6. Raw Data / Detail / Dashboard / Org Mapping 페이지
7. Risk 엔진 + Dashboard 시각화
8. QA: SHAW 샘플 엑셀로 end-to-end 검증

승인하시면 위 순서대로 구현 들어가겠습니다.
