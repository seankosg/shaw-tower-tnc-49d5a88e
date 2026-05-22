# HDEC 판별 로직 일회성 백필 실행

현재 Raw Data 전체에 대해 신규 판별 로직(`hdec_verification`, `hdec_reason`)을 일회 적용합니다. 이미 구현된 Edge Function `defect-priority-verification-backfill` 을 직접 호출하여 처리합니다.

## 실행 범위

- 대상: `defect_items` 테이블 전체 (프로젝트 스코프 없음)
- 동작:
  1. **Clear Pass** — `priority ≠ 'Cat A - Major Defect (Before SC)'` 인데 HDEC 필드가 채워진 행은 `null` 로 초기화
  2. **Set Pass** — Cat A 행 중 `status ∉ {Closed, Done}` 이고 `description` 이 있는 행에 대해 룰 매칭 실행 → `hdec_verification` / `hdec_reason` 세팅
- 제외: Closed/Done 상태 행은 보존(Preserve)

## 실행 방식

옵션 두 가지 중 선택:

### A. Admin UI 버튼으로 실행 (권장)
- Admin → Settings → "HDEC Priority Verification Backfill" 버튼 클릭
- 결과 토스트로 Set / Cleared / No match / Skipped / Scanned 카운트 확인

### B. 에이전트가 Edge Function 직접 호출
- `supabase--curl_edge_functions` 로 `defect-priority-verification-backfill` 호출 (현재 로그인 세션 토큰 사용, admin/superuser 권한 필요)
- 응답 JSON 을 채팅으로 요약 보고
- 필요 시 DB 검증 쿼리 (`hdec_verification` 분포 집계) 실행

## 기술 세부 (참고)

- 함수 위치: `supabase/functions/defect-priority-verification-backfill/index.ts`
- 권한 체크: `is_admin_or_superuser(auth.uid())`
- 스캔 한도: 50,000 rows / 100-row 청크 / `Promise.allSettled` 병렬 업데이트
- 룰 소스: `defect_priority_verification_rules` (활성 룰만, 캐시 5분)

## 확인 필요

어떤 방식으로 실행할까요?
- A: 직접 Admin UI 에서 실행 (안전, 사용자가 통제)
- B: 에이전트가 지금 호출 (즉시 실행 + 결과 요약)
