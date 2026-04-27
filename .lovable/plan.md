## 목표
T&C / Defect 모듈이 일시 중단(Paused)된 상태에서도 **Administrator(admin)** 는 모든 기능을 제약 없이 사용할 수 있도록 한다. 다른 사용자(Superuser 포함)는 현재처럼 차단된다.

## 현재 상태 점검 결과

이미 admin 우회가 되어 있는 곳 (수정 불필요):
- `RoleGuard.tsx` — 라우트 진입 차단을 admin은 우회
- `AppSidebar.tsx` — paused 모듈 메뉴 그룹을 admin에게는 표시
- `ModulePausedBanner.tsx` — admin에게만 재개 배너 표시
- `app_settings` RLS — admin/superuser가 모듈 상태를 읽고 변경 가능
- 모든 import/export 관련 Edge Function 및 DB RLS — 모듈 상태를 검사하지 않음

**admin도 막혀 있는 곳 (수정 대상):**
1. `src/pages/ImportPage.tsx` (T&C Import) — Execute Import 버튼이 `modulePaused`로 admin도 비활성화됨
2. `src/pages/DefectImportPage.tsx` (Defect Import) — 동일 문제

## 수정 내용

### 1. `src/pages/ImportPage.tsx`
- `useAuth()`에서 `isAdmin`을 가져온다.
- `modulePaused` 정의를 `!tnc.enabled && !isAdmin`으로 변경 (effective lock).
- 별도로 `moduleActuallyPaused = !tnc.enabled`를 두어 안내 배너는 admin에게도 표시하되, 문구를 admin용으로 분기:
  - 일반 사용자: "T&C 모듈이 일시 중단되어 업로드가 잠겼습니다."
  - admin: "T&C 모듈은 현재 일시 중단 상태이지만, 관리자 권한으로 업로드가 가능합니다." (참고용)
- Execute Import 버튼의 `disabled`는 `modulePaused`(=effective lock)만 사용하므로 admin은 정상 동작.

### 2. `src/pages/DefectImportPage.tsx`
- 위와 동일하게 처리 (`defect.enabled` 기준).

### 3. 가드/사이드바/RLS — 변경 없음
이미 `isAdmin` 우회가 적용되어 있어 그대로 둔다.

## 기술 세부사항

```ts
// ImportPage.tsx
const { isAdmin } = useAuth();
const { tnc } = useModuleStatus();
const moduleActuallyPaused = !tnc.enabled;
const modulePaused = moduleActuallyPaused && !isAdmin; // admin bypass

// 배너: 모듈이 paused이면 표시. admin/일반 사용자 메시지 분기.
{moduleActuallyPaused && (
  <div className="...">
    {isAdmin ? (
      <>관리자 권한으로 모듈이 중단 상태에서도 업로드를 진행할 수 있습니다.</>
    ) : (
      <>T&C 모듈이 일시 중단되어 업로드가 잠겼습니다.</>
    )}
  </div>
)}

// 버튼: effective lock만 적용
<Button disabled={isRunning || readyCount === 0 || modulePaused}>...</Button>
```

`DefectImportPage.tsx`도 동일 패턴으로 `defect.enabled`, `isAdmin` 사용.

## 영향 범위
- 변경 파일: 2개 (`ImportPage.tsx`, `DefectImportPage.tsx`)
- 신규 파일: 없음
- DB 마이그레이션: 없음
- 일반 사용자 동작: 변화 없음 (여전히 모듈 중단 시 차단)
- Admin 동작: 모든 모듈에서 import/upload 포함 모든 기능을 제약 없이 사용 가능

## 검증
- TypeScript 타입 체크
- admin 계정으로 두 모듈 모두 paused 상태에서 Import 페이지 진입 → 안내 배너는 admin용 메시지로 표시되고 Execute 버튼은 활성화되는지 확인
- 일반 user 계정으로는 기존과 동일하게 차단되는지 확인
