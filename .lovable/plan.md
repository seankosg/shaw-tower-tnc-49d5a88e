
# Docs 모듈 4-서브모듈 확장 — Phase 1 구현 계획 (확정)

## 0. 확정 사항

| 항목 | 결정 |
|---|---|
| 테이블 분리 | **4개 별도 테이블** (필드 구조 완전 상이) |
| 현재 상태 | ABD만 완료 — `docs_drawings` 테이블명 그대로 유지 |
| 신규 추가 (이번 라운드) | **OMM, Spare Part** + Dashboard 통합 |
| 분리 (다음 라운드) | **Warranty** (복잡도 높음 — 9-stage workflow + child table + Admin master 확장) |
| Dashboard | 1페이지 — 상단 KPI 4분할 + 아래 세로 4섹션 |
| Import/Export | **단일 페이지 + 서브모듈 선택 드롭다운** |
| ABD 경로 | `/docs/raw-data` → **`/docs/abd`로 변경** (구 경로는 리다이렉트) |
| Dashboard 포함 | **Phase 1에 포함** |

---

## 1. 사이드바 재구성 (7개 메뉴)

```text
Docs
├─ Dashboard           /docs/dashboard
├─ ABD Raw Data        /docs/abd               (= 기존 /docs/raw-data)
├─ OMM Raw Data        /docs/omm               신규
├─ Warranty Raw Data   /docs/warranty          신규 (Phase 3 placeholder)
├─ Spare Part Raw Data /docs/spare-part        신규
├─ Import              /docs/import            서브모듈 선택 추가
└─ Export              /docs/export            신규 구현
```

`/docs/raw-data`, `/docs/drawing/:id` → `/docs/abd`, `/docs/abd/:id` 리다이렉트.

---

## 2. 데이터베이스 마이그레이션

### 2.1 신규 테이블 — `docs_omm`

```text
id, project_id, sub_module='omm' (default)
sn                       text     -- "1", "2"
category                 text     -- 'A'|'B'|'C' (Architectural/M&E/Misc)
contract_doc             text     -- "A1.803", "ME-SPE-02"
work_trade_material      text
contractor_supplier      text
draft_section            text
draft_target_date        date
draft_actual_date        date
submission_target_date   date
submission_actual_date   date
approved_date            date
remarks                  text
softcopy_required        text
hardcopy_required        text

-- 공통 메타
hdec_pic_name, hdec_eng_name, subcontractor_name, team, trade,
data_source_type, source_upload_id, raw_payload jsonb,
custom_payload jsonb, is_active, row_version,
created_at, updated_at, updated_by
```

상태 계산 (코드 함수):
- `draft_actual_date` 없음 → `Pending Draft`
- `submission_actual_date` 없음 → `Pending Submission`
- `approved_date` 없음 → `Under Review`
- `approved_date` 있음 → `Approved`

### 2.2 신규 테이블 — `docs_spare_part`

```text
id, project_id
sn                       text     -- "1","a)","b)" 계층
category                 text
parent_item              text     -- "Tiling","Ceiling" 그룹 헤더
material                 text
spec_ref                 text
spares_requirements      text     -- "2% or 3 boxes"
unit                     text     -- M2, litres
spares_quantity          text     -- 자유형식 ("49","5 (1 Tin)")
storage_area_required    text
status                   text     -- 'Ordered'|'Stock available'|'Pending'|'Short'
remarks                  text

-- 공통 메타 (위와 동일)
```

### 2.3 신규 테이블 — `docs_warranty` (skeleton만, Phase 3에서 본격 구현)

이번 라운드에는 빈 placeholder 페이지만 만들고 테이블은 Phase 3에서 생성.

### 2.4 기존 테이블 변경

| 테이블 | 변경 |
|---|---|
| `docs_field_config` | `sub_module text NOT NULL DEFAULT 'as_built'` 컬럼 추가. 기존 행 백필 |
| `docs_change_log` | `sub_module text` 컬럼 추가 (기본 `'as_built'`). `drawing_id`는 그대로 유지하되 OMM/Spare Part는 `record_id` 의미로 사용 (컬럼명만 호환). 또는 신규 nullable `record_id uuid` 추가하고 코드 분기 처리 — **후자 채택** |
| `docs_upload_batches` | `sub_module` 이미 존재 — 변경 없음 |

### 2.5 RLS 정책 (`docs_omm`, `docs_spare_part`)

`docs_drawings`와 동일 패턴:
- SELECT: `authenticated` 모두
- INSERT/UPDATE: `has_any_role(auth.uid(), {admin, superuser, senior_user, user})`
- DELETE: `is_admin_or_superuser(auth.uid())`

### 2.6 시드 데이터

`docs_field_config`에 OMM/Spare Part 필드 정의 insert (각 서브모듈당 ~15행). Raw Data 테이블 컬럼 정의의 single source of truth.

---

## 3. 페이지 구현

### 3.1 신규 페이지

| 파일 | 경로 |
|---|---|
| `src/pages/docs/DocsOMMRawDataPage.tsx` | `/docs/omm` |
| `src/pages/docs/DocsOMMDetailPage.tsx` | `/docs/omm/:id` |
| `src/pages/docs/DocsSparePartRawDataPage.tsx` | `/docs/spare-part` |
| `src/pages/docs/DocsSparePartDetailPage.tsx` | `/docs/spare-part/:id` |
| `src/pages/docs/DocsWarrantyRawDataPage.tsx` | `/docs/warranty` (placeholder) |

