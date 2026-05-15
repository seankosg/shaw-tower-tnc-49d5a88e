## 목표
Punch Raw Data 페이지를 Defect/Spare Part Raw Data와 동일한 수준으로 **Field Config + Header Mapping과 완전 연동**합니다. 현재 페이지는 `usePunchFieldConfig`를 호출하지 않고 컬럼·라벨·표시 여부를 하드코딩하고 있어서, Admin → Field Config / Header Mappings에서 변경한 내용이 raw data 화면에 반영되지 않습니다.

## 현재 상태 (조사 결과)
- `punch_field_config` 테이블은 존재하지만 **행이 0개** → 시드 필요.
- `usePunchFieldConfig`/`PUNCH_FIELDS` 레지스트리는 이미 구현됨.
- `import_header_mappings`에 `module = 'punch'` 정의가 이미 존재하며 import 파서는 이것을 사용 중.
- `src/pages/PunchRawDataPage.tsx`는 13개 컬럼을 JSX로 직접 그림 → Field Config / Header Mapping 무시.
- 비교 기준: `DocsSparePartRawDataPage.tsx`가 `useDocsFieldConfig`를 사용해 (a) 라벨, (b) 정렬, (c) 가시성, (d) `raw_payload`/`custom_payload` 기반 동적 컬럼까지 모두 처리.

## 작업 계획

### 1. DB 시드 마이그레이션
- `PUNCH_FIELDS` 레지스트리(=SSOT) 기준으로 `punch_field_config` 초기 행 삽입.
  - `field_name` = registry field, `display_name` = `exportLabel`, `is_required` = registry required, `sort_order` = registry 순서 × 10, `source_origin` = 'system'(파생: `readOnly` 필드는 'derived').
  - `INSERT … ON CONFLICT (field_name) DO NOTHING` 으로 멱등성 보장.

### 2. Raw Data 페이지 리팩터 (`src/pages/PunchRawDataPage.tsx`)
Spare Part 패턴을 그대로 따라 다음을 도입:
- `usePunchFieldConfig()` 훅에서 `fields`, `getLabel`, `isFieldVisible`, `getOrder` 사용.
- 컬럼 정의를 `PUNCH_FIELDS` 레지스트리 순회로 자동 생성하고, 헤더 라벨은 `getLabel(field)` 로 가져옴 (Admin이 변경한 display_name 우선, 없으면 registry exportLabel).
- 추가로 **동적 컬럼**: `punch_field_config`에 등록된 행 중 registry에 없는 항목은 `raw_payload[original_header]` / `custom_payload[field_name]` 폴백으로 표시 (Spare Part 로직 복사).
- 컬럼 가시성: `isFieldVisible(field, roles)` 결과를 TanStack `columnVisibility`로 적용 + 사용자 토글은 localStorage 오버라이드.
- 컬럼 순서: `sort_order` 기준 정렬(Pre-Eng Gates / Health Badge 등 특수 표시 컬럼은 pinned 처리).
- 기존 특수 셀 렌더(`GateDots`, `HealthBadge`, `VarianceCell`, `PctCell`, Ready 배지)는 보존하되 컬럼 메타에 `cellRenderer` 키로 매핑.

### 3. Header Mapping 표기
- Admin Header Mappings 탭에서 등록된 `original_header`(또는 가장 최근 alias)를 컬럼 헤더 툴팁/서브 라벨로 노출 → Spare Part와 동일한 `getOriginHeaderStyle` 패턴 사용 (origin 색상 dot + tooltip).

### 4. 검증
- `psql`로 시드 결과 확인 (40+ rows 예상).
- 미리보기에서 Punch Raw Data 진입 → Admin에서 라벨 변경 / 컬럼 비활성화 시 즉시 반영되는지 확인.
- Import 후 `raw_payload`에만 존재하는 커스텀 컬럼이 동적 컬럼으로 보이는지 확인.

## 영향 범위
- 새 마이그레이션 1개
- 수정: `src/pages/PunchRawDataPage.tsx` (대규모 리팩터)
- 신규(선택): `src/lib/punch-raw-columns.tsx` 헬퍼로 cell 렌더러 분리 (가독성)

기존 import / export / detail 페이지는 변경하지 않습니다.
