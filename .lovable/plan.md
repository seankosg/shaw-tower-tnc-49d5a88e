

## 제안 방향

현재처럼 사용자가 앱을 사용 중인 상태에서 계속 Publish가 발생하는 운영 방식에서는, 이미 접속해 있는 브라우저가 자동으로 새 코드로 바뀌지는 않습니다.

React/Vite 앱은 보통 아래처럼 동작합니다.

```text
사용자가 접속
→ index.html + JS/CSS 파일 로드
→ 브라우저 메모리 안에서 앱 실행
→ 그 후 새 Publish 발생
→ 이미 열린 탭은 기존 JS 코드로 계속 실행
→ 새로고침하거나 다시 접속해야 새 코드 적용
```

따라서 개선 목표는 다음 두 가지입니다.

```text
1. 새로 접속하는 사용자는 최신 Publish 버전을 받도록 보장
2. 이미 접속 중인 사용자는 새 Publish를 감지하고 안전하게 새로고침하도록 안내
```

## 권장 구현안

앱에 “새 버전 감지 및 업데이트 안내” 기능을 추가하겠습니다.

### 1. Publish마다 고유한 Build ID 생성

빌드할 때마다 고유한 버전 ID를 생성합니다.

예시:

```text
Build ID: 2026-04-22T10:25:13.000Z
또는
Build ID: git commit hash
```

그리고 Publish 결과물에 아래 파일을 자동 포함합니다.

```text
/app-version.json
```

내용 예시:

```json
{
  "buildId": "2026-04-22T10:25:13.000Z",
  "builtAt": "2026-04-22T10:25:13.000Z"
}
```

동시에 현재 실행 중인 앱 코드 안에도 같은 Build ID를 포함시킵니다.

```text
현재 열린 탭의 Build ID
vs
서버에 publish된 최신 Build ID
```

이 두 값이 다르면 “새 버전이 Publish됨”으로 판단합니다.

---

### 2. 접속 중인 사용자의 새 버전 자동 감지

앱 실행 중 일정 간격으로 최신 버전 파일을 확인합니다.

```text
앱 실행 중
→ 2분마다 /app-version.json 확인
→ 현재 앱 buildId와 최신 buildId 비교
→ 다르면 업데이트 안내 표시
```

추가로 아래 상황에서도 즉시 확인합니다.

```text
- 사용자가 브라우저 탭을 다시 활성화했을 때
- 사용자가 다른 화면으로 이동했을 때
- 네트워크가 끊겼다가 다시 연결됐을 때
```

이렇게 하면 사용자가 오래 켜둔 탭에서도 새 Publish를 인지할 수 있습니다.

---

### 3. 사용자에게 강제 새로고침 대신 안전한 안내 표시

작업 중인 사용자에게 갑자기 새로고침을 강제하면 입력 중인 데이터가 사라질 수 있습니다.

따라서 기본 동작은 아래처럼 하겠습니다.

```text
새 버전이 준비되었습니다.
작업 중인 내용을 저장한 뒤 새로고침해 주세요.

[지금 새로고침]
```

표시는 앱 상단에 고정 배너로 두는 것을 권장합니다.

예시 문구:

```text
A new version is available. Please refresh to update.
[Refresh now]
```

또는 한국어 중심 운영이면:

```text
새 버전이 배포되었습니다. 최신 기능을 사용하려면 새로고침해 주세요.
[새로고침]
```

현재 앱의 사용자가 현장/관리 업무를 하는 상황이므로, 갑작스러운 자동 reload보다 명시적인 버튼 방식이 안전합니다.

---

### 4. 위험 상황에서는 자동 새로고침하지 않음

다음 상황에서는 자동 새로고침을 하지 않고 안내만 표시합니다.

```text
- Import 진행 중
- Subtest Detail 저장 중
- Mobile Update 저장 중
- 사용자가 폼을 수정 중일 가능성이 있는 화면
```

특히 현재 앱에는 Import, Detail Edit, Mobile Update 같은 데이터 변경 화면이 있으므로 강제 새로고침은 피하겠습니다.

기본 정책:

```text
조회 화면:
- Dashboard
- Progress
- Raw Data
- Export

→ 새 버전 안내 배너 표시
→ 사용자가 누르면 새로고침

입력/저장 화면:
- Import
- Subtest Detail
- Mobile Update
- Admin 일부 화면

→ 새 버전 안내 배너 표시
→ 저장 후 새로고침하도록 안내
```

---

### 5. 오래된 코드에서 새 파일을 못 찾는 오류 대응

Publish 직후 사용자가 기존 코드 상태에서 화면 이동을 하다가, 브라우저가 더 이상 존재하지 않는 JS chunk를 요청하는 경우가 있을 수 있습니다.

예시 오류:

```text
Failed to fetch dynamically imported module
Loading chunk failed
```

이 경우에도 앱이 멈추지 않도록 전역 오류 감지 로직을 추가하겠습니다.

```text
chunk 로딩 오류 발생
→ 새 버전 가능성 판단
→ “앱이 업데이트되었습니다. 새로고침해 주세요.” 안내
→ [새로고침] 버튼 제공
```

현재 코드에는 lazy route chunk가 많지는 않지만, 향후 코드 분할이나 빌드 결과에 따라 발생할 수 있으므로 함께 대비하는 것이 좋습니다.

---

## 운영 정책 제안

코드 개선과 별도로 실제 운영에서는 아래 방식도 권장합니다.

