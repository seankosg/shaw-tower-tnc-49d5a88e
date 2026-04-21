

# Admin Create User Edge Function 수정

## 문제
`admin-create-user` edge function에서 `userClient.auth.getClaims(token)`을 호출하고 있으나, supabase-js v2.95.0에 `getClaims` 메서드가 존재하지 않아 런타임 에러가 발생합니다.

## 해결

**파일**: `supabase/functions/admin-create-user/index.ts`

`getClaims` 호출을 `getUser`로 교체:

```typescript
// 변경 전 (line 41-43)
const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
const callerId = claims.claims.sub;

// 변경 후
const { data: { user: caller }, error: userErr } = await admin.auth.admin.getUser(token);
if (userErr || !caller) return json({ error: 'Unauthorized' }, 401);
const callerId = caller.id;
```

서비스 역할 클라이언트(`admin`)의 `auth.admin.getUser()`를 사용하여 토큰에서 사용자 정보를 가져옵니다.

## 수정 파일

| 파일 | 변경 |
|------|------|
| `supabase/functions/admin-create-user/index.ts` | `getClaims` → `admin.auth.admin.getUser` |

