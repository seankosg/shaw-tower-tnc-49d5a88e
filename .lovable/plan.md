

# 다중 파일 Import + 백그라운드 진행 + 일괄 삭제

## 1. 다중 파일 Import (`src/pages/ImportPage.tsx`)

- `<input type="file" multiple>` + drag-drop 다중 허용
- 선택된 파일 목록 카드 표시 (파일명, 크기, 파싱된 행 수, 상태: pending/processing/done/failed)
- "Execute Import (N files)" 버튼으로 큐 순차 처리
- 파일별 결과 누적 후 총합 표시

## 2. 백그라운드 진행 — Global Import Context

탭 이동해도 import가 계속 돌아가도록 import 상태/실행 로직을 페이지 컴포넌트 밖으로 끌어올림.

**신규**: `src/contexts/ImportContext.tsx`
- 큐 상태(파일 리스트, 현재 인덱스, 진행률, 결과) 보관
- `startImport(files, importType)` — 백그라운드 비동기 루프 (현재 `executeImport` 로직을 그대로 이전)
- `App.tsx`에서 `AuthProvider` 안에 `ImportProvider`로 감싸기
- AppLayout 상단 또는 sidebar 하단에 작은 진행 인디케이터 (예: "Importing file.xlsx · 45%")
- ImportPage는 이 context를 구독하여 UI 표시 (현재 로컬 state 대신)

**기술 메모**: 단순 setInterval/promise 루프이므로 React state만 context로 옮기면 페이지 unmount되어도 계속 동작.

## 3. Admin 일괄 삭제 (`src/pages/ImportLogsPage.tsx`)

- 각 batch row에 휴지통 아이콘 (Admin/Superuser만, 개발모드 포함)
- 클릭 시 AlertDialog 확인 → 다음 순서 삭제:
  1. `subtests` where `source_upload_id = batch.id`
  2. `upload_row_logs` where `upload_id = batch.id`
  3. `upload_batches` where `id = batch.id`
- RLS 확인: `subtests` DELETE는 `is_admin_or_superuser` 만 허용 / `upload_row_logs`, `upload_batches`에는 현재 DELETE policy 없음
- **DB 마이그레이션 필요**: `upload_row_logs`와 `upload_batches`에 admin DELETE policy 추가
  ```sql
  CREATE POLICY "Admins can delete upload logs" ON upload_row_logs
    FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));
  CREATE POLICY "Admins can delete upload batches" ON upload_batches
    FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));
  ```
- 삭제 후 toast + batch 목록 refetch

## 변경 파일

| 파일 | 변경 |
|------|------|
| `src/contexts/ImportContext.tsx` | **신규** — 백그라운드 import 큐/상태 |
| `src/App.tsx` | `ImportProvider` 추가 |
| `src/components/layout/AppLayout.tsx` | 글로벌 import 진행 인디케이터 |
| `src/pages/ImportPage.tsx` | 다중 파일 UI, context 사용 |
| `src/pages/ImportLogsPage.tsx` | Admin 삭제 버튼 + 확인 다이얼로그 |
| DB migration | upload_row_logs, upload_batches DELETE policy 추가 |

