## 빌드 버전 체크 로직 버그 수정

**증상**: 현재 빌드 ID와 서버의 최신 빌드 ID가 명백히 다른데도 "최신 빌드입니다" 토스트가 표시됨.

## 원인

`src/hooks/useAppVersionCheck.ts` 의 비교 로직에 silent failure 버그:

```ts
if (latest.buildId && latest.buildId !== __APP_BUILD_ID__) {
  return 'update';
}
return 'latest';   // ← 여기가 버그
```

`latest.buildId` 가 **falsy(빈 문자열, undefined, null)** 인 경우 첫 조건이 false가 되어 그대로 `'latest'` 를 반환합니다. 다른 시나리오:

- `/app-version.json` 이 빌드되지 않은 환경에서 SPA 폴백으로 `index.html`(HTML) 이 반환되는 경우 → 현재는 `res.json()` 이 던지면 `'error'`, 하지만 빈 객체 `{}` 등이 반환되면 `latest.buildId` 가 undefined → **잘못된 'latest'**.
- 응답이 캐시 프록시에 의해 잘못 직렬화되거나 이전 manifest 가 caching layer 에 남아있는 경우.
- 비교 결과를 어디에도 로깅하지 않아 **디버깅 불가능** — 사용자 신고 외에 검증 수단이 없음.

## 변경 내용

### 1. `src/hooks/useAppVersionCheck.ts` — 비교 로직 강화

- `res.headers['content-type']` 가 `json` 을 포함하지 않으면 즉시 `'error'` 반환 (SPA 폴백 HTML 가드).
- `res.json()` 을 try/catch 로 감싸 파싱 실패시 `'error'`.
- `latest.buildId` 가 falsy/non-string 이면 **`'error'` 반환** (`'latest'` 가 아님).
- 매 호출시 `console.info('[version-check]', { current, remote, match })` 로 비교 결과 로깅 → 사용자/우리가 콘솔에서 즉시 검증 가능.
- 실패 경로마다 `console.warn` 으로 사유 기록.

### 2. `src/components/layout/BuildInfoChip.tsx` — UX 개선

- 토스트 메시지에 **양쪽 buildId 끝 6자리** 표시:
  - 'latest' → `최신 빌드입니다 (현재 v: ${shortId})`
  - 'update' → `새 빌드 발견 — 현재 ${currShort} → 최신 ${nextShort}` (reload 전 대기)
  - 'error' → 기존 그대로 `확인 실패`
- 드롭다운 라벨에도 fetch 한 최신 buildId 표시(있을 때) → 시각적 비교 가능.

이를 위해 `checkVersion` 의 반환 타입에 remote buildId 도 함께 돌려주도록 확장:
```ts
type VersionCheckResult =
  | { state: 'latest'; current: string; remote: string }
  | { state: 'update'; current: string; remote: string }
  | { state: 'error'; reason?: string };
```
호출부(BuildInfoChip)는 새 타입에 맞게 분기.

## 기술 노트

- `vite.config.ts` 의 `appVersionPlugin` 은 `generateBundle` 훅에서만 emit 하므로 **dev 모드에서는 `/app-version.json` 이 존재하지 않음** — 위 가드(content-type 체크)가 이 경우를 안전히 'error' 로 처리.
- `__APP_BUILD_ID__` 는 build 시점에 inline 되며, `app-version.json` 의 `buildId` 와 동일 변수에서 온 값이므로 정상 빌드에선 반드시 일치해야 정상.
- 이 수정으로 "다른데 latest" 거짓 양성은 사라지고, 차이가 있으면 항상 `'update'` 로 분류되어 자동 reload 흐름을 탑니다.
- 기존 인터벌(2분), visibilitychange, online, app-version-mismatch 이벤트 트리거 동작은 변경 없음.
