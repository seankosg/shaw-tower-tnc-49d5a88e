## Goal
"Failed: No active project found" 에러를 해결합니다. 근본 원인은 RLS가 아닌, 로그인 후에도 Supabase 클라이언트가 익명(anon) 키로만 요청을 보내고 있어 `projects` 등 `authenticated` 전용 정책의 테이블이 모두 빈 결과를 반환하는 것입니다. 개발 중 인증 가드를 임시 비활성화한 변경이 세션 부착까지 함께 끊어놓은 상태로 보입니다.

## Investigation Summary
- DB 상태: `projects` 테이블에 `SHAW Construction Project (is_active=true)` 1건 정상 존재.
- RLS: SELECT 정책 `qual: true`이지만 `roles: {authenticated}`. anon 세션은 0행을 받습니다.
- Auth 로그: `admin@shaw.local` 16:32:55 로그인 성공 (admin 역할 보유).
- 네트워크 캡처: 로그인 후 모든 `/rest/v1/*` 요청의 `authorization` 헤더가 anon JWT. 사용자 access token이 클라이언트에 attach되지 않음.

## Changes
1. `src/contexts/AuthContext.tsx` 점검·복원
   - `supabase.auth.onAuthStateChange` 리스너가 setSession/setUser 하도록 보장 (먼저 등록 후 `getSession()` 호출 순서 준수).
   - `signInWithPassword` 성공 후 setSession 처리 누락 여부 확인.
   - 임시 dev 우회(예: 하드코딩된 user, 익명 모드 분기) 제거 또는 정리.
2. `src/components/layout/ProtectedRoute.tsx` 정리
   - 가드를 풀어두더라도 자식 컴포넌트가 정상적인 인증 세션 컨텍스트를 사용하도록 유지.
3. 검증
   - 로그인 후 preview에서 임의 `from('projects').select('*')` 호출이 Authorization에 user JWT를 보내는지 네트워크 로그로 확인.
   - As-Built Drawing import 재실행 → "No active project found" 사라지고 upsert 진행되는지 확인.
4. (필요 시) `getDefaultProject` 보강
   - 에러 메시지에 "세션 미인증일 가능성" 힌트 추가하여 향후 디버깅 단축.

## Out of Scope
- RLS 정책 변경(현재 정책은 정상).
- Import UI에 프로젝트 선택 dropdown 추가(별도 작업으로 가능).
- Unmapped headers (DRAWING REGISTER / S. NO. / S/No.) 매핑 — 별건으로 처리.

## Acceptance
- 로그인 상태에서 `/rest/v1/projects` 요청의 `authorization` 헤더가 anon이 아닌 user access token.
- As-Built Drawing 파일 import 시 active project 인식 후 upsert 진행, 행 수 카운터(processed/skipped/rejected) 표시.
