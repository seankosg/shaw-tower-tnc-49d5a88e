
## 구현 계획: Defect View Import Log를 T&C Import Log와 동일한 UI/기능으로 개편

`Defect Management > Import > View Import Logs` 화면을 현재 T&C Management의 Import Log 화면 구조와 동일하게 맞추겠습니다. UI 문구는 기존 정책대로 영어로 유지합니다.

## 1. Defect Import Logs 화면 구조 변경

현재 Defect Import Logs는 좌우 2-column 구조입니다.

```text
왼쪽: Defect Import Logs
오른쪽: Row Logs
```

이를 T&C Import Logs와 동일한 흐름으로 변경합니다.

```text
목록 화면:
- 상단 Back button
- title: Import History
- import batch table

상세 화면:
- 상단 Back button
- title: Import Row Details
- selected file name card title
- tabs:
  - Row Logs
  - Schedule Changes
```

Back button 동작도 T&C와 동일하게 적용합니다.

```text
상세 화면에서 Back → batch list로 이동
목록 화면에서 Back → /defects/import 로 이동
```

## 2. URL query state 적용

T&C Import Logs처럼 선택 상태를 URL에 반영합니다.

```text
/defects/import/logs?batch={batchId}
/defects/import/logs?batch={batchId}&tab=schedule
```

적용 효과:

```text
- 새로고침해도 선택 batch 유지
- Row Logs / Schedule Changes tab 상태 유지
- 사용자가 특정 import log 상세 URL을 공유 가능
```

## 3. Import History table을 T&C와 동일하게 확장

Defect import batch 목록을 T&C Import History table과 동일한 컬럼 구성으로 표시합니다.

```text
File
Date
Status
Total
Success
Skipped
Rejected
Delete action/admin only
```

Defect에는 `import_type` 컬럼이 없으므로 T&C의 `Type` 컬럼은 제외하거나 `Defect` 고정 표시로 맞추겠습니다. 화면 정합성을 위해 다음 구성을 권장합니다.

```text
File | Type | Date | Status | Total | Success | Skipped | Rejected | Delete
```

`Type` 값은 `Defect`로 표시합니다.

날짜는 앱 공통 기준대로 표시합니다.

```text
dd-MMM-yyyy HH:mm
```

예시:

```text
23-Apr-2026 14:35
```

## 4. Row Logs tab을 T&C 스타일로 변경

Defect row logs도 T&C Row Logs와 동일한 테이블 스타일, badge 색상, empty state, scroll behavior를 적용합니다.

컬럼:

```text
Row
Issue No
Action
Reason
Detail
```

표시 규칙:

```text
action_taken = inserted / updated / skipped / rejected badge 표시
reason_code 없으면 —
reason_detail 없으면 —
team_unresolved 로그도 이 화면에서 확인 가능
```

## 5. Schedule Changes tab 추가

Defect import 중 발생한 `defect_schedule_change_audit` 데이터를 T&C의 Schedule Changes tab과 같은 방식으로 표시합니다.

Defect용 컬럼은 T&C의 Pred/T1/T2 구조 대신 Defect schedule audit 구조에 맞춥니다.

```text
Row
Issue No
Subcon Issue No
Planned: Old date / New date / Diff
Target: Old date / New date / Diff
Closed: Old date / New date / Diff
Progress: Old % / New % / Diff
Closure Status
Source
```

표시 규칙:

```text
- 날짜는 dd-MMM 형식
- diff는 +n / -n 형태
- 지연 방향 diff는 destructive 색상
- 단축 방향 diff는 primary 색상
- progress diff는 % suffix 표시
- schedule change row 클릭 시 /defects/{defect_id} 로 이동
```

## 6. Delete 기능을 T&C와 동일하게 적용

관리자/슈퍼유저 또는 개발 모드에서만 delete icon을 표시합니다.

```text
canDelete = isAdminOrSuperuser || import.meta.env.DEV
```

삭제 확인 dialog도 T&C와 동일한 패턴으로 적용합니다.

Dialog 문구 예시:

```text
Delete import batch?

This will permanently delete [file name], defect items imported from it, schedule change audits, snapshots, and row logs. This action cannot be undone.
```

삭제 대상:

```text
1. defect_daily_snapshots linked to defect_items.source_upload_id = batch.id
2. defect_items where source_upload_id = batch.id
3. defect_schedule_change_audit where upload_id = batch.id
4. defect_upload_row_logs where upload_id = batch.id
5. defect_upload_batches where id = batch.id
```

주의: 현재 Defect import는 update된 기존 defect에도 `source_upload_id`가 갱신됩니다. 따라서 T&C와 동일한 삭제 방식은 해당 batch가 마지막으로 업데이트한 defect item도 삭제 대상이 됩니다. 요청하신 “T&C Import Log 기능과 UI 그대로” 기준에 맞춰 동일하게 적용하되, dialog 문구에서 삭제 범위를 명확히 표시하겠습니다.

## 7. 필요한 DB 권한 보강

현재 Defect upload 관련 table은 select/insert 중심으로 정책이 구성되어 있어, row logs와 schedule audit 삭제가 막힐 수 있습니다.

관리자 삭제 기능을 안정적으로 동작시키기 위해 migration으로 다음 RLS delete policy를 추가합니다.

```text
defect_upload_row_logs:
- Admins can delete defect upload logs

defect_schedule_change_audit:
- Admins can delete defect schedule audit

defect_daily_snapshots:
- Admins can delete defect daily snapshots
```

`defect_upload_batches`와 `defect_items`는 이미 admin delete policy가 있으므로 기존 정책을 사용합니다.

## 8. 코드 변경 대상

```text
src/pages/DefectImportLogsPage.tsx
```

주요 변경:

```text
- T&C ImportLogsPage 구조를 Defect용으로 이식
- useNavigate / useSearchParams 추가
- useAuth / useToast 추가
- AlertDialog delete confirmation 추가
- statusColor / actionColor 재사용
- defect schedule audit 전용 StageCells 또는 DeltaCells 구성
- date formatting utilities 적용
```

DB 권한 보강이 필요한 경우:

```text
supabase/migrations/[new_migration].sql
```

## 9. 검증 항목

```text
1. /defects/import 에서 View Import Logs 클릭 시 새 UI로 이동
2. Defect Import History가 T&C Import History와 동일한 테이블 스타일로 표시됨
3. File row 클릭 시 상세 화면으로 전환됨
4. URL에 batch query가 반영되고 새로고침 후에도 상세가 유지됨
5. Row Logs tab에서 inserted/updated/skipped/rejected badge가 표시됨
6. team_unresolved reason이 Row Logs에서 확인됨
7. Schedule Changes tab에서 planned/target/closed/progress/closure status 변경이 표시됨
8. Schedule Changes row 클릭 시 해당 Defect Detail로 이동함
9. Back button이 상세에서는 목록으로, 목록에서는 /defects/import 로 이동함
10. 관리자/슈퍼유저만 delete button을 볼 수 있음
11. Delete confirm 후 관련 defect import batch/log/audit 데이터가 삭제됨
12. 일반 사용자는 delete 기능이 노출되지 않음
13. 날짜 형식은 dd-MMM 또는 dd-MMM-yyyy 기준을 유지함
14. 모바일/좁은 화면에서는 table이 overflow scroll로 깨지지 않음
```
