
## 수정 계획: Owner Code를 Subcontractor User Management에 반영 + build error 해결

요청하신 기준을 반영해 `Subcontractor Issue No` 자동 생성 포맷은 아래로 확정합니다.

```text
SC-{OWNER_CODE}-{SEQ}
```

예시:

```text
SC-ABC-00001
SC-ABC-00002
SC-ABC-10000
```

`SEQ`는 5자리 zero-padding으로 시작하되, 10,000건 이상이면 자연스럽게 `10000`, `10001`처럼 증가하도록 처리합니다.

## 1. 현재 build error 우선 해결

현재 빌드 실패 원인:

```text
src/pages/DefectDashboardPage.tsx(534,1): error TS2304: Cannot find name 'TS'.
```

처리:

```text
- src/pages/DefectDashboardPage.tsx 끝부분의 stray token `TS` 제거
- 파일 마지막이 정상 TSX 구문으로 종료되도록 정리
- build 성공 확인
```

## 2. Owner Code 저장 위치

`OWNER_CODE`는 개별 defect row가 아니라 업체/책임 주체에 속하는 값이므로, `subcontractor_master`에 저장하는 방식으로 적용하겠습니다.

추가 컬럼:

```text
subcontractor_master.owner_code text nullable
```

이유:

```text
- Subcontractor/Sub-Sub master 1개당 owner code 1개가 맞음
- 같은 업체에 여러 user가 있어도 owner code가 중복 관리되지 않음
- Defect import 시 subcontractor_name/subsub_name 기준으로 owner_code를 안정적으로 조회 가능
- User Management에서는 linked master의 owner_code를 함께 표시/편집 가능
```

## 3. Admin 화면 반영

### 3-1. Subcontractor / HDEC PIC 관리 탭

`Admin Workspace > Subcontractor / HDEC PIC`의 `Subcontractor Master` 영역에 `Owner Code` 컬럼을 추가합니다.

적용 대상:

```text
- Subcontractors table
- Sub-Subs table
```

기능:

```text
- owner_code 표시
- inline edit 가능
- 신규 Subcontractor/Sub-Sub 추가 시 owner_code 자동 제안 또는 입력 가능
```

Owner Code validation:

```text
- 영문 대문자 + 숫자만 허용
- 공백/특수문자는 제거 또는 저장 전 정규화
- 권장 길이: 2~12자
- 저장값은 항상 uppercase
```

### 3-2. User Management 탭

요청하신 “subcontractor user manage에 같이 기록” 기준으로 `Admin Workspace > Users`에도 Owner Code를 함께 표시합니다.

반영:

```text
- User Management table에 Owner Code 컬럼 추가
- Export Excel에 Owner Code 컬럼 추가
- Create User / Edit User dialog에서 subcontractor 또는 sub-sub user를 선택하면 linked master의 owner_code를 표시
- 필요 시 해당 dialog에서 owner_code를 업데이트할 수 있게 처리
```

주의:

```text
Owner Code 자체는 profiles가 아니라 subcontractor_master에 저장하고,
User Management에서는 linked master 값을 보여주는 방식으로 관리합니다.
```

## 4. 기존 데이터 owner_code 초기화

기존 `subcontractor_master` row 중 `owner_code`가 비어 있는 경우, 이름 기반으로 기본값을 생성합니다.

생성 규칙:

```text
1. 업체명에서 영문/숫자만 추출
2. 회사 suffix/co/ltd/company 등은 가능한 제거
3. 2~12자 uppercase code 생성
4. 중복되면 뒤에 숫자 suffix 부여
```

예시:

```text
ABC Engineering Ltd     -> ABC
Hyundai E&C             -> HYUNDAI
Samsung C&T             -> SAMSUNG
Unknown / blank fallback -> UNASSIGNED
중복 발생 시             -> ABC2, ABC3
```

## 5. Subcontractor Issue No 자동 생성 로직

확정 포맷:

```text
SC-{OWNER_CODE}-{SEQ}
```

생성 기준 owner:

```text
1순위: subsub_name에 매칭되는 subcontractor_master.owner_code
2순위: subcontractor_name에 매칭되는 subcontractor_master.owner_code
3순위: team 기반 fallback owner code
4순위: UNASSIGNED
```

Sequence 계산:

```text
- 같은 owner_code의 기존 subcontractor_issue_no 중 SC-{OWNER_CODE}-{number} 패턴 조회
- 가장 큰 number + 1부터 시작
- 5자리 padding 적용
```

예시:

