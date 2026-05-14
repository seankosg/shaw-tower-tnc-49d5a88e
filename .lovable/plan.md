## 목표

Docs의 4개 Raw Data 화면(ABD, OMM, Warranty, Spare Part)에서 **개별 행을 삭제**할 수 있도록 합니다. 삭제된 행은 어떤 대시보드/통계/Export/상세 보기에도 다시 나타나지 않습니다.

## 접근 방식: 소프트 삭제

물리 삭제 대신 `is_active = false`로 표시합니다. 4개 테이블 모두 이미 `is_active boolean default true` 컬럼이 있고, RLS도 권한 검사를 갖추고 있어 별도 마이그레이션 없이 가능합니다.

소프트 삭제로 가는 이유:
- import 워커가 `document_no` / `sn` / `item_no`로 upsert를 하기 때문에 물리 삭제 후 재업로드 시 ID가 달라져 추적이 끊어집니다. 소프트 삭제는 동일 키 재업로드 시 부활(reactivate) 처리할 수 있습니다.
- comments, change_log 등 외부 참조가 안전합니다.

## 변경 사항

### 1. Raw Data 페이지에 삭제 액션 (4개 페이지)

대상:
- `src/pages/docs/DocsRawDataPage.tsx` (ABD, `docs_drawings`)
- `src/pages/docs/DocsOMMRawDataPage.tsx` (`docs_omm`)
- `src/pages/docs/DocsWarrantyRawDataPage.tsx` (`warranty_items`)
- `src/pages/docs/DocsSparePartRawDataPage.tsx` (`docs_spare_part`)

각 행의 액션 영역에 **Trash 아이콘 버튼**을 추가합니다.
- 클릭 시 `AlertDialog`로 확인 ("Delete this row? This will hide it from all dashboards, exports, and reports. The row can be restored only by an admin.")
- 확인 시 `update({ is_active: false, updated_by: user.id })` 실행
- 성공 시 toast + 행을 즉시 목록에서 제거 (낙관적 업데이트)
- 실패 시 toast 에러

권한:
- 기존 RLS의 UPDATE 권한과 동일하게 `admin / superuser / senior_user / user`는 전체 가능, `d_superuser`는 본인 팀 행만 가능
- 클라이언트에서도 `useAuth`의 roles로 버튼 표시/비표시 (권한 없는 사용자는 버튼 숨김)

bulk 삭제는 이번 작업에서 제외 (필요 시 후속). 한 번에 한 행만 삭제.

### 2. 모든 읽기 경로에 `is_active = true` 필터 보장 — 감사 및 보강

이미 다음 경로는 `is_active=true` 필터가 있음:
- 4개 Raw Data 페이지 본문 쿼리
- `src/lib/docs-dashboard-data.ts` (Docs Dashboard)

확인/보강 필요:
- `src/lib/docs-executive-dashboard-data.ts` — `docs_drawings`, `docs_omm`, `warranty_items` 3개 쿼리
- `src/pages/docs/DocsExportPage.tsx` — Export 쿼리 (XLSX 내보내기에서 삭제 행이 빠져야 함)
- `src/lib/bulk-edit.ts`, `src/lib/bulk-actions.ts`, `src/lib/omm-bulk-actions.ts`, `src/lib/warranty-bulk-actions.ts` — 일괄편집 대상
- `src/pages/docs/DocsAbdDetailPage.tsx`, `DocsOMMDetailPage.tsx`, `DocsWarrantyDetailPage.tsx`, `DocsSparePartDetailPage.tsx`, `DocsDrawingDetailPage.tsx` — 직접 ID 조회 시 `.eq('is_active', true)` 추가하여 삭제된 행은 404 처리
- import 워커(`docs-import-workers.ts`, `WarrantyImportContext.tsx`)의 중복 검사 쿼리 — 여기는 **`is_active` 필터를 걸지 않음**(중복키 부활 위해 일부러). upsert 시 매칭되면 `is_active = true`로 자동 복구.

### 3. 상세 페이지 직접 진입 차단

소프트 삭제된 행의 상세 URL(예: `/docs/omm/<id>`)로 접근 시 "This record has been deleted" 메시지 + 목록으로 돌아가기 버튼 노출.

### 4. (참고) "숨기기" 기능 검토

코드베이스에는 `is_active=false` 토글 외에 별도 'Hide row' UI가 없습니다. 사용자가 언급한 "숨기기"는 아마 댓글 필터의 'Hide resubmissions' 또는 통계에서 사라지지 않는 과거 동작을 가리키는 것으로 보입니다. 위 2번 감사로 모든 통계/Export/대시보드에서 누락 없이 제외되도록 합니다.

## 작업 파일 요약

수정:
- `src/pages/docs/DocsRawDataPage.tsx` — 행 삭제 버튼 + handler
- `src/pages/docs/DocsOMMRawDataPage.tsx` — 행 삭제 버튼 + handler
- `src/pages/docs/DocsWarrantyRawDataPage.tsx` — 행 삭제 버튼 + handler
- `src/pages/docs/DocsSparePartRawDataPage.tsx` — 행 삭제 버튼 + handler
- `src/lib/docs-executive-dashboard-data.ts` — `is_active=true` 필터 추가/검증
- `src/pages/docs/DocsExportPage.tsx` — 같은 필터
- 4개 상세 페이지 — 진입 시 deleted 처리 + 직접 fetch에 `is_active` 필터 추가
- (선택) 새 헬퍼 `src/lib/docs-soft-delete.ts` — `softDeleteDocsRow(table, id, userId)` 단일 함수로 4개 페이지가 공유

마이그레이션: 없음 (스키마 그대로 활용).

## 사용자 확인 요청

1. **소프트 삭제 방식**으로 진행해도 될까요? (위 사유로 권장)
2. 삭제 가능 권한을 **현재 UPDATE 권한과 동일** (admin/superuser/senior/user/본인팀 d_superuser)하게 해도 될까요? 아니면 더 좁혀(예: admin/superuser만) 갈까요?
3. 삭제된 행을 **복구하는 UI**(Admin 화면의 "Deleted records" 탭)는 이번 범위에 포함할까요, 아니면 후속 작업으로 미룰까요?
