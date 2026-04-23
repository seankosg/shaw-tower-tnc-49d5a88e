
## 구현 목표

요청하신 2단계 권한 구조를 적용하겠습니다.

```text
1단계
HDEC PIC / Subcontractor / Sub-Sub 담당자 기반 수정·저장 권한 부여
단, 책임자명(Subcontractor, Sub-Sub, HDEC PIC) 변경 권한 없음

2단계
Senior User는 본인 소속 Team의 Subtest 수정·저장 권한 부여
소속 Team 내에서는 책임자명 변경 가능

Detail 화면 Save 버튼은 실제 저장 권한이 있을 때만 표시
```

## 현재 문제

현재 권한 구조는 일부 불일치가 있습니다.

```text
DB UPDATE 권한:
- 기존 can_edit_subtest
- senior_user + same team 조건 일부 존재

Detail 화면 Save 표시:
- can_edit_subtest RPC만 기준으로 판단
- senior_user same team 권한이 UI에 정확히 반영되지 않을 수 있음
- HDEC PIC 담당자명 기준 권한 없음
```

또한 현재 저장 가능한 사용자는 책임자명 필드도 같이 수정할 수 있는 구조라서, 요청하신 “담당자는 저장 가능하지만 책임자명 변경은 불가” 규칙이 분리되어 있지 않습니다.

## 권한 정책 설계

### 1. 담당자 기반 권한

아래 조건 중 하나가 맞으면 해당 Subtest 저장 권한을 부여합니다.

```text
Subcontractor 사용자:
profile.user_type = 'subcontractor'
AND profile.subcontractor_name = subtests.subcontractor_name

Sub-Sub 사용자:
profile.user_type = 'subsub'
AND profile.subsub_name = subtests.subsub_name

HDEC PIC 사용자:
profile.user_type = 'hdec'
AND profile.hdec_pic_name = subtests.hdec_pic_name
```

비교는 공백/대소문자 차이로 막히지 않도록 정규화합니다.

```text
lower(trim(value))
```

Subcontractor가 본인 하위 Sub-Sub 항목을 편집할 수 있는 기존 parent-subsub 로직은 유지합니다.

### 2. 담당자 기반 사용자의 수정 가능 필드

담당자 기반 권한자는 상태 및 진행 관련 자료를 저장할 수 있습니다.

```text
Pred Status
Pred Planned Date
Pred Actual Date
Predecessor Raw

T1 Status
T1 Planned Date
T1 Actual Date

T2 Status
T2 Planned Date
T2 Actual Date

R1 Status
Aconex Ref No
R2 Status
Remarks
Punchlist Comments
```

하지만 책임자명은 변경할 수 없습니다.

```text
Subcontractor
Sub-Sub
HDEC PIC
```

### 3. Senior User 권한

Senior User는 본인 profile.team과 Subtest.team이 같으면 저장 권한을 부여합니다.

```text
has_role(user, 'senior_user')
AND profiles.team = subtests.team
```

Senior User는 본인 팀 Subtest에 대해 책임자명 변경도 가능합니다.

```text
Subcontractor 변경 가능
Sub-Sub 변경 가능
HDEC PIC 변경 가능
```

### 4. Admin / Superuser 권한

기존처럼 전체 권한을 유지합니다.

```text
Admin / Superuser:
- 모든 Subtest 저장 가능
- 책임자명 변경 가능
- Delete 가능
```

## Backend 변경 계획

### 1. 권한 판정 함수 추가

담당자/팀 기반 권한을 일관되게 판단하기 위해 backend 함수들을 추가 또는 갱신합니다.

```text
can_update_subtest(...)
```

역할:

```text
Admin / Superuser → true
Senior User + same team → true
기존 system edit permission 보유자 → true
Subcontractor 담당 매칭 → true
Sub-Sub 담당 매칭 → true
HDEC PIC 담당 매칭 → true
그 외 → false
```

UI에서 권한 범위를 알 수 있도록 별도 함수도 추가합니다.

```text
get_subtest_edit_scope(user_id, subtest_id)
```

반환 예시:

```text
none
assigned
team
full
```

의미:

```text
none     → 저장 불가
assigned → 담당자 기반 저장 가능, 책임자명 변경 불가
team     → Senior User team 권한, 책임자명 변경 가능
full     → Admin/Superuser 또는 기존 full edit 권한
```

### 2. subtests UPDATE RLS 정책 갱신

현재 `subtests` UPDATE 정책을 새 권한 함수 기준으로 갱신합니다.