```text
기존:
SC-ABC-00001
SC-ABC-00002
SC-ABC-10452

다음 자동 생성:
SC-ABC-10453
```

## 6. Import 중 중복 방지

`DefectImportPage` import 로직에 아래 map을 추가합니다.

```text
existingKeys:
- DB에 이미 존재하는 subcontractor_issue_no

reservedKeys:
- 현재 import 실행 중 이미 사용 예약된 subcontractor_issue_no
```

처리 규칙:

```text
Excel row에 subcontractor_issue_no 있음
→ 그대로 사용
→ source = imported
→ 같은 owner scope 안에서 중복이면 row reject

Excel row에 subcontractor_issue_no 없음
→ SC-{OWNER_CODE}-{SEQ} 자동 생성
→ source = auto_generated
→ existingKeys/reservedKeys와 충돌하면 SEQ 증가

기존 defect update이며 기존 subcontractor_issue_no 있음
→ 기존 번호 보존
→ import 값으로 덮어쓰지 않음
```

## 7. Manual 입력 중복 방지

`DefectDetailPage`에서 사용자가 `subcontractor_issue_no`를 직접 수정할 때도 같은 기준으로 중복을 검사합니다.

검사 기준:

```text
project_id
+ owner_code
+ subcontractor_issue_no
+ is_active = true
+ 현재 defect id 제외
```

중복이면 저장 차단:

```text
"Subcontractor Issue No already exists for this owner."
```

수동 저장 성공 시:

```text
subcontractor_issue_source = manual
```

## 8. DB 보호 장치

동시 import race condition을 막기 위해 DB level unique index도 추가합니다.

권장 index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS defect_items_subcontractor_issue_unique
ON public.defect_items (
  COALESCE(project_id::text, ''),
  lower(trim(subcontractor_issue_no))
)
WHERE subcontractor_issue_no IS NOT NULL
  AND trim(subcontractor_issue_no) <> ''
  AND is_active = true;
```

`subcontractor_issue_no` 자체가 `SC-{OWNER_CODE}-{SEQ}` 형태로 owner code를 포함하므로, 실제 번호 문자열 기준 unique로 관리하는 것이 가장 안전합니다.

적용 전:

```text
- 기존 defect_items 중 subcontractor_issue_no 중복 현황 조회
- 중복이 있으면 index 생성 전 목록을 확인하고 정리 필요
```

## 9. 수정 대상

```text
src/pages/DefectDashboardPage.tsx
- stray TS token 제거

src/pages/AdminPage.tsx
- Subcontractor Master에 Owner Code 컬럼/입력/편집 추가
- User Management table/export/dialog에 Owner Code 표시 및 linked master update 반영

src/lib/defect-utils.ts
- owner_code 정규화/generation helper 추가
- SC-{OWNER_CODE}-{SEQ} 생성 helper 추가

src/pages/DefectImportPage.tsx
- owner_code lookup
- 기존 DB 번호 prefetch
- existingKeys/reservedKeys 기반 중복 방지
- 빈 subcontractor_issue_no 자동 생성
- 기존 번호 보존
- imported duplicate row reject

src/pages/DefectDetailPage.tsx
- manual subcontractor_issue_no 중복 검사
- manual 저장 시 source = manual

supabase/functions/auto-create-master-user/index.ts
- master 기반 user 생성 시 owner_code가 필요한 경우 linked master 기준으로 유지

supabase/migrations/*
- subcontractor_master.owner_code 컬럼 추가
- owner_code 정규화/중복 방지 index 추가
- defect_items subcontractor_issue_no unique index 추가
```

## 10. 검증 항목

```text
1. DefectDashboardPage TS2304: Cannot find name 'TS' 해결
2. build 성공
3. Subcontractor Master에서 owner_code 표시/편집 가능
4. User Management에서 subcontractor/sub-sub user의 owner_code 확인 가능
5. User export Excel에 Owner Code 포함
6. 신규 master 추가 시 owner_code 생성 또는 입력 가능
7. Defect import에서 빈 subcontractor_issue_no는 SC-{OWNER_CODE}-{00001} 형식으로 생성
8. SEQ는 5자리로 시작하고 10000 이상도 정상 증가
9. 기존 DB 최대 SEQ 다음 번호부터 생성
10. 같은 import session 내 번호 중복 없음
11. 기존 defect update 시 기존 subcontractor_issue_no 보존
12. Excel imported 번호가 중복이면 row reject 및 import log 기록
13. Detail page manual 입력 시 중복이면 저장 차단
14. 기존 Raw Data / Detail / Export 표시 기능 유지
