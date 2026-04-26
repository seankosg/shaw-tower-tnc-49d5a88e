## 옵션 A 확정 — 헤더에 "새 버전 확인" 칩 추가

`sean-asset-portfolio88`의 `BuildInfo` 패턴을 현재 CMS에 맞게 이식합니다. 기존 `AppUpdateBanner`(자동 감지 → 배너) 시스템은 그대로 유지하고, **수동 확인/강제 새로고침** UI만 헤더에 추가합니다.

---

## 변경 사항

### 1. 새 파일: `src/components/layout/BuildInfoChip.tsx`
- 헤더에 인라인 칩으로 표시되는 드롭다운 트리거
- 트리거 라벨: `v <buildId 끝 6자>` (예: `v 7f3a2c`)
- 드롭다운 메뉴:
  - **build {전체 buildId}** — DropdownMenuLabel (font-mono, 전체 빌드 ID 노출)
  - **새 버전 확인** — `checkVersion()` 호출
    - 최신이면 `toast.success("최신 빌드입니다", { description: "v: xxxxxx" })`
    - 새 버전이면 `toast.message("새 빌드 발견 — 업데이트 적용 중…")` 후 cache-bust reload
  - **강제 새로고침** — `location.replace(pathname + "?__reset=" + Date.now())`
- `__APP_BUILD_ID__`가 placeholder/빈 값/dev 토큰이면 렌더하지 않음 (안전 가드)

### 2. 수정: `src/hooks/useAppVersionCheck.ts`
- `checkVersion()`이 결과를 반환하도록 변경: `'latest' | 'update' | 'error'`
- 기존 동작(state 업데이트)은 그대로 유지 → `AppUpdateBanner`는 영향 없음
- BuildInfoChip이 반환값으로 toast 분기

### 3. 수정: `src/components/layout/AppLayout.tsx`
- 헤더 우측 영역(`<div className="ml-auto flex items-center gap-2">`) 안, **AccountMenu 바로 왼쪽**에 `<BuildInfoChip />` 배치
- 기존 `<GlobalImportIndicator />`, `<GlobalDefectImportIndicator />`와 같은 라인에 위치

### 4. 변경 없음
- `src/vite-env.d.ts` — `__APP_BUILD_ID__` 이미 선언되어 있음
- `vite.config.ts` — `appVersionPlugin`/`define` 이미 설정됨
- `src/components/layout/AppUpdateBanner.tsx` — 그대로 유지 (자동 배너 시스템 보존)

---

## 동작 시나리오

1. **평상시**: 헤더 우측에 회색 칩 `v 7f3a2c` 표시
2. **칩 클릭**: 드롭다운에 전체 build ID + 2개 액션 메뉴
3. **"새 버전 확인" 클릭**:
   - 최신 → 토스트 "최신 빌드입니다 v: 7f3a2c"
   - 신규 발견 → 토스트 "새 빌드 발견 — 업데이트 적용 중…" + 즉시 hard reload
4. **"강제 새로고침" 클릭**: `?__reset=...` 으로 hard reload (캐시 무력화)
5. **백그라운드 자동 감지**(기존): 2분마다 `useAppVersionCheck` 폴링 → 새 버전 시 `AppUpdateBanner` 표시 (사용자가 직접 새로고침)

---

## 디자인

- 칩 스타일: `rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground/80 hover:bg-background hover:text-foreground` (sean-asset-portfolio88과 동일 톤)
- 모바일: 그대로 표시 (헤더가 좁으면 텍스트만 줄어듬)
- 인쇄: `print:hidden`

---

## 영향 범위

- 신규 파일 1개, 수정 2개
- 기존 배너/감지 로직과 충돌 없음
- 사용자 데이터 영향 없음
- 빌드 파이프라인 변경 없음

**준비되면 Approve 해주세요. 구현 시작합니다.**