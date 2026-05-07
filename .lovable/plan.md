## 현재 자동 백업 시스템 동작 분석

### 동작 방식 (현재 구현)
- **스케줄**: `pg_cron` 작업 `daily-auto-snapshot`
  - `cron schedule: 50 15 * * *` (UTC) → **싱가포르 시간(SGT) 매일 23:50** 1회 실행
- **트리거**: `cron.schedule`가 `net.http_post`로 Edge Function `auto-snapshot` 호출
- **로직** (`supabase/functions/auto-snapshot/index.ts`)
  1. service role로 `subtests` 테이블 전체를 1000행 페이지네이션으로 읽음
  2. JSON 배열로 묶어 `database_snapshots` 테이블에 한 행으로 저장
     - `snapshot_name`: `Auto YYYY-MM-DD 23:50`
     - `snapshot_type`: `auto`
     - `snapshot_data`: 전체 행(jsonb), `row_count`: 행수
- **복원** (`restore-snapshot`): 관리자 인증 후 `subtests` **전체 삭제 → 배치 INSERT**로 되돌림

### 결론: "완벽한 백업"인가? — **아니오**

현재 자동 백업은 **`subtests` 테이블 1개만** 대상으로 하는 부분 스냅샷입니다. 다음은 모두 **백업되지 않습니다**:

#### 백업되지 않는 데이터
- T&C: `tests`, `system_master`, `projects`
- Defect 모듈 전체: `defect_items`, `defect_comments`, `defect_change_log`, `defect_daily_snapshots`, `defect_schedule_change_audit`, `defect_upload_batches`, `defect_upload_row_logs`, 분류/매핑 마스터(`defect_classification_rules`, `defect_classification_alias`, `defect_subcontractor_workscope`, `defect_work_types`, `defect_discipline_fallback`), `defect_field_config`, `defect_comment_reads`
- Docs 모듈 전체: `docs_drawings`, `docs_omm`, `docs_spare_part`, `docs_field_config`, `docs_org_alias`, `docs_upload_batches`, `docs_upload_row_logs`, `docs_change_log`, 그리고 `warranty_*`(threads, comments, items 등)
- 사용자/권한: `profiles`, `user_roles`, `permissions`
- 설정: `app_settings`, `field_config`, `custom_field_definitions`, `hdec_eng_master`, `hdec_pic_master`, subcontractors 등 마스터
- 감사 로그: `event_log`, 각종 `*_change_log`, `*_audit`
- **Storage 파일** (업로드 원본 파일)
- **인증 데이터** (`auth.users`, 비밀번호 해시 등)
- **DB 로직**: 함수, 트리거, RLS 정책, enum 등 (이건 마이그레이션 파일로만 관리됨)

#### 그 밖의 한계
- 복원 함수(`restore-snapshot`)도 **`subtests`만 복구**
- 스냅샷이 단일 jsonb 컬럼에 저장되어 데이터가 커질수록 비효율적이며, 단일 행 크기 한계 위험
- Lovable Cloud(Supabase) 자체의 PITR/일일 백업은 별도이며, 이 앱 차원에서는 활용/노출되어 있지 않음

### 현재 보장되는 범위 요약
| 항목 | 자동 백업 여부 |
|---|---|
| `subtests` 테이블 | 매일 1회 (SGT 23:50) |
| 그 외 모든 비즈니스 테이블 | 없음 |
| Storage 파일 | 없음 |
| 인증/권한 | 없음 |
| DB 로직(함수/트리거/RLS) | 없음 (마이그레이션 파일 의존) |

### 권장 개선 방향 (다음 단계로 진행 가능)
1. **다중 테이블 백업으로 확장**: `auto-snapshot`이 모든 비즈니스 테이블을 묶어 저장하도록 변경 (테이블별 배열 또는 별도 행)
2. **`restore-snapshot` 일반화**: 스냅샷 페이로드의 테이블 키를 순회하며 복원
3. **저장 방식 개편**: jsonb 단일 행 대신 Storage 버킷에 JSON 파일로 업로드(크기/성능 안전)
4. **보존 정책**: 일/주/월 단위 보관 기간과 자동 정리 룰
5. **무결성**: 외래 키 의존 테이블의 복원 순서 정의 + 트랜잭션/배치 처리
6. (선택) Lovable Cloud의 PITR/네이티브 백업 활용 안내

원하시면 위 방향으로 확장 백업 시스템을 설계해서 다음 계획을 잡아 드리겠습니다.