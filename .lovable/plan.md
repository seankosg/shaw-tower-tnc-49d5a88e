# 백업 정상화 + 스케줄 UI + 권장 조치 재정리

조사 결과를 먼저 답하고, 그 다음 어떤 코드 변경을 권하는지 정리했습니다.

---

## Q1. 자동 백업이 5/6 에 멈춘 이유

**cron 자체는 살아 있습니다.** Storage 의 `db-backups` 버킷에는 `auto/2026-05-28-23-50/` 같은 매일자 폴더가 어제까지 계속 생성되고 있습니다. 즉 **백업 작업은 매일 돌고 있는데, "성공" 으로 마무리되지 못해 `database_snapshots` 테이블(=UI 목록의 원천)에 행이 안 들어오는 상태**입니다.

원인은 두 가지가 겹쳤습니다:

1. **5/7 무렵 v3 chunked 방식으로 함수가 refactor**됐고, 마지막 단계(manifest.json 업로드 + `database_snapshots` insert)가 매번 도달되지 못합니다.
2. **`BACKUP_TABLES` 가 55개로 늘었지만 실제 폴더에는 42개 파일만 올라옵니다.** 누락된 13개는 후반부의 큰 자식 테이블들 — `event_log`, `defect_daily_snapshots`, `defect_change_log`, `defect_schedule_change_audit`, `sc_no_history`, `docs_change_log`, `omm_comments`, `warranty_comments`, `warranty_change_log`, `upload_row_logs`, `defect_upload_row_logs`, `docs_upload_row_logs`, `warranty_upload_row_logs`, `import_field_logs` 등.
   → 이 중 하나가 stage 안에서 SELECT 또는 업로드에 실패(타임아웃/페이로드/메모리 초과)하면 `uploadTable` 이 throw → 그 stage 가 500 으로 응답 → fire-and-forget 체인이라 다음 stage 가 트리거되지 않음 → 최종 단계 진행 안됨 → DB insert 없음 → UI 목록에 표시 안됨.

또한 진행 중 `_progress.json` 이 폴더에 남아 있는 것도 끝까지 못 갔다는 증거입니다(정상 완료 시 삭제 처리됨).

### 현재 자동 백업 스케줄 설정 기능

