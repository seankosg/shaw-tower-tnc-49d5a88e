
## 확인 결과

현재 T&C Management의 Import는 단순히 `subtests` 데이터만 넣는 방식이 아니라, Import 파일 안에 등장하는 담당/업체 정보를 기준으로 Master와 사용자를 자동 등록합니다.

반면 현재 Defect Management Import에는 같은 로직이 아직 완전히 반영되어 있지 않습니다.

즉, 현재 상태는 아래와 같습니다.

```text
T&C Import
- Subcontractor Master 자동 등록
- Sub-Subcontractor Master 자동 등록
- HDEC PIC Master 자동 등록
- 각 Master별 로그인 사용자 자동 생성
- 기본 비밀번호 부여
- user_roles에 user role 부여

Defect Import
- defect_items import / update
- Data Date 저장
- Team 저장
- Schedule Revision 기록
- Daily Snapshot 기록
- 그러나 Master 자동 등록 / 사용자 자동 생성 로직은 아직 없음
```

---

## T&C Import의 현재 동작 방식

T&C Import는 각 row를 처리하면서 아래 필드를 확인합니다.

```text
subcontractor_name
subsub_name
hdec_pic_name
```

각 값이 기존 Master에 없으면 자동으로 등록합니다.

### 1. Subcontractor 자동 등록

```text
Excel row의 subcontractor_name 확인
→ subcontractor_master에 같은 이름이 없으면 insert
→ type = sub
→ auto-create-master-user backend function 호출
→ 해당 Subcontractor용 로그인 사용자 자동 생성
```

### 2. Sub-Subcontractor 자동 등록

```text
Excel row의 subsub_name 확인
→ subcontractor_master에 같은 이름이 없으면 insert
→ type = subsub
→ parent_subcontractor_id 연결
→ auto-create-master-user backend function 호출
→ 해당 Sub-Subcontractor용 로그인 사용자 자동 생성
```

### 3. HDEC PIC 자동 등록

```text
Excel row의 hdec_pic_name 확인
→ hdec_pic_master에 같은 이름이 없으면 insert
→ auto-create-master-user backend function 호출
→ 해당 HDEC PIC용 로그인 사용자 자동 생성
```

### 4. 자동 생성 사용자 규칙

자동 생성 사용자는 아래 규칙으로 생성됩니다.

```text
login_id: 이름 기반 자동 생성
password: 기본 비밀번호
role: user
must_change_password: true
```

즉, 사용자는 최초 로그인 후 비밀번호 변경 대상이 됩니다.

---

## Defect Management에 적용해야 하는 방식

Defect Management도 T&C와 동일한 운영 구조가 되어야 하므로, Defect Import 시에도 아래 필드 기준으로 Master 및 User 자동 등록을 구현하겠습니다.

```text
subcontractor_name
subsub_name
hdec_pic_name
```

Defect Import 파일에서 위 값들이 들어오면 다음 순서로 처리합니다.

```text
1. 기존 Master 존재 여부 확인
2. 없으면 Master 자동 등록
3. Master 등록 후 auto-create-master-user 호출
4. 이미 같은 Master 사용자 profile이 있으면 중복 생성하지 않음
5. 생성 실패 시 Import 자체는 계속 진행하되 warning으로 표시
```

---

## 구현 계획

### 1. Defect Import에 Master Cache 로직 추가

`src/pages/DefectImportPage.tsx`의 Import 실행 시작 시점에 기존 Master 데이터를 불러옵니다.

```text
subcontractor_master
hdec_pic_master
profiles
```

메모리 cache를 구성합니다.

```text
subconCache
subsubCache
hdecCache
```

이 cache를 이용해 row별 중복 insert를 방지합니다.

---

### 2. Defect Import row 처리 전에 Master 자동 등록

각 Defect row를 `defect_items`에 insert/update하기 전에 아래 처리를 먼저 수행합니다.

```text
await ensureSubcontractor(row.subcontractor_name)
await ensureSubsub(row.subsub_name, row.subcontractor_name)
await ensureHdecPic(row.hdec_pic_name)
```

이 로직은 T&C Import와 동일하게 구성합니다.

---

### 3. Subcontractor 자동 등록 함수 추가

Defect Import 내부에 아래 로직을 추가합니다.

```text
ensureSubcontractor(name)
```

동작:

```text
1. name이 없으면 skip
2. 기존 subcontractor_master에 있으면 skip
3. 없으면 subcontractor_master insert
4. type = sub
5. auto-create-master-user 호출
6. 생성 실패 시 userCreateFails에 기록
```

---

### 4. Sub-Subcontractor 자동 등록 함수 추가

Defect Import 내부에 아래 로직을 추가합니다.

```text
ensureSubsub(name, parentName)
```

