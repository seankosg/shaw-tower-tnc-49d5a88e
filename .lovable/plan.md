
## 변경 목표

일반 사용자도 로그인 후 본인의 비밀번호를 직접 변경할 수 있게 하고, 기존 Admin의 사용자 비밀번호 reset 권한은 그대로 유지합니다.

## 구현 방향

### 1. 기존 `ChangePassword` 페이지 재사용 및 개선

현재 `/change-password` 페이지는 이미 존재하며, Admin reset 후 `must_change_password` 상태인 사용자가 강제로 비밀번호를 바꾸는 용도로 사용되고 있습니다.

이 페이지를 다음 두 상황 모두에서 사용할 수 있게 개선합니다.

```text
1. Admin reset 후 강제 변경
2. 일반 사용자의 자발적 비밀번호 변경
```

### 2. 일반 사용자 접근 경로 추가

현재 일반 사용자가 직접 `/change-password`로 이동할 UI가 없습니다.

`src/components/layout/AppLayout.tsx` 상단 오른쪽 영역에 사용자 계정 메뉴를 추가합니다.

예상 구성:

```text
[사용자명 또는 Login ID]
  - Change Password
  - Sign Out
```

`Change Password` 클릭 시 `/change-password`로 이동합니다.

### 3. 현재 비밀번호 확인 추가

일반 사용자가 본인의 비밀번호를 변경할 때는 보안을 위해 현재 비밀번호를 먼저 확인합니다.

`ChangePassword.tsx`에 입력 필드를 추가합니다.

```text
Current Password
New Password
Confirm New Password
```

처리 방식:

```text
1. 현재 비밀번호 입력
2. 현재 로그인 ID와 현재 비밀번호로 재인증
3. 재인증 성공 시 새 비밀번호로 변경
4. 변경 성공 시 profile.must_change_password = false 처리
```

이렇게 하면 로그인된 사용자가 세션만 가진 상태에서 현재 비밀번호 없이 임의로 변경하는 것을 방지할 수 있습니다.

### 4. Admin reset 권한 유지

Admin의 기존 reset 기능은 그대로 유지합니다.

현재 구조:

```text
Admin Page
→ admin-reset-password backend function 호출
→ 대상 사용자 비밀번호를 SHAW00으로 reset
→ must_change_password = true
```

이 흐름은 변경하지 않습니다.

Admin이 reset한 사용자는 다음 로그인 후 기존처럼 `/change-password`로 이동하여 새 비밀번호를 설정합니다.

### 5. 강제 변경 / 자발적 변경 문구 분리

`ChangePassword.tsx`에서 현재 사용자의 `must_change_password` 값에 따라 제목/설명을 다르게 표시합니다.

```text
must_change_password = true
- 제목: Change Password
- 설명: You must set a new password before continuing.

must_change_password = false
- 제목: Change Password
- 설명: Update your login password.
```

별도의 긴 안내 문구는 추가하지 않습니다.

### 6. 변경 후 이동 처리

비밀번호 변경 성공 후 이동 경로를 상황별로 정리합니다.

```text
Admin reset 후 강제 변경:
→ Dashboard 또는 Raw Data로 이동

일반 사용자 자발적 변경:
→ 이전 화면 또는 Dashboard로 이동
```

간단하고 안정적으로는 성공 후 `/dashboard`로 이동하도록 처리합니다.

## 수정 예상 파일

```text
src/pages/ChangePassword.tsx
src/components/layout/AppLayout.tsx
```

필요 시 계정 메뉴 아이콘 추가를 위해 기존 설치된 `lucide-react` 아이콘을 사용합니다.

## 데이터베이스 변경 여부

데이터베이스 변경은 필요 없습니다.

기존 컬럼을 그대로 사용합니다.

```text
profiles.must_change_password
```

## 최종 동작

```text
일반 사용자
→ 로그인
→ 상단 계정 메뉴
→ Change Password
→ 현재 비밀번호 확인
→ 새 비밀번호 저장

Admin
→ Admin Page
→ 기존 Reset Password 기능 사용
→ 대상 사용자 비밀번호 SHAW00으로 reset
→ 대상 사용자는 다음 로그인 시 강제로 비밀번호 변경
```
