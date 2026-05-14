## 원인

`src/contexts/ModuleStatusContext.tsx`에서 docs 모듈만 초기 기본값이 `enabled: false`(“준비 중”)로 잡혀 있습니다.

```ts
const DEFAULT_STATUS = { enabled: true };
const DEFAULT_DOCS_STATUS = { enabled: false, reason: '준비 중' };  // ← docs만 false
```

`AppSidebar`의 그룹 가시성 규칙은:

```ts
const showDocsGroup = isAdmin || docs.enabled;
```

따라서 admin이 아닌 사용자(Senior User 포함)는 **`app_settings`에서 실제 값(`enabled:true`)이 도착하기 전까지** Docs Management 그룹이 숨겨집니다. T&C/Defect는 기본값이 `true`라 같은 타이밍 이슈가 없어서 보이고, Docs만 안 보이는 현상이 발생합니다.

추가로 어떤 사용자 세션에서 `app_settings` 첫 fetch가 지연/실패하면 docs 그룹은 영구적으로 숨겨진 상태로 남습니다. DB는 이미 `module_docs_status = {"enabled": true}`이며 RLS도 authenticated 전체 SELECT를 허용합니다. 즉 데이터 문제가 아니라 **클라이언트 기본값 문제**입니다.

## 수정 계획

`src/contexts/ModuleStatusContext.tsx` 한 파일 수정:

1. `DEFAULT_DOCS_STATUS`를 제거하고 docs 초기 상태를 `DEFAULT_STATUS`(`enabled: true`)로 통일.
   - Docs Management는 이미 운영 중이므로 “준비 중” 기본값은 시대에 안 맞음.
   - admin이 일시정지(`enabled:false`)하면 `app_settings` 값이 즉시 반영되어 그룹이 사라지는 동작은 그대로 유지.

```ts
const [docs, setDocs] = useState<ModuleStatus>(DEFAULT_STATUS);
```

## 검증

- Supp 팀 Senior User 로그인 시 사이드바에 “Docs Management” 그룹이 즉시 표시되는지 미리보기로 확인.
- Admin이 Module Control에서 Docs를 Pause하면 비-admin 사용자에게서 그룹이 사라지고, Resume 시 다시 보이는지 확인.
- 다른 그룹(T&C, Defect) 가시성에 영향 없는지 확인.

## 영향 범위

- 변경 파일: `src/contexts/ModuleStatusContext.tsx` (1줄 수준)
- DB/RLS/마이그레이션 변경 없음
- 권한 체계(`role-permissions.ts`) 변경 없음
