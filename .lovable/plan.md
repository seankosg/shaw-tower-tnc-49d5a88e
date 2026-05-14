# Spare Part Field Config 누락 필드 추가

## 원인

Field Config 화면은 `docs_field_config` 테이블을 직접 읽어 행을 보여줍니다. Spare Part는 초기 시드 시 15개 필드만 등록되었고, 이후 parser/worker/DB 컬럼은 확장되었지만 `docs_field_config`에는 추가되지 않아 UI에 노출되지 않습니다.

## 작업

`docs_field_config` 테이블에 누락된 21개 spare_part 필드를 INSERT 마이그레이션으로 추가합니다.

추가할 필드 (sort_order는 기존 값들 사이/뒤에 자연스럽게 배치):

- 식별: `item_no` (sort 5)
- 아이템 사양: `location, floor_level, item_type, specification, size` (sort 41~46, Material 다음)
- 조달/일정: `material_lead_time, planned_confirm_date, actual_confirm_date, direction_to_subcon_date, eta_date, planned_po_date, actual_po_date, po_status, planned_delivery_date, actual_delivery_date` (sort 200~290)
- 담당: `team, trade, subcontractor_name, hdec_eng_name` (sort 115~125, HDEC PIC 주변)

각 행 기본값:
- `is_enabled = true`
- `is_required = false`
- `display_name`: `DOCS_DEFAULT_FIELD_LABELS`의 라벨과 일치 (예: `item_no` → "Item No", `location` → "Location" 등)
- `source_origin = 'system'`
- `visible_to_roles = NULL`, `editable_to_roles = NULL` (전 역할 허용)
- `sub_module = 'spare_part'`

## 결과

Admin → Field Config → Spare Part 탭에 36개 필드가 모두 표시되며, 각 필드별로 enabled/required/visible/editable 정책을 관리자가 직접 조정할 수 있게 됩니다. 기존 15개 필드의 설정값은 변경되지 않습니다.

## 영향 범위

- 코드 변경 없음 (parser, worker, UI 컴포넌트 모두 이미 모든 필드를 처리 중)
- DB만 시드 추가 (1개 마이그레이션, INSERT만)
