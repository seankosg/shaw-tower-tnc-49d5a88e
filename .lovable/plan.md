## Spare Part Import 개선 계획 (옵션 D)

업로드된 `Spare_Stock_Quantities_Summary_breakdown_260512.xlsx`는 4단계 계층(Category → Parent → Sub-category → Leaf)에 S/N #1, S/N #2 두 컬럼을 가지고 있습니다. 현재 파서는 3단계 가정으로 동작해 leaf 행이 데이터 행으로 잘못 분류되고, 재업로드 시 중복이 발생합니다. 아래와 같이 수정합니다.

### 1. DB 스키마 변경 (`docs_spare_part`)
- `sub_category text` 컬럼 추가 — Sub-category 행(예: `Natural Stone`, `Ceramic Tiles`) 명을 leaf 행에 함께 저장
- `level text` 컬럼 추가 — `category` | `parent` | `subcategory` | `leaf` 4가지 값 중 하나
- `sn_outline text` 컬럼 추가 — S/N #1(자유 형식) 원본 보존, 기존 `sn`은 S/N #2(`A-1-a-1`)로 매핑

### 2. 파서 (`src/lib/docs-spare-part-import-parser.ts`)
- `FALLBACK_ALIASES` 확장: `'s/n #2' → sn`, `'s/n #1' → sn_outline`
- 4단계 분류기 신설 — S/N #2 패턴 우선 사용
  - `^[A-Z]$` → `category`
  - `^[A-Z]-\d+$` → `parent`
  - `^[A-Z]-\d+-[a-z]$` → `subcategory`
  - `^[A-Z]-\d+-[a-z]-\d+$` → `leaf`
  - 패턴이 없으면 S/N #1 fallback (기존 휴리스틱)
- 컨텍스트 스택 유지 — leaf 행에 `category`, `parent_item`, `sub_category` 자동 채움
- 안정 synthSn — S/N #2 값을 그대로 `sn`으로 사용해 재업로드 시 idempotent
- `Category` 컬럼 → `trade` fallback 매핑

### 3. Import 페이지 (`src/pages/docs/DocsSparePartImportPage.tsx`)
- 미리보기에 `level`, `sub_category`, `sn_outline` 컬럼 표시
- `d_superuser`이면서 `team`이 비어있는 경우 경고

### 4. Raw Data 페이지 (`src/pages/docs/DocsSparePartRawDataPage.tsx`)
- `level` 필터(All / Leaf only / Parent / Sub-category / Category) 추가, 기본값 Leaf only
- 컬럼: `S/N` (S/N #2), `S/N Outline` (S/N #1), `Level`, `Category`, `Parent`, `Sub-category`, `Material`, ... 순으로 정리
- 합계 행(Parent/Subcategory)은 Leaf only 모드에서 자동 숨김

### 5. Field config / 상세 페이지
- `docs_field_config`(sub_module=spare_part) seed: `sub_category`, `level`, `sn_outline` 노출
- `DocsSparePartDetailPage.tsx`에 신규 필드 표시·편집

### 검증
- 재업로드 시 동일 `sn`(=S/N #2)으로 upsert → 중복 0
- 203행이 정확히 import됨 (Category 2 + Parent 13 + Sub-category 59 + Leaf 129)
- Leaf 합계가 상위 Sub-category 합계와 일치하는지 샘플 확인

### 변경 파일
- 신규 마이그레이션 (sub_category, level, sn_outline 컬럼 + field_config seed)
- `src/lib/docs-spare-part-import-parser.ts`
- `src/pages/docs/DocsSparePartImportPage.tsx`
- `src/pages/docs/DocsSparePartRawDataPage.tsx`
- `src/pages/docs/DocsSparePartDetailPage.tsx`
