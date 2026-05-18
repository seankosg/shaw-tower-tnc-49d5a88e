## 현황 점검 결과

Punch 모듈의 Field Config / Header Mapping 인프라는 이미 존재합니다 (`punch_field_config` 38행, `import_header_mappings` punch=74행, `usePunchFieldConfig`, `getMappedField('punch', ...)`, Admin 탭). 하지만 **Punch Raw Data 화면(`PunchRawDataPage.tsx`)** 이 Defect/TnC만큼 깊게 연동되어 있지 않은 5가지 격차가 있습니다.

## 격차 (Defect와 비교)

1. **Field Config가 컬럼 빌드 시점에만 적용됨** — `visibleFields = sortFieldNames(all).filter(isFieldVisible)`로 컬럼 자체를 깎아냄. 결과:
   - Field Config에서 `is_enabled=false` 인 컬럼은 React Table에 아예 존재하지 않음 → 사용자가 런타임에 토글 불가
   - sort_order 변경이 즉시 반영되지 않음 (컬럼 재빌드 필요)
   - Defect는 `columnVisibility` + `columnOrder` state로 처리 → 모든 컬럼을 등록하고 가시성/순서만 동적 변경

2. **Field Config 실시간 동기화 없음** — Admin이 Punch Field Config를 수정해도 Raw Data 화면은 새로고침해야 반영됨. Defect/TnC의 `useDefectFieldConfig`/`useFieldConfig` 도 동일하게 일회성 fetch라 이 부분은 모듈 공통 개선이나, 최소한 mount 시점에서만이라도 동기화 보장 필요.

3. **`source_origin` 컬럼 UI 미노출** — DB에 `system / derived` 값이 있고 `getSourceOrigin`도 구현돼 있으나 헤더 옆 배지/툴팁이 없음. Defect는 `getSourceLabel`로 HDEC/Aconex/System 출처 표시.

4. **Bulk-edit / Export 컬럼 목록이 하드코딩** (lines 686–717, 920–937) — Field Config의 `display_name`, `is_enabled`, `sort_order`, `visible_to_roles` 를 무시하고 정적 배열로 정의됨. Field Config에서 컬럼을 비활성화해도 Bulk-edit/Export 옵션에는 그대로 노출됨.

5. **`MULTI_SELECT_FIELDS` / `TEXT_SEARCH_FIELDS` 등 분류 집합이 하드코딩** — Field Config / Registry 메타데이터에서 파생하지 않고 별도 `Set`으로 유지. 신규 dynamic field가 Field Config로 추가되면 글로벌 검색에서 빠짐.

또한 Import 측은 양호: `parsePunchWorkbook → resolveHeader → getMappedField('punch', alias)` 로 Header Mapping을 1순위로 사용 후 registry alias로 fallback. ✅

## 작업 범위

### A. PunchRawDataPage 컬럼 모델 리팩토링 (Defect 방식)
- `visibleFields`를 "표시할 컬럼"이 아닌 **"전체 컬럼"(PUNCH_FIELDS + 모든 enabled dynamic config row)** 로 변경
- React Table에 `columnVisibility` state 도입: `isFieldVisible(id, roles)` 결과를 매핑 (단, `__select`, `item_no` 등 핀고정 컬럼은 항상 true)
- `columnOrder` state 도입: `sortFieldNames(allIds)` 기준으로 정렬, 핀고정 컬럼은 앞에 배치
- 컬럼 재빌드는 정적 데이터 변화에만 의존하도록 deps 정리 → Field Config 변경 시 visibility/order만 갱신

### B. Bulk-edit / Export 옵션을 Field Config 파생으로 전환
- `bulkFields` 를 PUNCH_FIELDS 레지스트리에서 자동 생성 + `is_enabled === false` 인 항목 제거 + `getLabel` 라벨 사용 + `sortFieldNames` 정렬
- `exportColumns` (BulkEditBar의 prop) 도 동일하게 Field Config 기반으로 재구성
- 그룹(`Identity / Classification / People / Schedule / Pre-Engineering / Status / Notes`) 은 PunchFieldDef의 `group` 메타에서 가져옴

### C. 원본 헤더 / 출처 배지 노출 (Defect 패턴 차용)
- 컬럼 헤더에 `source_origin` 배지 (small chip: "System" / "Derived") 추가 — `getSourceOrigin` 사용
- 호버 시 `original_header` 툴팁 노출 (Header Mapping에서 매핑된 원본 Excel 헤더가 무엇인지 사용자에게 알림)

### D. 검색/필터 분류를 레지스트리에서 파생
- `MULTI_SELECT_FIELDS`, `TEXT_SEARCH_FIELDS` 를 `PUNCH_FIELDS` 의 `dataType` / `group` 메타로 계산 (`enum`, `select-like text` → multi-select, 그 외 텍스트형 → text-search)
- Dynamic config-only 필드(payload_*)도 자동으로 텍스트 검색 대상 포함

### E. (선택) Field Config Realtime 동기화
- Defect와 동일하게 `usePunchFieldConfig` 가 `punch_field_config` 테이블 Realtime 채널 구독 → Admin 편집 시 모든 사용자 화면 즉시 갱신
- 비용이 크면 후속 작업으로 분리 가능

## 손대지 않는 영역
- `punch_field_config` 스키마 — 이미 Defect와 동일 구조, 마이그레이션 불필요
- `import_header_mappings` 및 `punch-excel-utils.ts` 의 `resolveHeader` — 이미 Header Mapping 1순위 적용
- `PunchColumnSelect.tsx` Import 다이얼로그 — 이미 Field Config 사용 중
- Admin 의 `FieldConfigTab` / `HeaderMappingsTab` — 이미 Punch 지원

## 영향 받는 파일

```text
src/pages/PunchRawDataPage.tsx     (큰 리팩토링: columnVisibility/Order, bulk/export 파생, 헤더 배지)
src/lib/punch-field-registry.ts    (group 메타 보강 필요 시 보강)
src/hooks/usePunchFieldConfig.ts   (E 진행 시 realtime 구독 추가)
```

## 검증 방법

1. Admin → Field Config (Punch) 에서 임의 컬럼 `is_enabled=false` 설정 → Raw Data 새로고침 시 해당 컬럼 숨김 확인 (sort_order 변경도 즉시 반영 확인 — E 적용 시)
2. Admin → Header Mappings (Punch) 에 신규 alias 추가 → 동일 파일 재임포트 시 해당 헤더가 매핑되어 raw_payload 가 아닌 컬럼으로 들어오는지 확인
3. Bulk-edit / Export 다이얼로그의 컬럼 목록이 Field Config 의 `display_name`, `is_enabled`, `sort_order` 를 따르는지 확인
4. 빌드 통과 (`tsc --noEmit`)

승인하시면 A → B → C → D 순으로 한 번에 작업하고, E(Realtime)는 별도 작업으로 분리할지 함께 진행할지 알려주세요.
