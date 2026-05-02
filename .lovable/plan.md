# Raw Data Bulk Actions — 기능 확장 + UI 리디자인

## 배경
T&C(`SubtestList`) · Defect(`DefectRawDataPage`) 두 raw data 화면에서 행을 선택하면 현재 **일괄 필드값 변경**만 활성화됩니다. 여기에 **Duplicate / Delete (Soft & Hard) / Reassign / Export Selected / Copy as TSV**를 추가하고, UI를 더 직관적·세련되게 다시 짭니다. 권한은 기존 RLS 함수(`get_subtest_edit_scope`, `get_defect_edit_scope`, `is_admin_or_superuser`)와 그대로 연동됩니다.

---

## 1. UI / 디자인 방향

### 컨셉 — "Command Bar"
화면 상단에 통합 액션 패널 한 줄. 좌측은 **선택 컨텍스트(상태 pill)**, 우측은 **실행 버튼군**. 차분한 네이비 primary와 정확한 정렬, soft shadow 한 겹으로 신뢰감 있는 운영 도구 톤을 유지 (메모리: Inter, professional internal ops style).

### 새 BulkActionBar 레이아웃

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ │ ●  23 selected · Editable 18 · Skipped 5    [Field ▼] [Value] [ Apply ]            │
│ │ T&C · 2 projects                            ─────────────────────────────────────── │
│ │                                             [Duplicate] [Reassign] [Export ▾] [⋯] [×]│
└──────────────────────────────────────────────────────────────────────────────────────┘
   ↑ 좌측 2px primary 액센트 라인
```

- 컨테이너: `bg-card border border-border rounded-lg shadow-sm px-4 py-2.5`, 좌측에 `border-l-2 border-l-primary` 액센트 → sticky bar라는 신호를 시각적으로만.
- 좌측 status pill: primary 닷 + `N selected` (semibold) → muted 구분점 → `Editable M / Skipped K`. Skipped > 0이면 hover 시 사유 툴팁(권한/비활성).
- 1행 = 가장 자주 쓰는 **Bulk Edit** (Field / Value / Apply) — 기존 흐름 유지.
- 2행 = 보조 액션. 위험도 낮은 것부터 좌→우, 파괴적 액션은 `⋯ More` 드롭다운에 격리.
- `× Clear` ghost 버튼은 끝.
- 모바일(현재 430px): 두 줄이 자연스럽게 wrap, 보조 액션은 가로 스크롤 chip 그룹.

### `⋯ More` 드롭다운 (시각적 그룹핑)
```
Copy as TSV
─────────────────────
Delete (soft)            ⌫    ← warning tone
Delete permanently…      ⛔   ← destructive, admin only (없으면 disabled + tooltip)
```

### 액션 다이얼로그 공통 구조 — 4단
모든 액션 다이얼로그를 동일 패턴으로 통일: **Summary card → Options → Preview → Footer**.

```
┌─ Dialog ─────────────────────────────────────┐
│ ┌─ Summary card (bg-muted/30 rounded) ────┐ │
│ │ 23 rows · Editable 18 · Skipped 5        │ │
│ └──────────────────────────────────────────┘ │
│ Options                                       │
│  □ ...                                        │
│ Preview (first 5 of 23)                       │
│  ┌──────────────────────────────────────────┐│
│  │ Item No │ Before → After                 ││
│  └──────────────────────────────────────────┘│
│ [Cancel]                       [Apply ↵]     │
└──────────────────────────────────────────────┘
```

### 액션별 디테일

- **Duplicate** — 헤더 아이콘 `Copy` (primary). Summary에 "→ N new rows will be created" 강조. Options checkbox:
  - ☑ Reset actual dates (T1/T2/Pred or actual_*)
  - ☑ Reset progress / status to initial
  - ☐ Clear comments link
  - 다이얼로그 닫지 않고 footer 우측 primary `Duplicate N rows`.

- **Reassign** — 4개 필드(Subcontractor / SubSub / HDEC PIC / Team)를 카드 안에 grid. 각 필드 옆에 `[—] [Set] [Clear]` segmented control → "변경 없음 / 새 값 / 빈 값" 의도를 명시. master 옵션 `Suggest-field` 자동완성. 1개 이상 Set일 때만 footer 활성.

- **Soft Delete** — *반드시 확인 다이얼로그 한 단계 거침*.
  - 헤더 아이콘 `Archive` (warning amber tone, 회색 톤 지양).
  - Summary: "23 rows will be hidden from raw data and reports."
  - Body: "These rows can be restored later by an administrator." 안내 + Skipped 카운트.
  - Preview: 첫 5행의 Item No / 상태 표시.
  - Footer: `[Cancel]` + `[Hide N rows]` (warning 색 — `FinalConfirmDialog`의 `confirmVariant="warning"` amber 스타일과 동일 톤).
  - 더블 확인 입력은 없음. 단순 Cancel/Confirm 한 번.

- **Hard Delete** — admin/superuser 전용. 더 강한 확인.
  - 다이얼로그 좌측 border `border-l-4 border-l-destructive`.
  - Cascade impact 표 (dry-run RPC 결과):
    ```
    Subtests              23
    Comments               5
    Change logs           12
    Schedule audit        31
    ```
  - `Type "DELETE" to confirm` Input → 정확 일치해야 버튼 활성.
  - Footer 우측 `variant="destructive"` `Delete permanently`.

- **Export selected** — 즉시 실행, 다이얼로그 없음. 버튼 내 `Loader2` 스피너 + "Preparing…". 완료 토스트 액션 "Open file".

- **Copy as TSV** — 즉시 클립보드 복사. 버튼 잠깐 success-tint 후 원복 + "Copied 23 rows × 14 columns" 토스트.

### 결과 토스트 — 통일된 형식
```
Soft delete complete
✓ 18 hidden    ⊘ 5 skipped (no permission)
```

---

## 2. 권한 모델

| 액션         | 허용 조건                                                                 |
|-------------|--------------------------------------------------------------------------|
| Duplicate   | 원본 행에 대해 `get_*_edit_scope ∈ {assigned, team, full}`               |
| Reassign    | 기존 RLS UPDATE 정책 (admin/superuser, senior_user team 일치 등)         |
| Soft Delete | 기존 RLS DELETE 정책과 동일 조건 — 단 동작은 `is_active=false` UPDATE    |
| Hard Delete | `is_admin_or_superuser` 만 — DB 함수 안에서 명시적 체크                  |
| Export/Copy | 화면에 보이는(=읽기 권한) 모든 행                                         |

선택 즉시 `getEditableScopeMap()`을 1회 호출 → 좌측 pill의 **Editable / Skipped** 카운터로 사전 노출.

---

## 3. 기술 변경

### 마이그레이션 1건 (DB 함수 4개)
```sql
-- T&C
preview_delete_subtests_cascade(_ids uuid[]) RETURNS jsonb   -- 자식 카운트만
delete_subtests_cascade(_ids uuid[], _hard boolean)
  -- _hard=false: is_active=false UPDATE (기존 DELETE RLS와 동일 조건의 UPDATE 정책 추가)
  -- _hard=true : is_admin_or_superuser 체크 후
  --   subtest_comment_reads → subtest_comments → subtest_change_log
  --   → schedule_change_audit → subtests 순 DELETE
