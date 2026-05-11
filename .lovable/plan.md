## 검토 요약

T&C / Defect / Docs(ABD·OMM·Warranty·SparePart) 3개 계열의 Field Config가 **Visible Roles / Editable Roles**를 동일한 로직으로 적용하고 있는지 점검한 결과, **DB 스키마와 Admin UI는 거의 일관되지만, 런타임 적용(훅·페이지) 단계에서 모듈마다 차이가 큽니다.**

### 1. DB 스키마 (`*_field_config` 테이블)

| 테이블 | `visible_to_roles` | `editable_to_roles` |
|---|---|---|
| `field_config` (T&C) | ❌ 없음 | ❌ 없음 |
| `defect_field_config` | ✅ | ✅ |
| `docs_field_config` (as_built/omm/warranty/spare_part) | ✅ | ✅ |

→ **T&C만 컬럼 자체가 없음.** Defect/Docs는 동일한 컬럼 셋을 보유.

### 2. Admin UI (`AdminPage.tsx` → `FieldConfigTable`)

- T&C / Defect / ABD / OMM / Warranty / SparePart **모두 동일한 `FieldConfigTable` 컴포넌트를 사용**, `RoleChecks` 위젯으로 visible/editable 토글 노출.
- T&C 탭은 컬럼이 DB에 없으므로 토글이 의미 없음(저장돼도 무시됨).

### 3. 런타임 훅 적용

| 훅 | `is_enabled` 반영 | `visible_to_roles` 반영 | `isFieldEditable` 노출 |
|---|---|---|---|
| `useFieldConfig` (T&C) | ✅ | — (컬럼 없음) | ❌ |
| `useDefectFieldConfig` | ✅ | ❌ **무시됨** | ❌ **미구현** |
| `useDocsFieldConfig` (ABD/OMM/WTY/SP) | ✅ | ❌ **무시됨** | ✅ (단 `editable_to_roles`만, admin은 항상 허용) |

### 4. 페이지 단위 적용

| 모듈 | Detail 화면 `isFieldEditable` | Raw Data 컬럼 visibility |
|---|---|---|
| T&C (Subtest) | — | `is_enabled`만 |
| Defect Detail/RawData | ❌ 사용 안 함 | `is_enabled`만 |
| Docs **OMM** Detail | ✅ 적용 | `is_enabled`만 |
| Docs **Warranty** Detail | ✅ 적용 | `is_enabled`만 |
| Docs **SparePart** Detail | ✅ 적용 | `is_enabled`만 |
| Docs **ABD** (`DocsDrawingDetailPage`) | ❌ 사용 안 함 (`canEdit` 단일 게이트) | — |

### 5. 결론 — 일관성 있음/없음

- ✅ **OMM/Warranty/SparePart Detail의 `editable_to_roles`** 만이 실제로 동작하는 영역입니다. 이 3개는 서로 일관됩니다.
- ❌ **ABD Detail**은 같은 `useDocsFieldConfig`를 쓰지만 `isFieldEditable`을 적용하지 않아 OMM/WTY/SP와 비일관.
- ❌ **`visible_to_roles`** 는 모든 모듈(Defect/Docs 4종)에서 **저장만 되고 적용되지 않음**. Admin에서 토글해도 효과 없음.
- ❌ **Defect**은 컬럼·Admin UI는 있으나 훅이 두 권한을 모두 적용하지 않음.
- ❌ **Raw Data 컬럼 가시성**은 모든 모듈에서 `visible_to_roles`를 무시.

---

## 정합화 제안 (구현 시 진행할 작업)

T&C는 단순 운영 정책(컬럼 미보유) 유지하고, **Defect / Docs(ABD·OMM·WTY·SP)** 를 동일 로직으로 통일:

1. **`useDocsFieldConfig`에 `visible_to_roles` 적용**
   - `isFieldVisible(fieldName, userRoles)` 시그니처 확장, `is_enabled && (visible_to_roles 비어있음 || roles 교집합 || admin)` 규칙.
   - 호출부(OMM/WTY/SP/ABD Detail + 3개 RawData 페이지)에 `roles` 인자 전달.

2. **`useDefectFieldConfig`에 동일 규칙 추가**
   - `isFieldVisible(fieldName, userRoles)` 확장 + `isFieldEditable(fieldName, userRoles)` 신설.
   - `DefectDetailPage` / `DefectRawDataPage`에 `roles` 인자 전달, 편집 가능 필드 게이트 추가.

3. **ABD Detail(`DocsDrawingDetailPage`)에 `isFieldEditable` 적용**
   - 기존 `canEdit` × `isFieldEditable(field, roles)` 합성으로 OMM/WTY/SP와 동일 패턴화.

4. **Admin T&C 탭 정리(선택)**
   - `field_config`는 두 컬럼이 없으므로 T&C 탭에서는 RoleChecks 컬럼을 숨겨 오해 방지.
   - 또는 `field_config`에 동일 컬럼 추가 + `useFieldConfig` 확장으로 완전 통일(범위 큼).

5. **공통 헬퍼 추출(권장)**
   - `src/lib/field-role-gate.ts` 같은 공용 함수 `applyRoleGate(cfg, roles, kind)` 로 3개 훅이 같은 규칙을 공유.

### 비즈니스 영향
- 표시/편집 권한이 실제로 적용되므로, 현재 “저장은 되지만 무시되던” 설정이 **즉시 효력 발생**합니다. 적용 전, 운영중 데이터의 `visible_to_roles` / `editable_to_roles` 값을 점검(대량 NULL이면 영향 없음, 이미 채워진 값이 있다면 사용자 가시성 변동 가능)하는 단계가 선행되어야 합니다.

승인하시면 위 1~3번을 우선 구현(가장 영향이 크고 안전한 범위)하고, 4·5번은 후속 정리로 진행합니다.