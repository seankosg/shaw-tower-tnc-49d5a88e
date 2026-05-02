
# ABD Raw Data 모듈 전면 고도화 계획 (Field Config 포함)

목표: 단순 검색·500행 제한 화면인 `DocsRawDataPage`를 **T&C(`SubtestList`) / Defect(`DefectRawDataPage`)** 와 동일 수준의 풀스펙 Raw Data 화면으로 재구현하고, Admin → Field Config에 **Drawing(ABD) Fields** 탭을 추가합니다.

- UI / 라벨 / 버튼은 영문 유지
- 기존 데이터 모델(`docs_drawings`, `sub_module = 'as_built'`) 그대로 사용
- **신규 테이블 1개**(`docs_field_config`) 추가 — 다른 두 모듈과 동일 패턴

---

## 1. 기능 동등성 (T&C / Defect와 1:1 매핑)

| 영역 | 적용 기능 |
|---|---|
| 데이터 로딩 | 1,000행 페이지네이션으로 전체 행 로드 (500행 제한 제거) |
| 테이블 엔진 | TanStack Table + `@tanstack/react-virtual` 가상화 |
| 정렬 / 필터 | 컬럼별 multi-select / text(콤마=AND) / date-range 드롭다운, faceted unique values, 글로벌 검색 |
| 컬럼 관리 | 표시 토글 · 너비 리사이즈 / auto-size · 순서 D&D · frozen column 개수 · localStorage 영속화 (user별 키) |
| 활성 필터 칩 | 상단 chip 표시 + 클릭 해제 (`filter-chip-utils`) |
| 인라인 편집 | 셀 더블클릭 편집 (낙관적 업데이트 + `row_version` 증분 + 실패 시 toast 롤백) |
| 일괄 편집 | 행 선택 → `BulkEditBar`로 Status / Discipline / Revision 등 일괄 변경 |
| 코멘트 컬럼 | `MetaCell` 재사용 (drawings용 RPC 미존재 시 graceful: 0 표시) |
| 가로 스크롤 | `TopHorizontalScrollbar` 상단 미러 스크롤바 |
| 엑셀 내보내기 | 현재 필터 결과 → xlsx, `view` / `reimport` 두 포맷 |
| URL 파라미터 | 글로벌 검색 / 일부 필터를 search params에 동기화 |
| 모바일 대응 | `useIsMobile` 분기 |
| 권한 | 편집/일괄/내보내기 버튼은 role 기반 (subcontractor는 읽기 전용) |

---

## 2. ABD 전용 비즈니스 규칙

- **Trade (단일 컬럼, sheet_name 파생)** — 별도 컬럼 아님. `sheet_name`에서 파생된 카테고리 값이 들어가는 **단일 컬럼 1개**. `src/lib/docs-trade.ts` 헬퍼에서 매핑 규칙 관리. 정렬·multi-select 필터·엑셀 export 모두 일반 컬럼처럼 동작. 파생값이므로 편집 불가.
- **Discipline** — DB의 `discipline` 컬럼 값을 별도 컬럼으로 그대로 유지 (Trade와 무관).
- **Risk** — 기존 `computeRisk()` 컬럼화 + multi-select 필터(red/amber/green).
- **Submission Stage** — `sub1_*` / `sub2_*` / `sub3_*` 그룹은 collapsible 컬럼 그룹.
- **Status badge** — `aconex_status` / `is_submitted` / `current_status` 조합.

---

## 3. Field Config (관리자 기능)

T&C(`field_config`) / Defect(`defect_field_config`)와 동일 스키마의 **`docs_field_config` 테이블 신규 생성** + Admin UI 탭 추가.

### 3-1. 신규 테이블 (마이그레이션)
```sql
create table public.docs_field_config (
  id uuid primary key default gen_random_uuid(),
  field_name text not null unique,
  display_name text not null,
  is_enabled boolean not null default true,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  original_header text,
  source_origin text not null default 'system',
  visible_to_roles app_role[],
  editable_to_roles app_role[]
);
alter table public.docs_field_config enable row level security;
-- select: 모든 인증 사용자
-- insert/update/delete: admin / superuser (has_role 사용)
```
초기 시드: `document_no, revision, title, trade(파생), discipline, sheet_name, series, level_location, document_type, organisation_raw, aconex_status, current_status, is_submitted, transmittal_number, submitted_date, approved_date, transmittal_due_date, days_due, sub1_*, sub2_*, sub3_*, remarks, risk(파생), updated_at, created_at` 일괄 INSERT.

