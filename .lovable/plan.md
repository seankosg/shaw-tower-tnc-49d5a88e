
# Plan: 의존성 문제 정리 및 빌드 복구

## 목표

현재 빌드 실패 원인인 `@tanstack/query-core` 의존성 문제를 해결하기 위해 아래 3가지를 진행합니다.

```text
1. 의존성 재설치
2. @tanstack/query-core 명시 추가
3. lockfile 정리 후 재생성
```

## 현재 확인된 상태

프로젝트에는 현재 lockfile이 여러 개 존재합니다.

```text
bun.lock
bun.lockb
package-lock.json
```

또한 `package.json`에는 `@tanstack/react-query`가 있지만, `@tanstack/query-core`는 직접 dependency로 명시되어 있지 않습니다.

`@tanstack/query-core`는 `@tanstack/react-query`의 내부 의존성이지만, 빌드 환경에서 누락 문제가 발생했기 때문에 직접 명시해서 안정화합니다.

## 변경 계획

### 1. `package.json`에 `@tanstack/query-core` 추가

대상 파일:

```text
package.json
```

현재:

```json
"@tanstack/react-query": "^5.83.0"
```

수정 후:

```json
"@tanstack/query-core": "^5.83.0",
"@tanstack/react-query": "^5.83.0"
```

`@tanstack/react-query`와 동일한 버전 계열인 `5.83.0`을 사용해 버전 충돌을 방지합니다.

### 2. lockfile 정리

현재 npm용 `package-lock.json`과 bun용 `bun.lock`, `bun.lockb`가 함께 존재합니다.

이 프로젝트는 Lovable/Vite 환경에서 `bun.lock`을 사용하고 있으므로, 다음 방향으로 정리합니다.

```text
- bun.lock 재생성
- 오래된 package-lock.json은 필요 여부 확인 후 제거 또는 동기화
- bun.lockb는 현재 환경에서 불필요하면 제거
```

목표는 패키지 매니저 lockfile이 서로 다른 의존성 상태를 가리키지 않도록 만드는 것입니다.

### 3. 의존성 재설치

정리 후 의존성을 새로 설치합니다.

예상 작업:

```text
- node_modules 정리
- bun install 실행
- lockfile 재생성 확인
```

### 4. 빌드 검증

의존성 재설치 후 아래를 실행해 확인합니다.

```text
bun run build
```

성공 기준:

```text
- @tanstack/query-core 누락 오류가 사라짐
- Vite build가 정상 완료됨
```

만약 빌드가 이후 다른 오류에서 멈추면, 그 오류는 이번 의존성 문제와 별개로 이어서 확인합니다.

## 예상 결과

수정 후에는 다음 상태가 됩니다.

```text
1. @tanstack/query-core가 package.json에 명시됩니다.
2. lockfile이 현재 package.json과 일치하도록 재생성됩니다.
3. node_modules가 깨끗하게 재설치됩니다.
4. 기존 @tanstack/query-core 누락 빌드 오류가 해결됩니다.
```

## 검증 항목

구현 후 확인할 항목:

```text
- package.json에 @tanstack/query-core가 추가되었는지
- lockfile이 재생성되었는지
- bun install이 정상 완료되는지
- bun run build가 기존 query-core 오류 없이 진행되는지
- 최근 수정한 Progress 탭 및 Dashboard 코드가 빌드에 포함되어 정상 컴파일되는지
```
