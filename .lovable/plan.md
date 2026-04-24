

## Defect Field Config 누락 필드 보충 plan

### 배경

```text
코드에서 사용 중인 Defect 필드: 32개
DB defect_field_config 등록: 22개
→ 11개 필드가 Admin > Defect Field Config 에서 관리 불가 상태
```

### 1. 마이그레이션: 누락 필드 11개 INSERT

```text
defect_field_config 에 아래 row 추가 (모두 is_enabled=true, is_required=false,
visible_to_roles/editable_to_roles 는 기본 ALL_ROLES)

field_name                  | display_name              | sort_order | source_origin
----------------------------+---------------------------+------------+---------------
description                 | Description               | 45         | ll_original
defect_type                 | Defect Type               | 46         | ll_original
priority                    | Priority                  | 47         | ll_original
team                        | Team                      | 55         | system
trade_detail                | Trade Detail              | 65         | ll_original
subcontractor_issue_source  | Subcontractor Issue Source| 82         | hdec_added
area_raw                    | Area (Raw)                | 35         | ll_original
classification_source       | Classification Source     | 142        | system
classified_at               | Classified At             | 144        | system
remarks                     | Remarks                   | 170        | ll_original
hdec_comments               | HDEC Comments             | 180        | hdec_added

(sort_order 는 기존 22개 사이에 자연스럽게 끼우되, 필요 시
 FieldConfigTable 의 위/아래 버튼으로 사용자 재정렬 가능)
```

### 2. 코드 정합성 점검

```text
src/hooks/useDefectFieldConfig.ts
  DEFECT_DEFAULT_FIELD_LABELS 에 누락된 키 보완:
    - area_raw: 'Area (Raw)'
    - classified_at: 'Classified At'
  (나머지는 이미 정의되어 있음)

확인만 하고 변경 불필요한 항목:
  - DefectRawDataPage 컬럼 정의: 이미 위 필드 일부 사용 중
  - DefectExportPage / defect-export-utils: DEFECT_EXPORT_FIELDS 가
    동적 columns 기반이므로 자동 반영
  - DefectDetailPage: 직접 input 매핑이라 영향 없음
```

### 3. 확인 작업

```text
- AdminPage > Defect Field Config 탭에서 32개 모두 노출되는지
- is_enabled 토글, role 체크박스, sort_order 위/아래 이동 정상 동작
- RawData / Export / Dashboard 에서 라벨이 display_name 기반으로 표시되는지
```

### 4. 영향 받는 파일

```text
[신규 마이그레이션]
supabase/migrations/<timestamp>_seed_defect_field_config_missing.sql
  - 11개 row INSERT (ON CONFLICT DO NOTHING by field_name)

[수정]
src/hooks/useDefectFieldConfig.ts
  - DEFECT_DEFAULT_FIELD_LABELS 에 area_raw / classified_at 라벨 보완
```

### 5. 검증 항목

```text
1. AdminPage > Defect Management > Field Config 탭에 32개 row 표시
2. description / priority / remarks / hdec_comments 등 기존에 안 보이던
   필드의 display_name·is_enabled·role 설정 가능
3. is_enabled=false 로 설정 시 RawData 컬럼에서 즉시 숨김
4. Export 'all' / 'visible' 모드에서 신규 필드 컬럼 포함
5. 기존 22개 row의 sort_order/설정값은 보존 (ON CONFLICT DO NOTHING)
6. build + vitest 통과
```

