# HDEC ENG 사용자 자동 등록 (완료)

## 구현 요약

엑셀 import 시 `hdec_eng_name` 발견되면 마스터 + 로그인 사용자 계정이 자동 생성됩니다. HDEC ENG profile은 Team 자동 판별에도 사용됩니다.

## 변경 사항

1. **DB 마이그레이션**
   - `profiles.hdec_eng_name text` 컬럼 추가
   - `handle_new_user()` 트리거가 `raw_user_meta_data->>'hdec_eng_name'`을 profile에 저장

2. **Edge Function `auto-create-master-user`**
   - `MasterType`에 `'hdec_eng'` 추가
   - `picSnake()` 방식으로 login_id 생성 (사람 이름)
   - `userType = 'hdec'` 매핑, `hdec_eng_name`을 user_metadata에 포함
   - `findExistingMasterUser`가 `hdec_eng_name`으로 중복 체크

3. **`src/lib/defect-master-autocreate.ts`**
   - `ensureHdecEng()`이 마스터 insert 후 `createMasterUser('hdec_eng', ...)` 호출
   - 마스터가 이미 존재해도 사용자 누락 시 자동 생성 시도 (idempotent via profileKeys)
   - profile 중복 체크용 `hdec_eng:` 키 추가

4. **`src/contexts/DefectImportContext.tsx`**
   - `buildProfileTeamMap`이 `hdec_eng_name`도 포함
   - `resolveDefectTeam` fallback chain: team → trade_detail → subcontractor → subsub → **hdec_eng** → null

5. **`src/contexts/AuthContext.tsx`**
   - Profile 인터페이스에 `hdec_eng_name` 추가

## 자동 생성 사용자 기본값
- `user_type='hdec'`, `role='user'`
- 비밀번호: `Shaw@2026!`, `must_change_password=true`
- login_id: 이름 기반 snake_case (예: "John Kim" → `john_kim`)

## 알림
- 기존 HDEC ENG 마스터 데이터에 대한 backfill은 수행되지 않음. 다음 import 시점부터 사용자가 생성됨.
- HDEC ENG 사용자는 별도 권한이 부여되지 않음 (기존 권한 함수가 `hdec_eng_name`을 참조하지 않기 때문). 필요 시 추가 정책 작업 별도 진행.