### 3.2 변경 페이지

| 파일 | 변경 |
|---|---|
| `DocsDashboardPage` | 4섹션 통합 뷰로 전면 개편 |
| `DocsRawDataPage` → `DocsABDRawDataPage` | 파일명 변경 (내용 동일) |
| `DocsDrawingDetailPage` → `DocsABDDetailPage` | 파일명 변경 |
| `DocsImportPage` | 상단에 서브모듈 선택 추가 (ABD/OMM/Spare Part) |
| `DocsExportPage` | placeholder → 본격 구현 (서브모듈 선택 + 필터 + 시트 3종) |
| `AppSidebar` | Docs 그룹 7개 메뉴로 재구성 |
| `App.tsx` | 신규 라우트 + 리다이렉트 추가 |

### 3.3 신규 라이브러리/훅

| 파일 | 역할 |
|---|---|
| `src/lib/docs-omm-status.ts` | OMM 상태 계산 로직 |
| `src/lib/docs-omm-import-parser.ts` | OMM 엑셀 파서 |
| `src/lib/docs-omm-excel-export.ts` | OMM Export |
| `src/lib/docs-spare-part-status.ts` | Spare Part 상태 계산 |
| `src/lib/docs-spare-part-import-parser.ts` | Spare Part 파서 |
| `src/lib/docs-spare-part-excel-export.ts` | Spare Part Export |
| `src/hooks/useDocsFieldConfig` | `sub_module` 인자 추가 (default `'as_built'`) |

### 3.4 Dashboard 레이아웃

```text
┌────────────────────────────────────────────────────────┐
│ Docs Dashboard           Data Date: 04 May 2026       │
├────────────────────────────────────────────────────────┤
│ KPI Row (4 cards): ABD | OMM | Warranty | Spare Part │
│  approved/total  + risk/overdue count                  │
├────────────────────────────────────────────────────────┤
│ § ABD     — Cycle progress, top overdue                │
│ § OMM     — Status pie, category progress              │
│ § Warranty — placeholder ("Phase 3에서 활성화")         │
│ § Spare Part — Status 분포, storage 합계               │
├────────────────────────────────────────────────────────┤
│ § Recent Changes (3개 활성 모듈 통합, 최근 20건)       │
└────────────────────────────────────────────────────────┘
```

각 섹션 카드 클릭 시 해당 Raw Data 페이지로 이동.

---

## 4. Import / Export 통합

### Import (`/docs/import`)
- 상단 라디오: `ABD | OMM | Spare Part` (Warranty는 비활성)
- 선택에 따라 expected headers, parser, target table 분기
- `docs_upload_batches.sub_module` 값으로 기록
- `docs_field_config` 조회 시 `sub_module` 필터 적용

### Export (`/docs/export`)
- 상단 서브모듈 선택 (단일)
- 서브모듈별 필터:
  - ABD: Cycle/Status/Risk/Trade
  - OMM: Status/Category/Contractor
  - Spare Part: Status/Category
- 시트:
  - `Records` — 필터된 raw
  - `Summary` — 상태별 카운트
  - `Export Info` — 사용자/시간/필터/Data Date

---

## 5. 작업 순서 (Phase 1 단일 라운드)

1. **DB 마이그레이션** — `docs_omm`, `docs_spare_part` 테이블 + RLS + 시드 + `docs_field_config.sub_module`/`docs_change_log.sub_module` 컬럼 추가
2. **사이드바 재구성** — 7개 메뉴
3. **라우팅 변경** — `/docs/abd` 신규, `/docs/raw-data` 리다이렉트, 신규 4개 경로 추가
4. **OMM Raw Data + Detail** 구현
5. **Spare Part Raw Data + Detail** 구현
6. **Warranty placeholder 페이지** ("Phase 3에서 활성화")
7. **Import 페이지** 서브모듈 선택 + 파서 2종 신규
8. **Export 페이지** 본격 구현 (3개 활성 서브모듈)
9. **Dashboard 개편** — 4섹션 통합

---

## 6. 작업 범위 외

- Warranty 본격 구현 (Phase 3)
- Admin `subcontractor` 마스터 ACRA 컬럼 추가 (Phase 3)
- 4개 서브모듈 cross-module rule
- Phase 2 공통 컴포넌트 추출 (`DocsRawDataShell`, `DocsDetailShell`) — 다음 라운드

---

## 7. 위험 / 완화

| 위험 | 완화 |
|---|---|
| `docs_change_log` 컬럼 변경이 ABD 코드 깨뜨림 | 기존 `drawing_id` 컬럼 nullable 유지 + 신규 `record_id` nullable 추가, 둘 다 사용 |
| `useDocsFieldConfig` 시그니처 변경 | default `'as_built'`로 기존 호출부 호환 |
| 사이드바 7개 항목 길이 | Docs 그룹 collapsible (이미 지원) |
| ABD 경로 변경으로 외부 북마크 깨짐 | `/docs/raw-data*` → `/docs/abd*` 영구 리다이렉트 |

---

## 8. 승인 시 즉시 착수

이 계획대로 Phase 1 전체(DB 마이그레이션 + 7개 메뉴 + OMM/Spare Part CRUD + Import 확장 + Export 신규 + Dashboard 개편)를 한 라운드에 구현합니다. **승인 부탁드립니다.**