UI 에 **없습니다.** 스케줄은 외부에서 `cron.schedule` 로 직접 등록되어 있고, 활성/비활성/시각 변경/마지막 성공시각 확인을 앱에서 할 수 없습니다(권장 조치 #10 의 "cron 가시성" 항목).

→ 구현 필요. Admin → Backup 탭에 **Schedule** 카드 추가:
- Enable / Disable 토글
- 실행 시각 (HH:MM, 기본 23:50 SGT)
- 마지막 자동 실행 시각 / 상태 (성공·진행중·실패) 배지
- "Run now" 버튼 (수동 트리거)

백엔드: `app_settings.backup_schedule = { enabled, hh, mm }` 에 저장, `update_backup_schedule(_enabled, _hh, _mm)` RPC 가 `cron.unschedule` + `cron.schedule` 을 재등록. 마지막 실행은 `database_snapshots` 최신 `auto` 행 또는 별도 `backup_run_log` 테이블에서 읽음.

---

## Q2. "Save Current Data" 를 눌러도 목록에 안 나타나는 이유

`AdminPage.createSnapshot` 은 `supabase.functions.invoke('auto-snapshot', { body: { mode: 'manual' } })` 만 호출합니다. 이 호출은 즉시 `status: "initialized"` 만 받고 끝납니다(0번 stage 만 fire-and-forget 으로 발사). **`database_snapshots` 행은 모든 stage가 끝나는 *마지막* invocation 에서만 insert** 됩니다.

따라서 Q1 의 후반부 stage 실패 → 최종 invocation 도달 안함 → DB 행 없음 → `load()` 가 새 스냅샷을 못 봄.

추가로 UI 버그도 있습니다: toast 에서 `data.total_rows` 와 `Object.keys(data.manifest)` 를 표시하는데, "initialized" 응답에는 두 필드가 둘 다 없어 **"undefined rows across 0 tables" 같은 잘못된 성공 메시지**가 뜹니다. 사용자가 성공으로 오인하게 됩니다.

오늘 08:32 수동 백업의 Storage 폴더(`manual/2026-05-29-08-32/`)에도 42개 파일 + `_progress.json` 만 있고 `manifest.json` 이 없습니다 — 위 진단과 일치.

---

## 권장 조치 — 즉시 효과 정리 (우선순위 재정렬)

| # | 조치 | 기대 효과 |
|---|---|---|
| 1 | **fire-and-forget 제거** — `triggerNext` 를 동기 await 또는 `EdgeRuntime.waitUntil()` 로 변경, 실패 stage 가 UI 에 노출되도록 | 침묵 실패 종결. 어떤 단계에서 왜 실패했는지 토스트/콘솔에 즉시 표시됨. 오늘 같은 "버튼 눌렀는데 목록에 없음" 현상 사라짐. |
| 2 | **마지막 stage 안정화** — 큰 테이블(`event_log`, `defect_daily_snapshots`, 각종 `*_change_log`/`*_row_logs`)을 별도 stage 로 강제 분리 + 페이지 사이즈 500 으로 축소 + 페이지 단위로 Storage 에 append 업로드 | 5/7 이후 자동 백업 *완료*. `database_snapshots` 에 다시 행이 쌓여 UI 표시 정상화. |
| 3 | **수동 트리거 응답 정합성** — Edge Function 응답을 `{ status, total_rows, manifest }` 모두 채워서 반환하고, UI toast 가 `status === 'completed'` 일 때만 성공 표기 | 잘못된 "undefined rows" 토스트 제거. 진행 중일 때는 "In progress" 표시, 완료 후 폴링으로 목록 갱신. |
| 4 | **Backup Schedule UI** — Admin 탭에 enable/시각/마지막 실행 상태 + Run now 버튼 + 24h 누락 시 경고 배지 | 자동 백업의 묵시적 중단(현재 같은 상황) 즉시 감지. 운영자가 IT 도움 없이 시각 조정 가능. |
| 5 | **BACKUP_TABLES 자동 검증** — public schema 의 모든 user 테이블이 목록에 있는지 점검하는 SQL 어서션을 매 마이그레이션 후 실행 | 신규 테이블 누락으로 인한 "조용한 데이터 미백업" 위험 차단. |
| 6 | **복원을 단일 트랜잭션화** — `restore_full_snapshot(_folder text)` SECURITY DEFINER 함수에서 BEGIN/ROLLBACK; 시작 직전 자동 pre-restore 스냅샷 생성 | "복원 실패 = 텅 빈 DB" 라는 단일 최대 리스크 제거. 실패해도 자동 롤백, 정 안되면 pre-restore 로 복귀. |
| 7 | **auth.users 정합성 가드** — 복원 전 현재 auth.users id 와 백업의 user_id 교집합/차집합 리포트, admin 한 명은 반드시 보존 | 백업 시점 이후 가입자가 권한 잃고 잠기는 사고 방지. admin 잠금 사고 방지. |
| 8 | **auto-snapshot 의 JWT/서비스롤 검증 추가** — `body.folder` 가 있는 stage 호출은 service-role header 필수, 최초 호출은 admin JWT 검사 | 익명 사용자가 진행 중 백업 폴더 오염/무한 트리거하는 공격 차단. |
| 9 | **동시성 락** (`app_settings.backup_lock`) — 시작 시 conditional upsert, 종료 시 해제. 복원도 같은 락 공유 | 다중 admin 동시 백업/복원으로 인한 폴더 오염, restore 중 백업 끼어들기 차단. |
| 10 | **보존 정책 + 스토리지 동기 삭제** — auto 14개 유지, `database_snapshots` 삭제 시 Storage 폴더도 함께 제거하는 트리거 | 무기한 누적되던 고아 폴더·스토리지 비용 통제. |
| 11 | **무결성 검증** — manifest 에 행수 + SHA-256 기록, 복원 전 검증 | 손상 스냅샷으로의 자동 복원 차단. |
| 12 | **복원 안전장치 UI** — "RESTORE" 텍스트 입력 확인, 진행률 polling, 자동 pre-restore 스냅샷 안내 | 실수로 누른 Restore 가 즉시 전사 데이터 덮어쓰는 위험 차단. |

### 우선 순위 추천

지금 가장 큰 통증은 **자동 백업이 사실상 작동 안 함**과 **수동 버튼이 통신 결과를 제대로 안 보여줌** 입니다.
바로 효과가 큰 순서로:

**A. 긴급 (이번 작업)** — #1, #2, #3, #4
→ 백업이 실제로 끝나서 UI 에 다시 보이고, 사용자가 스케줄/마지막 상태를 확인할 수 있게 됨.

**B. 안전 (다음 작업)** — #6, #7, #12
→ 복원 사고 위험 제거. 한 번이라도 잘못 복원하면 회사 데이터 전체가 날아갈 수 있어 #1 그룹 직후 진행 권장.

**C. 운영 정리** — #5, #8, #9, #10, #11
→ 장기 안정성·보안·비용. 운영 들어간 뒤 순차 적용.

---

## 이번 작업으로 제안하는 범위 (승인 시 진행)

승인 주시면 **A 그룹(#1~#4)** 만 우선 수정하겠습니다. 구체 변경:

1. `supabase/functions/auto-snapshot/index.ts`
   - `triggerNext` 를 `EdgeRuntime.waitUntil(fetch(...))` 로 변경(또는 단일 호출에서 모든 stage 순차 처리 + 재진입 시 manifest 기반 resume)
   - 마지막 stage 도달 시 manifest 업로드/DB insert 실패를 명확히 로깅하고 응답에 status 포함
   - `event_log`, `*_daily_snapshots`, `*_change_log`, `*_row_logs` 전용 stage 분리 + pageSize 500
   - 시작 시 admin JWT 검사 (#8 의 일부)
2. 신규 마이그레이션
   - `backup_run_log` 테이블 (실행 시각, 상태, 에러 메시지, 폴더, total_rows)
   - `update_backup_schedule(_enabled, _hh, _mm)` RPC (pg_cron 재등록)
   - `app_settings.backup_schedule` 기본값 시드
3. `src/pages/AdminPage.tsx` BackupTab
   - 새 "Schedule" 카드 (토글/시각/마지막 실행 배지/Run now)
   - 수동 백업 toast 를 "In progress, completes in ~1–2 min" 으로 바꾸고 5초 간격 폴링으로 완료 시 자동 새로고침
   - 잘못된 "0 tables" 토스트 수정

복원 안전화(B 그룹) 는 별도 작업으로 분리해 진행하는 것을 권합니다.
