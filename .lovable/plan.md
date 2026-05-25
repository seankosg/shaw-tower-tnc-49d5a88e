# 목표
Subtask 추가 시 반복되는 `type "public.team_enum" does not exist` 오류를 단순 봉합이 아니라, 재배포/복원/환경 재구성 때도 다시 나오지 않도록 근본적으로 제거합니다.

# 확인된 문제
- 현재 운영 백엔드의 `add_punch_subtask` 함수는 `public.team_type`를 사용하고 있어 현재 정의만 보면 정상입니다.
- 하지만 저장소의 핵심 migration 파일 `20260525045831...sql` 안에는 아직 `::public.team_enum`가 남아 있습니다.
- 즉, 어느 시점에든 이 migration 기준으로 함수가 다시 생성되거나 환경이 복원되면 잘못된 함수 정의가 다시 살아날 수 있는 구조입니다.
- 이전에 수정한 `health_status` 오류와 같은 패턴으로, 이번에는 `team` enum 참조가 원본 migration에 남아 있어 재발성 장애를 만들고 있습니다.

# 구현 계획
1. **Subtask RPC 관련 DB 정의 전수 정리**
   - `add_punch_subtask` 원본 migration의 `team_enum` 참조를 `team_type`로 수정합니다.
   - 동일 계열의 punch 관련 함수/trigger/migration 중 enum 드리프트가 더 없는지 함께 정리합니다.

2. **재발 방지용 보정 migration 추가**
   - 현재 운영 백엔드에 `CREATE OR REPLACE FUNCTION public.add_punch_subtask(...)`를 다시 적용하는 보정 migration을 추가합니다.
   - 필요 시 `DROP FUNCTION ...` 후 재생성 대신, 시그니처를 유지하는 범위에서 안전하게 함수 본문만 교체합니다.
   - 이 보정 migration에는 `team_type` 강제, null 처리, 기존 권한 로직 유지가 포함됩니다.

3. **입력값 안정성 보강**
   - 프론트의 Add Subtask payload에서 `team` 값이 빈 문자열일 때 DB cast 경로에서 불필요한 예외를 만들지 않도록 검토합니다.
   - `sub_trade`, `planned_start_date`, `main_trade` 자동 상속 로직은 유지하면서 team 전달값만 더 안전하게 다듬습니다.

4. **실제 동작 기준 검증**
   - Summary/비-Summary parent 각각에서 Subtask 추가 경로를 점검합니다.
   - `planned_start_date` 최신 subtask 상속, Main Trade/Sub Trade 상속, 정렬 오름차순 로직이 이번 수정으로 깨지지 않는지 함께 확인합니다.
   - 같은 오류 문자열이 다시 발생하지 않는지 로그 기준으로 확인합니다.

# 결과물
- 잘못된 `team_enum` 참조 제거
- 운영 백엔드 함수 보정 migration
- 프론트 payload 안정성 보강(필요 시)
- 재발 방지 검증 완료

# 기술 메모
- 현재 DB에 존재하는 enum은 `team_type` 뿐이며 `team_enum`는 없습니다.
- 따라서 이번 이슈의 본질은 “현재 함수 한 군데 수정”이 아니라, “원본 migration과 운영 함수 정의의 불일치(drift)”입니다.
- 이 drift를 없애야 이후 재배포/복원/마이그레이션 재적용 때 동일 장애가 되살아나지 않습니다.