```text
Users can update permitted subtests
```

변경 후 DB 자체에서 아래 사용자의 update를 허용합니다.

```text
Admin / Superuser
기존 system edit permission 사용자
Senior User + same team
담당 Subcontractor
담당 Sub-Sub
담당 HDEC PIC
```

### 3. 책임자명 변경 방지 Trigger 추가

RLS만으로는 “수정 전 값과 수정 후 값을 비교해서 특정 컬럼 변경을 막는 것”이 제한적이므로, `subtests`에 `BEFORE UPDATE` validation trigger를 추가합니다.

담당자 기반 권한자가 아래 필드를 바꾸려고 하면 저장을 차단합니다.

```text
subcontractor_name
subsub_name
hdec_pic_name
```

허용되는 경우:

```text
Admin / Superuser
Senior User + same team
기존 full edit 권한 사용자
```

차단 메시지는 사용자가 이해할 수 있게 처리합니다.

```text
You do not have permission to change responsibility fields.
```

## Frontend 변경 계획

### 1. Subtest Detail 권한 범위 적용

수정 파일:

```text
src/pages/SubtestDetail.tsx
```

현재는 `canEditRecord: boolean`만 사용하고 있으므로, 이를 권한 범위 기반으로 바꿉니다.

```text
editScope = none | assigned | team | full
```

Save 버튼 표시 조건:

```text
editScope !== 'none'
```

즉, 권한이 없으면 Save 버튼을 아예 표시하지 않습니다.

### 2. 책임자명 입력 필드 제어

Detail 화면의 책임자명 필드는 권한 범위에 따라 제어합니다.

```text
assigned:
- Subcontractor disabled
- Sub-Sub disabled
- HDEC PIC disabled

team:
- Subcontractor editable
- Sub-Sub editable
- HDEC PIC editable

full:
- Subcontractor editable
- Sub-Sub editable
- HDEC PIC editable
```

### 3. 저장 Payload 정리

`assigned` 권한 사용자가 저장할 때는 책임자명 필드를 update payload에서 제외합니다.

```text
assigned 권한:
updatePayload에서 subcontractor_name 제외
updatePayload에서 subsub_name 제외
updatePayload에서 hdec_pic_name 제외
```

따라서 UI 조작이나 브라우저 조작이 있어도 backend trigger와 함께 이중으로 보호됩니다.

### 4. Change History 유지

변경 로그는 기존처럼 유지합니다.

```text
changed_by = 현재 사용자
change_source = app_direct_input
```

단, 권한상 저장하지 않는 책임자명 필드는 change log에도 남기지 않습니다.

## Mobile Quick Update 반영

수정 파일:

```text
src/pages/MobileUpdatePage.tsx
```

Mobile Quick Update도 동일 권한을 반영합니다.

```text
담당자 기반 권한:
- 상태/날짜/remarks 성격 필드 저장 가능
- 책임자명 변경 불가

Senior User same team:
- 책임자명 변경 가능
```

현재 Mobile 화면에는 책임자명 입력란이 있으므로, 권한에 따라 disabled 처리하거나 숨김 처리합니다.

```text
assigned → 책임자명 입력 disabled
team/full → 책임자명 입력 가능
none → Save 버튼 미표시 또는 비활성
```

## 수정 대상

```text
Backend database migration
src/pages/SubtestDetail.tsx
src/pages/MobileUpdatePage.tsx
```

필요 시 권한 helper를 별도 파일로 분리할 수 있습니다.

```text
src/lib/subtest-permissions.ts
```

## 검증 항목

구현 후 다음을 확인하겠습니다.

```text
1. HDEC PIC가 본인 hdec_pic_name과 일치하는 Subtest 저장 가능
2. HDEC PIC가 책임자명 변경 시도 시 저장 차단
3. Subcontractor가 본인 담당 Subtest 저장 가능
4. Subcontractor가 책임자명 변경 시도 시 저장 차단
5. Sub-Sub가 본인 담당 Subtest 저장 가능
6. Sub-Sub가 책임자명 변경 시도 시 저장 차단
7. Senior User가 본인 Team Subtest 저장 가능
8. Senior User가 본인 Team Subtest의 책임자명 변경 가능
9. Senior User가 타 Team Subtest 저장 불가
10. Detail 화면 Save 버튼이 권한 없을 때 미표시
11. Detail 화면 Save 버튼이 권한 있을 때 표시
12. Mobile Quick Update도 동일 권한 적용
13. Admin / Superuser 기존 권한 유지
14. 기존 change log 기록 유지
```