-- Defect (대칭 구조)
preview_delete_defects_cascade(_ids uuid[]) RETURNS jsonb
delete_defects_cascade(_ids uuid[], _hard boolean)
  -- 자식: defect_comment_reads, defect_comments, defect_change_log,
  --       defect_schedule_change_audit, defect_daily_snapshots, sc_no_history
```
모두 `SECURITY DEFINER`, `search_path=public`, 결과를 `jsonb`로 반환 (succeeded/skipped/cascade counts).

### 신규 파일
- `src/lib/bulk-actions.ts` — `getEditableScopeMap`, `applyBulkDuplicate`, `previewBulkDelete`, `applyBulkDelete`, `applyBulkReassign`, `exportSelectedToXlsx`, `copyRowsAsTsv`
- `src/components/raw-data/BulkActionBar.tsx` — 새 통합 액션 바 (기존 `BulkEditBar` UI 흡수)
- `src/components/raw-data/dialogs/BulkDuplicateDialog.tsx`
- `src/components/raw-data/dialogs/BulkReassignDialog.tsx`
- `src/components/raw-data/dialogs/BulkDeleteDialog.tsx` — `mode: 'soft' | 'hard'` prop으로 분기

### 수정 파일
- `src/pages/SubtestList.tsx` — `<BulkEditBar … />` 호출부를 `<BulkActionBar entity="subtest" … />`로 교체, 핸들러 추가 (캐시 invalidate / selection clear)
- `src/pages/DefectRawDataPage.tsx` — 동일
- `src/components/raw-data/BulkEditBar.tsx` — 내부에서 `BulkActionBar`로 위임하는 얇은 호환 래퍼 유지 (다른 import 회귀 방지)

### Duplicate 규칙 (확정)
- T&C: `(test_id, item_no, mos_code)` 그룹별 `max(mos_sequence)+1`, `subtest_id` 텍스트 재구성
- Defect: 동일 그룹 내 `max(issue_no)+1`
- 기본값: actual 날짜·진행률·상태 **초기화 ON** (체크박스로 해제 가능)

---

## 4. 검증 시나리오
1. 4개 역할(subcontractor / hdec / senior / superuser)로 각 액션 시도 → Editable/Skipped 카운트와 실제 결과 일치
2. Duplicate 후 `(test_id,item_no,mos_code,mos_sequence)` 유일성 확인
3. Soft delete된 행이 raw data·집계·대시보드에서 제외되는지 확인
4. Hard delete 후 `LEFT JOIN subtests`로 고아 audit 0건 확인
5. Export selected의 컬럼 순서 = 화면 visible columns 순서
6. **모든 삭제(Soft 포함)는 다이얼로그 한 단계 거친 뒤에만 실행**

---

## 영향 범위
- 마이그레이션 1건 (DB 함수 4개 + UPDATE RLS 정책 2개)
- 신규 파일 5개, 수정 파일 3개
- 기존 Bulk Edit UX/시그니처 유지 → 회귀 위험 낮음

준비 완료되면 바로 구현 들어갑니다.