### 1. 큰 기능 변경은 사용량 적은 시간에 Publish

예:

```text
점심시간
업무 종료 후
현장 업데이트가 적은 시간대
```

특히 데이터 입력 화면이나 Import 로직이 바뀌는 경우에는 업무 중간 Publish를 줄이는 것이 좋습니다.

---

### 2. 자주 Publish하는 개발 기간에는 사용자에게 안내

예:

```text
현재 시스템 개선 작업 중입니다.
새 버전 안내가 표시되면 작업 저장 후 새로고침해 주세요.
```

이 안내는 앱 상단 배너 또는 공지 영역으로 나중에 확장할 수도 있습니다.

---

### 3. 데이터베이스 변경과 화면 변경은 순서 주의

현재 앱은 Lovable Cloud 기반의 데이터와 화면 코드가 함께 움직입니다.

안전한 순서는 보통 아래와 같습니다.

```text
1. 기존 화면과 호환되는 데이터 구조 변경
2. 새 화면 코드 Publish
3. 충분히 확인 후 오래된 호환 로직 제거
```

즉, Publish 직후 기존 탭을 쓰는 사용자가 있어도 깨지지 않도록 “하위 호환”을 유지하는 방식이 좋습니다.

---

## 구현 대상 파일

주요 수정 파일은 아래가 될 예정입니다.

```text
vite.config.ts
src/vite-env.d.ts
src/lib/app-version.ts
src/components/layout/AppUpdateBanner.tsx
src/components/layout/AppLayout.tsx
src/main.tsx
```

필요 시 새 파일을 추가합니다.

```text
src/hooks/useAppVersionCheck.ts
```

---

## 구현 상세

### 1. Vite 빌드 설정에 Build ID 추가

`vite.config.ts`에서 빌드 시점의 Build ID를 생성합니다.

```text
- __APP_BUILD_ID__ 전역 상수 주입
- app-version.json 파일을 dist에 자동 생성
```

이렇게 하면 Publish마다 새로운 버전 파일이 만들어집니다.

---

### 2. 앱 버전 체크 Hook 추가

`useAppVersionCheck`를 추가합니다.

기능:

```text
- 현재 앱 Build ID 확인
- /app-version.json fetch
- cache: no-store 적용
- 최신 Build ID와 비교
- 다르면 updateAvailable = true 반환
- 2분 간격 polling
- visibilitychange 이벤트에서 재확인
- online 이벤트에서 재확인
```

---

### 3. 상단 업데이트 배너 추가

`AppUpdateBanner` 컴포넌트를 추가합니다.

표시 조건:

```text
updateAvailable === true
```

버튼:

```text
[새로고침]
```

동작:

```text
window.location.reload()
```

문구:

```text
새 버전이 배포되었습니다. 작업 중인 내용을 저장한 뒤 새로고침해 주세요.
```

---

### 4. AppLayout에 배너 배치

현재 `AppLayout` 구조는 상단 header와 main 영역이 있습니다.

배너는 header 아래, main 위에 넣는 것이 좋습니다.

```text
SidebarInset
 ├─ header
 ├─ AppUpdateBanner
 └─ main
```

이렇게 하면 모든 보호된 화면에서 공통으로 표시됩니다.

---

### 5. 전역 chunk 로딩 오류 처리

`main.tsx` 또는 별도 helper에서 아래 오류를 감지합니다.

```text
Failed to fetch dynamically imported module
Importing a module script failed
Loading chunk failed
```

감지 시:

```text
- 새 버전 안내 상태 활성화
- 또는 즉시 reload 안내 toast/banner 표시
```

강제 reload는 하지 않고 사용자가 선택하게 하겠습니다.

---

## 사용자 경험

개선 후 사용자는 아래처럼 동작을 경험하게 됩니다.

```text
상황 1: 새 사용자가 접속
→ 최신 Publish 버전으로 접속

상황 2: 사용자가 이미 접속 중인데 새 Publish 발생
→ 2분 이내 또는 탭 재활성화 시 새 버전 감지
→ 상단에 새 버전 안내 표시
→ 사용자가 작업 저장 후 새로고침

상황 3: 오래된 코드 때문에 일부 파일 로딩 실패
→ 앱이 멈추는 대신 새로고침 안내 표시
```

---

## 검증 항목

구현 후 아래를 확인하겠습니다.

```text
1. npm run build 성공
2. 빌드 결과물에 app-version.json 생성 확인
3. 앱 실행 중 app-version.json을 정상 fetch하는지 확인
4. buildId가 같으면 배너가 표시되지 않는지 확인
5. buildId가 다르면 배너가 표시되는지 확인
6. 새로고침 버튼 클릭 시 최신 화면으로 reload되는지 확인
7. Import 진행 중에도 강제 새로고침이 발생하지 않는지 확인
8. Dashboard / Progress / Raw Data 어디서든 배너가 보이는지 확인
9. 네트워크 오류 시 사용자에게 불필요한 에러가 표시되지 않는지 확인
10. 기존 로그인/권한/라우팅 동작이 깨지지 않는지 확인
```

## 최종 목표

최종적으로 운영 방식은 아래처럼 정리됩니다.

```text
Publish를 계속하더라도
- 새로 접속한 사용자는 최신 코드 사용
- 이미 접속 중인 사용자는 새 버전 감지
- 작업 중 데이터 손실 없이 사용자가 직접 새로고침
- 오래된 코드/새 코드가 섞여 생기는 오류를 최소화
```

