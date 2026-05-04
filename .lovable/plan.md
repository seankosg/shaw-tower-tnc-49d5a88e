## 시스템 필드 Hide/Unhide 기능

### 동작
- 그룹 헤더(시스템 필드명) 옆에 **Hide field** 버튼 추가
- 클릭 시 AlertDialog로 확인:
  - "이 시스템 필드를 숨기면 해당 필드의 모든 alias가 비활성화되고, Raw Data / List / Detail UI에서도 컬럼이 숨겨집니다. 진행하시겠습니까?"
- 확인 시 두 작업을 동시에 수행:
  1. `import_header_mappings.is_active = false` (해당 module/sub_module의 모든 alias)
  2. 대응 `*_field_config.is_enabled = false` (`field_name = target`)
- 둘 중 하나라도 실패하면 toast로 실패 메시지 표시

### Unhide
- 툴바에 **Show hidden fields** 체크박스 추가
- 숨겨진 필드는 회색 + `hidden` 뱃지로 표시되고, 그룹 헤더에 **Unhide field** 버튼
- 클릭 시 `*_field_config.is_enabled = true`로 복구
- alias의 `is_active`는 사용자가 원하는 항목만 개별 토글로 다시 켜도록 자동 복구하지 않음 (안전한 기본값)

### 모듈별 대응 테이블
| Header Mappings 컨텍스트 | Field Config 테이블 |
|---|---|
| `tnc` | `field_config` |
| `defect` | `defect_field_config` |
| `docs / as_built` | `docs_field_config` (field_name 기준) |
| `docs / warranty` | `docs_field_config` (field_name 기준) |

`docs_field_config`는 sub_module 컬럼이 없어 as_built/warranty 양쪽이 동일 테이블을 공유합니다 (필드명이 겹치지 않으므로 안전).

### Hidden 상태 fetch
- `HeaderMappingsTab` 내부에 컨텍스트별로 해당 `*_field_config` 테이블에서 `field_name, is_enabled` 조회
- 결과를 `Set<string>` (hiddenFields)로 변환해 섹션 렌더링 시 사용
- Hide/Unhide 후 refetch

### 표시 규칙
- 기본: hidden 필드는 그룹 자체를 목록에서 제외
- "Show hidden fields" ON: hidden 그룹도 표시하되 회색 처리 + `hidden` 뱃지 + Unhide 버튼
- 검색은 hidden 필드도 항상 매칭 (사용자가 찾을 수 있도록)

### 안전 장치
- `subtest_id`(tnc), `id`(defect), `document_no`(docs) 등 항상 보여야 할 필수 필드는 Hide 버튼 비활성화 + tooltip "Required field cannot be hidden"
  - 코드의 `ALWAYS_VISIBLE_FIELDS` 셋 (tnc는 `useFieldConfig.ts`에 이미 정의됨)을 참조

### 변경 파일
- `src/pages/admin/HeaderMappingsTab.tsx` — 신규 hooks (hidden state fetch), Hide/Unhide 핸들러, 그룹 헤더 버튼 + AlertDialog, "Show hidden fields" 토글, hidden 뱃지/회색 처리

### 변경하지 않는 것
- DB 스키마 (모든 작업은 기존 컬럼 사용)
- 하드코딩된 `TNC_FIELDS` / `DEFECT_FIELDS` / `DOCS_*_FIELDS` 화이트리스트 — 파서/익스포트 동작 유지를 위해 그대로 둠
- `is_system=true` 행의 하드 삭제 (RLS 차단됨, 대신 is_active=false로 비활성화)
- `useFieldConfig` / `useDefectFieldConfig` / `useDocsFieldConfig` 훅 — useState 기반이므로 페이지 재방문/새로고침 시 자동 반영
