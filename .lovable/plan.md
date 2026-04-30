## 목표

Defect Excel import 시 `Comments` 헤더는 **Aconex 원본 코멘트**(`aconex_comments`)로, `HDEC Comments` 헤더는 기존대로 **HDEC 운영자 코멘트**(`hdec_comments`)로 분리 저장한다. 과거 데이터도 동일 규칙으로 백필한다.

## 현황 (DB 조회 결과)

- `defect_items` 총 3,332행
- 현재 `hdec_comments`에 데이터가 들어있는 행: **0건**
- `raw_payload` 안의 코멘트성 키: `Octopus Remarks` 만 발견. `Comments`/`HDEC Comments` 키는 0건
- 즉, **현재 DB에는 분리 백필이 필요한 실제 코멘트 데이터가 사실상 없습니다**. 그래도 안전하게 백필 로직은 포함합니다 (이후 새 import도 `raw_payload`에 보존됨).

## 변경 사항

### 1. 스키마 (마이그레이션)

```sql
ALTER TABLE defect_items ADD COLUMN aconex_comments text;

INSERT INTO defect_field_config (field_name, display_name, source_origin, sort_order, is_enabled)
VALUES ('aconex_comments', 'Aconex Comments', 'aconex', <hdec_comments sort_order - 1>, true);
```

### 2. 파서 (`src/lib/defect-parser.ts`)

- `ParsedDefect` 인터페이스에 `aconex_comments: string | null` 추가
- 헤더 매핑 변경:
  - `'comments'` → `aconex_comments` (변경)
  - `'hdec comments'` → `hdec_comments` (유지)
- `toParsedDefect()` 출력에 `aconex_comments` 포함

### 3. Import (`src/contexts/DefectImportContext.tsx`)

- upsert payload 필드 목록에 `aconex_comments` 추가
- `field_log` 기록 대상에 `aconex_comments` 추가
- Re-import 헤더 셋에 `Aconex Comments` 추가

### 4. 표시·편집·내보내기

다음 4곳에 `aconex_comments` 컬럼 추가 (HDEC Comments 바로 옆):
- `src/pages/DefectRawDataPage.tsx` — 컬럼 정의(3곳), 너비 맵, truncate 처리, BulkEdit Notes 그룹
- `src/pages/DefectDetailPage.tsx` — 상세 화면 노출
- `src/lib/defect-excel-export.ts`, `src/lib/defect-export-utils.ts` — 내보내기 컬럼
- `src/hooks/useDefectFieldConfig.ts` — `DEFECT_DEFAULT_FIELD_LABELS`에 'Aconex Comments' 추가
- `src/lib/defect-utils.ts` — DefectItem 타입 확장
- 테스트 픽스처 (`src/test/defect-import-issue-assignment.test.ts`, `src/test/defect-dashboard-utils.test.ts`)

### 5. 과거 데이터 백필 (마이그레이션)

`raw_payload`를 스캔해 키 존재 여부에 따라 분리 — 대소문자 무시:

```sql
-- 'HDEC Comments' / 'hdec comments' 등 → hdec_comments (현재는 0건이지만 안전망)
UPDATE defect_items SET hdec_comments = COALESCE(NULLIF(hdec_comments,''), v)
FROM (
  SELECT id, value::text AS v FROM defect_items, jsonb_each_text(raw_payload)
  WHERE lower(key) IN ('hdec comments','hdec_comments')
) s WHERE defect_items.id = s.id;

-- 'Comments' / 'comments' (단, hdec 형이 아닌 것만) → aconex_comments
UPDATE defect_items SET aconex_comments = v
FROM (
  SELECT id, value::text AS v FROM defect_items, jsonb_each_text(raw_payload)
  WHERE lower(key) = 'comments'
) s WHERE defect_items.id = s.id;
```

(현 DB 상태 기준 영향 행은 0건. 이후 import된 데이터에 대해서만 의미가 있으나 일회성으로 안전하게 실행.)

### 6. ColumnSelectDialog

별도 변경 불필요 — 헤더 두 개가 이미 별개로 노출됨. 매핑 결과만 새 필드로 가도록 자동으로 따라감.

## 영향 없는 부분

- RLS, 타입 자동 생성(`types.ts`)
- Import 로그 / 변경 이력 — `field_name` 기준이므로 새 필드 자동 지원

## 리스크

- 과거 엑셀 중 단일 `Comments` 컬럼이 사실상 HDEC 운영 노트였던 경우, 새 규칙 적용 시 `aconex_comments`로 들어감. 단, 현재 DB에 그런 데이터 0건이라 문제 없음. 새 import에서 의심되면 사용자에게 ColumnSelectDialog로 제외 가능.

## 실행 순서

1. 마이그레이션: 컬럼 추가 + field_config 시드
2. 파서/Import 코드 수정
3. UI(RawData/Detail/Export) 노출
4. 백필 마이그레이션 실행
5. 빌드 확인
