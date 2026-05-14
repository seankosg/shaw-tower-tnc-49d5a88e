## Spare Part Header Mappings — unmapped 필드 활성화

### 현상
Admin → Header Mappings → DOCS / Spare Part 탭에 "(unmapped — 21 aliases)" 섹션이 보이며, `actual_confirm_date`, `planned_po_date`, `level`, `location`, `team`, `trade` 등 21개 별칭이 시스템 필드에 매핑되지 못한 상태로 표시됩니다.

### 원인
`src/pages/admin/HeaderMappingsTab.tsx`의 `DOCS_SPARE_PART_FIELDS` 상수가 placeholder 수준(14개 필드)만 정의되어 있어, `docs_spare_part` 테이블에 실제로 존재하는 컬럼·import parser가 사용하는 필드들이 화이트리스트에서 누락되어 있습니다. 실제 DB 컬럼은 47개, parser는 더 많은 필드를 지원합니다. 매핑 데이터 자체는 모두 `is_active=true`이므로 토글 변경이 아닌 화이트리스트 확장이 필요합니다.

### 변경 사항
`src/pages/admin/HeaderMappingsTab.tsx` 한 파일만 수정. `DOCS_SPARE_PART_FIELDS`를 `docs_spare_part` 테이블의 도메인 컬럼 전체로 확장:

```ts
const DOCS_SPARE_PART_FIELDS = [
  // Identification
  'sn', 'sn_outline', 'category', 'sub_category', 'parent_item',
  // Item spec
  'material', 'spec_ref', 'specification', 'size',
  'level', 'floor_level', 'location', 'item_type',
  // Spare requirements
  'spares_requirements', 'unit', 'spares_quantity', 'storage_area_required',
  // Procurement / dates
  'material_lead_time',
  'planned_confirm_date', 'actual_confirm_date',
  'direction_to_subcon_date', 'eta_date',
  'planned_po_date', 'actual_po_date', 'po_status',
  'planned_delivery_date', 'actual_delivery_date',
  // Assignment
  'team', 'trade', 'subcontractor_name', 'hdec_pic_name', 'hdec_eng_name',
  // Status / notes
  'status', 'remarks',
  // Pseudo-target for ignoring system/derived columns on import
  'skip',
] as const;
```

### 결과
- Admin 화면에서 "(unmapped — 21 aliases)" 섹션이 사라지고, 각 별칭이 해당 시스템 필드 그룹 아래로 이동.
- 모든 매핑은 이미 `is_active=true`라 import 파이프라인 동작에는 변화 없음(이미 인식되고 있었음). 변경은 Admin UI의 분류 표시 정확성 향상이 목적.
- DB 마이그레이션, parser, import 워커 변경 없음.

### 위험
- 없음(상수 화이트리스트 확장만, 다른 모듈 영향 없음).

승인하시면 바로 적용합니다.