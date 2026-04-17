

## Login ID 자동 제안 규칙: Subcontractor/Sub-Sub은 회사명 축약 6글자

### 요구사항
- Subcontractor / Sub-Sub 마스터 자동 생성 시 → login_id를 **회사명 축약 6글자**로 제안
- HDEC PIC는 기존 방식 유지 (이름 기반)
- 중복 시 suffix 추가 (`_2`, `_3`...)

### 축약 규칙 설계 (6글자 목표)
신규 edge function `auto-create-master-user`에서 사용:

```
입력: "Hyundai Elevator Co., Ltd."
1. 소문자화 + 특수문자 제거 → "hyundai elevator co ltd"
2. 단어 분리 → ["hyundai","elevator","co","ltd"]
3. 불용어 제거 (co, ltd, inc, corp, corporation, company, llc, group, eng, engineering) 
   → ["hyundai","elevator"]
4. 6글자 생성 로직:
   - 단어 1개: 앞 6글자 → "hyunda"
   - 단어 2개: 첫 단어 3글자 + 둘째 단어 3글자 → "hyu" + "ele" = "hyuele"
   - 단어 3개+: 각 단어 첫 2글자, 6글자 채울 때까지 → "hyelco"
5. 6글자 미달 시: 원문에서 a-z0-9 추가 채움
6. 6글자 초과 시: 앞 6글자만
7. 결과 검증: ^[a-z0-9_]{3,32}$
```

예시:
- "Hyundai Elevator" → `hyuele`
- "ABC Engineering" → `abcabc` → 불용어 제거 후 "abc" → 6자 채움 `abc000`? 
  - **수정**: 불용어 제거 후 단어가 1개로 줄면 그 단어 반복/패딩보다는 앞 6글자(불용어 포함) 사용 → `abceng`
- "삼성물산" (한글) → ASCII 변환 불가 → fallback: `sub_` + 랜덤 6숫자 (`sub_123456`)

규칙 보완:
```
불용어 제거 후 결과가 3글자 미만이면 → 불용어 포함하여 다시 시도
모든 ASCII 변환 실패 시 → "sub_" + 6자리 랜덤 숫자
```

### 중복 처리
```ts
let candidate = baseId;
let n = 2;
while (await loginIdExists(candidate)) {
  candidate = `${baseId.slice(0, 5)}${n}`; // 6글자 유지: hyuele → hyule2, hyule3
  n++;
  if (n > 99) candidate = `${baseId}_${n}`; // fallback 길이 무시
}
```

### HDEC PIC는 별도 규칙 (기존 유지)
- 사람 이름 → `john_kim` 형태 (snake_case, 길이 제한 없음, 3-32자 내)
- "John Kim" → `john_kim`
- "김철수" → ASCII 변환 불가 → `pic_` + 랜덤 6숫자

### 변경 파일 (이전 승인 플랜에 추가)
| 파일 | 변경 |
|------|------|
| `supabase/functions/auto-create-master-user/index.ts` | `suggestLoginId(name, type)` 헬퍼에 위 규칙 구현, type=`subcontractor`\|`subsub` → 6글자 축약, type=`hdec_pic` → snake_case |

### 사용자 시나리오
1. Import → "Hyundai Elevator Co." → 자동 마스터 생성 → login_id `hyuele` 제안 → 사용자 자동 생성 (PW: SHAW00)
2. Import → "Hyundai Elevator Engineering" 추가 → `hyuele` 중복 → `hyule2` 제안
3. Admin → Users 탭 → `hyuele` → "Edit Login ID" → 원하는 ID로 수정 가능 (이전 플랜의 `admin-update-login-id`)
4. HDEC PIC "John Kim" → `john_kim` 그대로 유지

### 나머지는 직전 승인 플랜과 동일
- Import 시 `ensureMaster` → 신규 시 edge function 호출
- Admin에서 마스터 이름 수정 → `subtests` + `profiles` 연쇄 업데이트
- Admin 활성/비활성 토글 → 비활성 항목은 자동 등록 캐시에서 제외
- 비밀번호 기본값 `SHAW00`, `must_change_password: true`

