# Docs Import Log — Rollback 기능 검토

## 결론 요약

**현재 Docs 영역의 Import Log에는 Rollback(되돌리기) 기능이 존재하지 않습니다.** 삭제(`Delete batch`)만 있고, 이것은 batch / row logs / change logs만 지우고 실제 데이터(docs_omm, docs_as_built, docs_warranty, docs_spare_part 행)는 그대로 둡니다. 즉 잘못된 import를 한 번에 되돌릴 방법이 UI에는 없습니다.

## 현황 분석

### Rollback 기능이 있는 모듈
| 모듈 | UI | Preview RPC | Rollback RPC |
|---|---|---|---|
| T&C | RollbackDialog | `preview_rollback_upload_batch` | `rollback_upload_batch` |
| Defect | RollbackDialog | `preview_rollback_defect_import_batch` | `rollback_defect_import_batch` |
| Punch | RollbackDialog | `preview_rollback_punch_import_batch` | `rollback_punch_import_batch` |

### Rollback 기능이 없는 모듈 → **Docs 전체**
- **ABD (as_built)**, **OMM**, **Warranty**, **Spare Part** — 4개 sub-module 모두 미지원
- `src/components/import/RollbackDialog.tsx`의 `RollbackKind`도 `'tnc' | 'defect' | 'punch'`로 한정
- `src/pages/docs/DocsImportLogsPage.tsx`는 RollbackDialog를 임포트도 하지 않음 (Delete 버튼만 노출, 라인 313–339)
- DB에도 `rollback_docs_*` / `preview_rollback_docs_*` 함수 없음

### 현재 Delete의 한계
- `delete_docs_import_batch(_batch_id)`는 로그 정리용
- 잘못된 import로 인해 **수정된 필드값과 새로 삽입된 행은 그대로 남음**
- 사용자가 원복하려면 직접 raw data에서 행을 찾아 수정/비활성화해야 함

### 기술적 사전조건은 이미 갖춰져 있음
- `docs_change_log`는 `excel_import` 소스로 `(record_id, changed_field, old_value, new_value, upload_id, sub_module, changed_at)`을 모두 기록 중 (43만+ row 누적)
- 4개 docs 테이블 모두 `source_upload_id`, `is_active`, `row_version` 컬럼 보유 → T&C와 동일 패턴의 soft-delete + 필드 복원 가능
- 즉 **T&C의 `rollback_upload_batch` 로직을 Docs 4테이블에 그대로 이식 가능**

## 위험 요소 (구현 시 고려)

1. **OMM resubmission 자동생성**
   - `docs_omm_after_update_resubmit` 트리거가 `Draft/Final response_status`를 B/C로 변경 시 `parent_id`로 연결된 자식 행을 INSERT
   - 현재 데이터엔 사례 없음(0건)이지만 향후 발생 가능
   - 롤백 시 자식 행도 함께 비활성화 또는 child의 `source_upload_id`까지 추적 필요

2. **Warranty 다른 sub-module 의존성**
   - `subcontractor_information_master` 동기화, threaded discussion records가 import로 생성 → 이건 부수효과이므로 롤백 범위에서 제외하거나 별도 처리 명시 필요

3. **Spare Part 부모/자식 행**
   - `(category, parent, child)` 계층 구조 — child 행만 source_upload_id가 잡혀 있는지, parent도 갱신되는지 확인 필요

4. **권한**
   - 기존 함수는 `is_admin_or_superuser` 가드 → 동일 적용
   - DocsImportLogsPage의 `canDelete`도 `isAdminOrSuperuser || DEV` → Rollback에도 같은 가드 사용

5. **bulk_edit / app_direct_input 충돌**
   - 동일 필드를 import 이후 사람이 수정했을 때 → 기존 패턴대로 conflict 카운트로 노출, `_force=true`로만 덮어쓰기

## 권고안

다음 두 단계로 분리해 진행:

### Phase A: 검토 결과만 회신 (지금 메시지)
- 위 결론을 사용자에게 보고
- 어느 sub-module부터 적용할지(OMM 우선? 4개 동시?) / Warranty 부수효과 처리 방침을 확인

### Phase B: Rollback 추가 구현 (승인 시 별도 plan)
1. **DB 마이그레이션** — sub-module별 RPC 한 쌍씩 추가
   - `preview_rollback_docs_import_batch(_batch_id uuid)` → `{insert_count, update_count, conflict_count}`
   - `rollback_docs_import_batch(_batch_id uuid, _force boolean default false)` → `{restored_count, deleted_count, skipped_count}`
   - 내부에서 `docs_upload_batches.sub_module`을 읽어 `docs_omm / docs_as_built / docs_warranty / docs_spare_part` 중 해당 테이블만 처리 (단일 함수로 다중 테이블 분기)
   - OMM은 추가로 `parent_id IS NOT NULL AND source_upload_id = _batch_id`인 자식 행도 함께 비활성화
   - 처리 후 `docs_upload_batches.status = 'rolled_back'` 마킹

2. **프론트 변경**
   - `RollbackDialog.tsx`의 `RollbackKind`에 `'docs'` 추가 + 함수 매핑 등록
   - `DocsImportLogsPage.tsx` 액션 셀에 `<RollbackDialog kind="docs" batchId={b.id} fileName={b.uploaded_file_name} onDone={fetchBatches}/>` 추가
   - status 컬럼에 `rolled_back` 색상 추가

3. **검증 데이터**
   - 검증용 OMM 샘플 batch로 preview → rollback → 재import 흐름 테스트

---

**이번 메시지는 검토 결과 보고입니다.** Phase B로 진행해도 되는지, 우선 적용할 sub-module 범위를 알려주시면 그에 맞춰 구현 plan을 새로 작성하겠습니다.
