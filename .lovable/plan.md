## Goal
ABD(도면) 모듈에도 T&C / Defect 모듈과 동일하게 **HDEC PIC** / **HDEC ENG** 담당자 필드를 도입합니다. 현재 임포트 엑셀에는 두 컬럼이 없지만, 향후 추가될 예정이므로 지금 미리 DB 필드와 코드 경로를 마련하고, 기존 모든 도면 행에는 **일회성 마이그레이션으로 두 필드 모두 "ST Jeon"** 값을 채워둡니다.

## 1. DB schema migration

`docs_drawings` 테이블에 두 컬럼 추가 + 기존 데이터 백필:

```sql
ALTER TABLE public.docs_drawings
  ADD COLUMN hdec_pic_name text,
  ADD COLUMN hdec_eng_name text;

-- One-time backfill: every existing drawing → "ST Jeon"
UPDATE public.docs_drawings
SET hdec_pic_name = 'ST Jeon',
    hdec_eng_name = 'ST Jeon';
```

`docs_field_config` seed 추가 (visible/editable to admin·superuser·senior_user·user, sort_order는 기존 담당자 그룹 근처):

```sql
INSERT INTO public.docs_field_config
  (field_name, display_name, source_origin, sort_order, is_enabled,
   visible_to_roles, editable_to_roles)
VALUES
  ('hdec_pic_name', 'HDEC PIC', 'system', 71, true,
   ARRAY['admin','superuser','senior_user','user','viewer']::app_role[],
   ARRAY['admin','superuser','senior_user','user']::app_role[]),
  ('hdec_eng_name', 'HDEC Eng', 'system', 72, true,
   ARRAY['admin','superuser','senior_user','user','viewer']::app_role[],
   ARRAY['admin','superuser','senior_user','user']::app_role[])
ON CONFLICT (field_name) DO NOTHING;
```

(컬럼 추가는 schema migration, UPDATE는 데이터 마이그레이션이지만 모두 한 마이그레이션 파일로 함께 실행 — 일회성이므로 허용 범위.)

## 2. Type & parser updates

- `src/integrations/supabase/types.ts`: 자동 재생성됨, 직접 수정 X.
- `src/lib/docs-import-parser.ts`
  - `DocsDrawingStruct`에 `hdec_pic_name`, `hdec_eng_name` 추가.
  - `KNOWN_FIELDS`에 두 필드 추가.
  - `HEADER_ALIAS_MAP`에 `'hdec pic' → hdec_pic_name`, `'hdec eng' / 'hdec engineer' → hdec_eng_name` 별칭 추가 (Defect 모듈과 동일 패턴).
  - `inferTargetField` 휴리스틱에 `hdec pic` / `hdec eng` 케이스 추가.
  - upsert payload에 두 필드 포함 (값이 없으면 `null` — 향후 엑셀에 컬럼이 생기면 자동 매핑됨).

## 3. UI: Raw Data page (`src/pages/docs/DocsRawDataPage.tsx`)

- 컬럼 정의에 `hdec_pic_name` / `hdec_eng_name` 추가 (담당자 그룹: `subcontractor_name` / `organisation_raw` 옆).
- Faceted multi-select 필터 지원 (Defect 모듈과 동일 패턴).
- 인라인 편집 가능 셀로 노출.
- `useDocsFieldConfig` 훅이 자동으로 새 필드를 노출하므로 별도 분기 불필요.

## 4. Bulk edit (`src/components/raw-data/DocsBulkEditBar.tsx` + `src/lib/bulk-edit.ts`)

- `DocsBulkEditBar`에 **HDEC PIC** / **HDEC Eng** 일괄 편집 입력 추가 (Defect의 BulkEditBar와 동일 UX, `hdec_pic_master` / `hdec_eng_master`에서 옵션 로드).
- `bulk-edit.ts`의 docs용 허용 필드 목록에 두 필드 추가 → `docs_change_log` 자동 기록.

## 5. Detail page (`src/pages/docs/DocsDrawingDetailPage.tsx`)

- 담당자 섹션에 HDEC PIC / HDEC Eng 표시 + 편집(권한 시) 추가.

## 6. Export (`src/lib/docs-excel-export.ts`)

- `view` / `reimport` 두 포맷 모두에 두 컬럼 포함.

## Out of scope
- `auto-create-master-user` 호출은 추가하지 않습니다 (값이 없는 신규 임포트가 대부분이고, 마스터 자동생성은 추후 엑셀에 실제 컬럼이 생긴 시점에 활성화). 단, 입력은 `hdec_pic_master` / `hdec_eng_master`의 활성 이름을 자동완성으로 사용.

## Verification
- 마이그레이션 후 `select count(*) filter (where hdec_pic_name = 'ST Jeon')` 로 모든 행 채워졌는지 확인.
- Raw Data 페이지에서 두 컬럼이 노출되고 'ST Jeon' 표시되는지 확인.
- Bulk edit으로 일부 행 변경 → `docs_change_log`에 기록되는지 확인.
