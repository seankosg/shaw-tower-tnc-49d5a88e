

# Admin Edge Functions JWT 검증 수정

## 문제
`supabase/config.toml`에서 admin 관련 edge function들이 `verify_jwt = true`로 설정되어 있습니다. Lovable Cloud는 ES256 알고리즘으로 JWT를 서명하지만, gateway의 JWT 검증은 이를 지원하지 않아 함수 코드에 도달하기 전에 401 에러가 발생합니다.

## 해결

**파일**: `supabase/config.toml`

`verify_jwt = true`로 설정된 admin 함수들을 `verify_jwt = false`로 변경합니다. JWT 인증은 이미 각 edge function 코드 내부에서 `admin.auth.getUser(token)` + `has_role` RPC로 수행하고 있으므로, gateway 레벨의 검증은 불필요합니다.

변경 대상:
- `admin-create-user`: `verify_jwt = true` → `false`
- `admin-reset-password`: `verify_jwt = true` → `false`
- `admin-update-login-id`: `verify_jwt = true` → `false`

## 수정 파일

| 파일 | 변경 |
|------|------|
| `supabase/config.toml` | 3개 admin 함수의 `verify_jwt`를 `false`로 변경 |