동작:

```text
1. subsub name이 없으면 skip
2. 기존 subsub master에 있으면 skip
3. parent subcontractor가 있으면 먼저 ensureSubcontractor 실행
4. parent_subcontractor_id 연결
5. subcontractor_master insert
6. type = subsub
7. auto-create-master-user 호출
8. 생성 실패 시 userCreateFails에 기록
```

주의사항:

```text
parentName이 없는 subsub는 parent 연결이 불명확하므로 자동 등록하지 않고 warning 처리
```

T&C 쪽에는 임의 parent fallback이 있으나, Defect에서는 데이터 정합성을 위해 parent가 없는 subsub 자동등록은 보수적으로 처리하는 것이 안전합니다.

---

### 5. HDEC PIC 자동 등록 함수 추가

Defect Import 내부에 아래 로직을 추가합니다.

```text
ensureHdecPic(name)
```

동작:

```text
1. name이 없으면 skip
2. 기존 hdec_pic_master에 있으면 skip
3. 없으면 hdec_pic_master insert
4. auto-create-master-user 호출
5. 생성 실패 시 userCreateFails에 기록
```

---

### 6. 자동 생성 사용자 규칙은 T&C와 동일하게 사용

이미 존재하는 backend function을 그대로 재사용합니다.

```text
auto-create-master-user
```

따라서 Defect Management용 별도 사용자 생성 function은 만들지 않습니다.

자동 생성되는 profile 값:

```text
Subcontractor:
- user_type = subcontractor
- subcontractor_name = imported subcontractor name

Sub-Subcontractor:
- user_type = subsub
- subcontractor_name = parent subcontractor name
- subsub_name = imported subsub name

HDEC PIC:
- user_type = hdec
- hdec_pic_name = imported HDEC PIC name
```

부여 role:

```text
user
```

---

### 7. Import 완료 후 warning 표시

T&C Import와 동일하게 사용자 자동 생성 실패 목록을 수집합니다.

예시:

```text
Some master users could not be auto-created:
- ABC Contractor (sub): duplicate login id
- HDEC PIC Name (hdec_pic): create failed
```

중요한 원칙:

```text
Master/User 자동 생성 일부 실패 때문에 전체 Defect Import를 중단하지 않음
```

Defect data import는 계속 진행하고, 실패 내역만 toast 또는 file error summary로 표시합니다.

---

### 8. Admin Master 탭과 연동

Defect Import로 자동 등록된 Master는 기존 Admin의 Master 관리 화면에서 동일하게 관리됩니다.

```text
Administration
- Subcontractor Master
- HDEC PIC Master
```

즉, Defect Management용 별도 Master 화면을 만들지 않고, T&C와 공통 Master를 사용합니다.

---

## 수정 대상 파일

```text
src/pages/DefectImportPage.tsx
```

기존 backend function은 재사용합니다.

```text
supabase/functions/auto-create-master-user/index.ts
```

DB schema 변경은 필요 없습니다.

이미 사용하는 공통 Master 테이블:

```text
subcontractor_master
hdec_pic_master
profiles
user_roles
```

---

## 구현 후 Defect Import 최종 동작

```text
1. Defect Excel 업로드
2. Data Date 선택
3. Team 선택
4. Execute Import
5. row별 Issue No 검증
6. row별 Subcontractor / Sub-Sub / HDEC PIC Master 확인
7. Master가 없으면 자동 등록
8. Master별 사용자 자동 생성
9. defect_items insert/update
10. Schedule Revision audit 기록
11. Daily Snapshot 기록
12. Import Logs 기록
13. Import Summary 표시
14. 자동 사용자 생성 실패가 있으면 warning 표시
```

---

## 검증 항목

```text
1. Defect Import 시 신규 subcontractor_name이 subcontractor_master에 등록됨
2. Defect Import 시 신규 subsub_name이 parent와 함께 subcontractor_master에 등록됨
3. Defect Import 시 신규 hdec_pic_name이 hdec_pic_master에 등록됨
4. 신규 Subcontractor Master에 대해 로그인 사용자가 자동 생성됨
5. 신규 Sub-Subcontractor Master에 대해 로그인 사용자가 자동 생성됨
6. 신규 HDEC PIC Master에 대해 로그인 사용자가 자동 생성됨
7. 이미 존재하는 Master는 중복 등록되지 않음
8. 이미 존재하는 profile/user는 중복 생성되지 않음
9. Master/User 생성 실패가 있어도 Defect Import 자체는 계속 진행됨
10. 실패 내역은 사용자에게 warning으로 표시됨
11. Admin Master 탭에서 Defect Import로 생성된 Master를 확인할 수 있음
12. Defect 권한 로직이 자동 생성된 profile 정보와 정상 연동됨
```
