## Field Config ↔ Header Mappings 연동

### 배경
현재 두 화면은 독립적입니다.
- **Field Config 탭** (`AdminPage.tsx` → `FieldConfigTable`): `field_config` / `defect_field_config` / `docs_field_config`의 `is_enabled` 토글
- **Header Mappings 탭**: `import_header_mappings`의 alias별 `is_active` 토글 (직전 작업으로 그룹 단위 Hide 시에만 양쪽 동기화)

이번 변경은 **Field Config 탭의 Visible 토글**에서도 동일한 연동이 일어나도록 보강합니다.

### 동작 (Field Config 탭)
**Visible OFF로 토글할 때**
1. AlertDialog 확인:
   > "이 필드를 비활성화하면 Raw Data / List / Detail UI에서 컬럼이 숨겨지고, 동시에 Header Mappings에서 이 필드로 연결된 모든 alias도 비활성화되어 향후 import 시 무시됩니다. 진행하시겠습니까?"
2. 확인 시 두 작업을 함께 실행:
   - `*_field_config.is_enabled = false` (현재 행)
   - `import_header_mappings.is_active = false` (해당 module/sub_module + `target_field = field_name`)
3. 둘 중 하나라도 실패하면 toast로 실패 안내, UI는 새로고침
4. 성공 시 `header_mappings_version` 값을 +1 (parser 캐시 즉시 반영)

**Visible ON으로 토글할 때**
- `*_field_config.is_enabled = true`만 갱신 (확인 다이얼로그 없음)
- alias의 `is_active`는 자동 복구하지 않음 — 사용자가 Header Mappings 탭에서 필요한 alias만 다시 켜도록 안전 기본값 유지
- 토스트에 "Aliases were not auto-enabled. Re-enable them in Header Mappings if needed." 안내 추가

### 모듈 매핑
| field_config 테이블 | Header Mappings module | sub_module 필터 |
|---|---|---|
| `field_config` | `tnc` | (null/빈값) |
| `defect_field_config` | `defect` | (null/빈값) |
| `docs_field_config` | `docs` | **필터 없음** (as_built/warranty 양쪽 alias 모두 비활성화) |

`docs_field_config`는 sub_module이 없고 필드명이 두 sub_module 간에 의미가 동일하므로 양쪽 모두 끄는 것이 일관됩니다.

### Field Config 탭에 추가되는 시각 표시
- 행 끝에 **alias 개수 뱃지** (예: `3 aliases`) — 끄기 전에 영향 범위를 사용자에게 알림
- 뱃지 클릭 시 Header Mappings 탭으로 이동 (선택 사항, 같은 페이지의 다른 탭이므로 단순 안내 텍스트로 대체)

### 변경 파일
- `src/pages/AdminPage.tsx`
  - `FieldConfigTable`에 `table` → module 매핑 헬퍼 추가
  - alias 개수 fetch (`import_header_mappings` count by `target_field`) 추가
  - `toggle` 함수에서 `is_enabled`를 끌 때 AlertDialog + alias 일괄 비활성화 + version bump 처리
  - 끌 때 영향 범위 안내 뱃지 표시

### 변경하지 않는 것
- DB 스키마
- Header Mappings 탭의 기존 동작 (그룹 단위 Hide는 그대로 유지, 동일한 패턴을 Field Config 쪽에 적용)
- Visible ON 시 alias 자동 복구 (의도적으로 안전 기본값)
- `is_required` 토글 (영향 없음, 기존 동작 유지)

### 안전 장치
- `subtest_id`, `issue_no`, `document_no` 등 anchor 필드는 hook에서 항상 visible로 처리되므로 토글되더라도 UI에는 계속 노출됨 (기존 동작)
- alias가 0개인 필드는 확인 다이얼로그 없이 바로 토글 (불필요한 마찰 제거)