### 3-2. Admin UI
`AdminPage.tsx`의 `FieldConfigTab`에 sub-tab 추가:
```text
T&C Fields  |  Defect Fields  |  Drawing Fields (NEW)
```
기존 `FieldConfigTable` 컴포넌트의 `table` prop 타입에 `'docs_field_config'` 추가하여 그대로 재사용 (showOrigin=true).

### 3-3. 사용처
- `useDocsFieldConfig` 훅이 `docs_field_config`을 읽어 `DocsRawDataPage`에서:
  - `isFieldVisible(fieldName)` → 컬럼 표시/숨김
  - `getLabel(fieldName)` → 헤더 라벨 (관리자가 변경 가능)
  - `sortFieldNames(...)` → 컬럼 기본 순서
  - `is_required` / `editable_to_roles` → 인라인·BulkEdit 가드

---

## 4. 신규 / 수정 파일

```text
신규
  supabase/migrations/<ts>_docs_field_config.sql   테이블 + RLS + seed
  src/lib/docs-trade.ts                            sheet_name → trade 카테고리
  src/lib/docs-excel-export.ts                     view / reimport 두 포맷 export
  src/hooks/useDocsFieldConfig.ts                  useDefectFieldConfig 미러링

수정
  src/pages/docs/DocsRawDataPage.tsx               전면 재작성
  src/pages/AdminPage.tsx                          FieldConfigTab에 'Drawing Fields' 탭 추가
                                                    FieldConfigTable의 table prop 타입 확장

재사용 (수정 없음)
  src/components/raw-data/{BulkEditBar,MetaCell,TopHorizontalScrollbar}.tsx
  src/lib/{bulk-edit,filter-chip-utils,meta-fields}.ts
  src/hooks/useAppSettings.ts (useFrozenColumnCount)
```

---

## 5. 컬럼 세트 (Field Config 기본 시드)

```text
[고정] document_no · revision · title
[일반] trade(파생) · discipline · sheet_name · series · level_location
       document_type · organisation_raw · subcontractor · aconex_status
       current_status · is_submitted · transmittal_number
       submitted_date · approved_date · transmittal_due_date · days_due
       sub1_planned/submission/approval_date · sub1_approval_status
       sub2_*  ·  sub3_*
       remarks · risk(파생) · updated_at · created_at
[메타] comments (MetaCell)
```
기본 정렬 `document_no asc`. 모든 컬럼 hideable / resizable.

---

## 6. 인라인 / 일괄 편집 화이트리스트

```text
text:    revision, title, remarks, transmittal_number
select:  discipline, document_type, current_status, aconex_status,
         sub1/2/3_approval_status
boolean: is_submitted
date:    submitted_date, approved_date, transmittal_due_date,
         sub1/2/3_planned_date, sub1/2/3_submission_date, sub1/2/3_approval_date
```
> Trade·Risk는 파생값이므로 편집 불가. Field Config의 `editable_to_roles`로 추가 제한.

---

## 7. 단계별 구현 순서

1. 마이그레이션: `docs_field_config` 테이블 + RLS + 초기 seed
2. `docs-trade.ts` 작성 (매핑 + `getTradeFromSheetName(sheet_name)`)
3. `useDocsFieldConfig.ts` 작성
4. `docs-excel-export.ts` 작성
5. `DocsRawDataPage.tsx` 재작성 (데이터 로딩 → 컬럼 정의 → 필터/정렬 → 가상화 → 인라인 편집 → BulkEditBar → Export dialog)
6. `AdminPage.tsx`에 Drawing Fields 탭 추가
7. localStorage 키: `docs-raw-data-state:${user.id}` (컬럼 너비/표시/순서/정렬/필터)
8. 회귀 점검: `/docs/raw-data` 진입 → 필터/정렬/편집/엑셀 / Admin Field Config 동작 확인

---

## 8. 비범위 (이번 작업에서 제외)

- `docs_drawings` 스키마 변경
- Import / Dashboard / Drawing Detail 페이지 변경
- Trade 매핑 규칙의 관리자 UI (헬퍼 상수로만; 추후 Phase에서 별도 Admin 추가 가능)

승인해 주시면 위 순서대로 구현하겠습니다.
