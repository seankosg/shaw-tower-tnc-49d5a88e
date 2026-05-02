# 고아 audit 레코드 정리 계획

## 배경
이전 작업에서 Subcontractor가 "Delete"로 표기된 `subtests` 23건을 삭제했습니다. 그에 연결된 `schedule_change_audit` 테이블의 31건이 고아 레코드로 남아 있어 이를 정리합니다.

## 작업 단계

### 1단계: 대상 재확인 (읽기 전용)
- `supabase--read_query`로 삭제된 23개 `subtest_id`에 연결된 `schedule_change_audit` 행 수와 샘플을 다시 조회하여 31건이 맞는지 확인합니다.

### 2단계: 삭제 실행
- DELETE 작업이므로 `supabase--migration` 도구를 사용해 다음 SQL을 실행합니다:
  ```sql
  DELETE FROM public.schedule_change_audit
  WHERE subtest_id IN (<23개 UUID 리스트>);
  ```
- 이 도구는 사용자 승인 팝업을 띄우며, **"Approve"** 한 번만 눌러주시면 즉시 실행됩니다. (또는 팝업에서 "Always allow"를 선택하면 이후 데이터 변경도 자동 승인됩니다.)

### 3단계: 결과 검증
- 삭제 후 같은 조건으로 다시 SELECT하여 0건이 남았는지 확인합니다.
- 사용자에게 최종 결과(삭제된 행 수)를 보고합니다.

## 영향 범위
- 삭제 대상: `schedule_change_audit` 테이블의 31개 과거 audit 로그
- 다른 테이블/기능에는 영향 없음 (이미 부모 `subtests`가 삭제된 상태이므로 UI/조회에서 보이지도 않음)
- 되돌릴 수 없음 — 다만 단순 audit 히스토리이므로 운영 데이터에는 영향 없음
