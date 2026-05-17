## 문제
Report Tab(`/admin/report`)에서 모듈/섹션 체크박스, 날짜, 생성한 Markdown/JSON 등 로컬 state를 설정한 뒤 다른 윈도우/탭으로 갔다가 돌아오면 모든 값이 초기 상태로 리셋됨.

## 원인
`src/contexts/AuthContext.tsx`의 `onAuthStateChange` 핸들러:

```ts
const needsBlockingLoad = event === 'SIGNED_IN' || event === 'INITIAL_SESSION';
if (needsBlockingLoad) setLoading(true);
```

Supabase v2 클라이언트는 `autoRefreshToken: true` 상태에서 탭이 다시 visible 상태가 될 때 세션 복구를 수행하며, 이 과정에서 `SIGNED_IN` 이벤트를 재발행한다(초기 로그인뿐 아니라 visibility 복귀 시에도 발생).

→ `setLoading(true)` 가 호출됨
→ `ProtectedRoute` / `RoleGuard` 가 `loading` 분기를 타서 children 을 unmount 하고 "Loading..." 화면 표시
→ `AppLayout` → `AdminReportPage` → `ReportTab` 이 통째로 unmount 되어 모든 `useState` 값 소멸
→ 다시 fetch 가 끝나면 remount 되면서 초기값으로 시작

ReportTab만이 아니라 Slide Composer, Code Editor 등 다른 탭의 로컬 state(예: 수정 중인 코드, 미저장 입력)도 같은 문제를 겪고 있다.

## 수정 방향
"초기 1회"에만 blocking loading 을 켜고, 이후의 `SIGNED_IN` / `INITIAL_SESSION` 재발행 때는 백그라운드로 프로필/롤만 다시 가져오게 한다.

### 변경 파일
`src/contexts/AuthContext.tsx`

1. `useRef<boolean>(false)` 로 `initialLoadDoneRef` 추가.
2. `onAuthStateChange` 콜백에서:
   - `needsBlockingLoad = !initialLoadDoneRef.current && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')`
   - blocking 분기에서 fetch 완료 후 `initialLoadDoneRef.current = true` 설정.
3. 아래 `supabase.auth.getSession().then(...)` 가 먼저 끝나는 경우에도 동일하게 `initialLoadDoneRef.current = true` 로 표시(중복 blocking 방지).
4. `SIGNED_OUT` 등 기존 분기는 그대로 유지.

이렇게 하면:
- 최초 진입/로그인 직후: 기존과 동일하게 "Loading..." 표시 후 진입.
- 탭 복귀로 `SIGNED_IN` 재발행 시: `setLoading(true)` 가 호출되지 않아 children unmount 가 발생하지 않고 ReportTab/Slide Composer/Code Editor 등의 로컬 state 가 보존됨. 프로필/롤은 백그라운드에서 갱신.

### 검증
- Report Tab 진입 → 체크박스/날짜 변경 → Refresh Preview 로 Markdown 생성 → 다른 윈도우로 이동 후 30초~수분 뒤 복귀 → 입력값과 생성된 Markdown 이 그대로 유지되는지 확인.
- Slide Composer / Code Editor 에서도 동일 시나리오 확인.
- 로그아웃/로그인 동작과 권한 변경 시 RoleGuard 동작이 정상인지 확인.

## 범위 외
- 새 라우트 추가, Tabs 구조 변경, UI 변경 없음.
- Supabase 클라이언트 설정 변경 없음.
