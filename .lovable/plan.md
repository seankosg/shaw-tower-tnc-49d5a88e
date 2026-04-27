## 목표
Defect Management 관련 트랜잭션 데이터를 **일괄 비움**. 분류 규칙·fallback·필드 설정은 보존. SC번호 코드 버그는 별도 단계로 미룸.

## 현재 데이터 상태
| 테이블 | 행 수 | 처리 |
|---|---:|---|
| `defect_items` | 2,202 | **TRUNCATE** |
| `defect_daily_snapshots` | 2,202 | **TRUNCATE** |
| `defect_upload_row_logs` | 16,679 | **TRUNCATE** |
| `defect_change_log` | 1,100 | **TRUNCATE** |
| `defect_schedule_change_audit` | 30 | **TRUNCATE** |
| `defect_upload_batches` | 5 | **TRUNCATE** |
| `sc_no_history` | 0 | TRUNCATE (안전상) |
| `defect_comments` | 0 | TRUNCATE (안전상) |
| `defect_comment_reads` | 0 | TRUNCATE (안전상) |
| `defect_classification_rules` | 12 | **유지** |
| `defect_discipline_fallback` | 6 | **유지** |
| `defect_field_config` | 49 | **유지** |
| `subcontractor_master`, `hdec_*_master`, `profiles`, `projects` | — | **유지** (T&C 모듈도 사용) |
| `database_snapshots` | — | **유지** (수동 백업, 사용자 관리 영역) |

## 마이그레이션 내용
단일 마이그레이션 파일로 다음 SQL 실행:

```sql
-- Defect 트랜잭션 데이터 전부 초기화. 설정/마스터/스냅샷 백업은 보존.
TRUNCATE TABLE
  public.defect_change_log,
  public.defect_schedule_change_audit,
  public.defect_daily_snapshots,
  public.defect_upload_row_logs,
  public.sc_no_history,
  public.defect_comment_reads,
  public.defect_comments,
  public.defect_items,
  public.defect_upload_batches
RESTART IDENTITY;
```

- FK가 없으므로 단일 TRUNCATE로 처리 가능.
- `RESTART IDENTITY`는 시퀀스가 없어도 무해.
- 보존 테이블은 명시적으로 제외.

## 실행 후 결과
- Raw Data, Schedule Matrix, Dashboard, Critical Watchlist 모두 빈 상태로 표시됨.
- Import Logs 페이지도 비어있음.
- 분류 규칙(rule/discipline fallback)과 필드 표시 설정은 그대로 동작 → 재import 시 자동 분류·컬럼 표시 정상.
- SC번호 partial unique index도 자연스럽게 비어 충돌 가능성 사라짐.

## ⚠️ 주의사항 (재import 전 알아두실 점)
- **SC번호 중복 코드 버그는 그대로 남아있음**. 재import 시 동일 오류가 다시 날 가능성이 높습니다 (특히 같은 파일을 두 번 올릴 때, 또는 `subcontractor_issue_no`가 Excel에 들어있는 경우).
  - 현 데이터가 비어 있으니 한 번째 import는 통과 가능. 두 번째 import부터 다시 위험.
- Import 전 Defect 모듈을 paused로 돌려놓고 admin 본인만 작업하시는 것을 권장.

## 영향 범위
- 마이그레이션 파일 1개 추가
- 코드 변경 없음
- RLS·Function·Trigger 변경 없음
- 사용자 권한 영향 없음

## 다음 단계 (이번 작업 외)
- SC번호 중복 코드 버그 수정 (`issueKey`/`projectId`/`payload.project_id`/insert 충돌 재시도) — 다음 요청에서 진행.
