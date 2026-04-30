## Goal

T&C와 Defect 두 시스템에서 import되는 HDEC 인원을 이름 기준으로 동일인으로 인식하도록 통합합니다.

핵심 원칙:
- 같은 이름의 **HDEC PIC** 는 T&C/Defect 어느 파일에서 들어오든 동일인
- 한 사람이 **HDEC PIC + HDEC ENG** 를 동시에 맡을 수 있음
- 따라서 **이름이 같으면 기본적으로 동일인** 으로 판단
- 이 경우 **새 사용자를 생성하지 않고**, 기존 HDEC 프로필에 필요한 역할 컬럼만 채움

## Scope

- `supabase/functions/auto-create-master-user/index.ts`
- `src/lib/defect-master-autocreate.ts`
- 필요 시 관련 테스트 보강

DB 스키마 변경은 필요 없습니다.

## Changes

### 1. HDEC 동일인 판정 규칙 통합

`auto-create-master-user`의 기존 HDEC 조회 로직은 PIC와 ENG를 별도 사람처럼 찾고 있습니다.

현재:
- `hdec_pic` 요청 시 `hdec_pic_name`만 검색
- `hdec_eng` 요청 시 `hdec_eng_name`만 검색

변경:
- HDEC 요청(`hdec_pic`, `hdec_eng`)이면 `profiles.user_type = 'hdec'` 범위에서
- `hdec_pic_name` 또는 `hdec_eng_name` 중 **어느 컬럼에든 같은 이름이 있으면 기존 사용자로 매칭**

즉, 같은 이름의 HDEC 인원은 역할 컬럼과 import 출처와 무관하게 한 사람으로 취급합니다.

### 2. 기존 사용자 재사용 + 역할 컬럼 백필

기존 HDEC 프로필을 찾은 경우:
- `hdec_pic` 요청인데 `hdec_pic_name`이 비어 있으면 채움
- `hdec_eng` 요청인데 `hdec_eng_name`이 비어 있으면 채움
- 이미 값이 있으면 그대로 유지

예시:
```text
기존:  jh_lee  { hdec_pic_name: 'JH Lee', hdec_eng_name: null }
새 요청: hdec_eng / 'JH Lee'
결과:  jh_lee  { hdec_pic_name: 'JH Lee', hdec_eng_name: 'JH Lee' }
```

즉, 동일인이라면 새 user를 만들지 않고 기존 프로필만 보강합니다.

### 3. 신규 생성 조건 축소

새 HDEC 사용자는 아래 조건에서만 생성합니다.
- 같은 이름으로 매칭되는 기존 HDEC 프로필이 전혀 없을 때

즉 아래 경우에는 생성하지 않습니다.
- T&C에서 이미 PIC로 생성된 이름이 Defect에서 다시 PIC로 들어온 경우
- PIC로 있던 사람이 ENG로도 들어온 경우
- ENG로 먼저 있던 사람이 PIC로 들어온 경우

### 4. 클라이언트 import 캐시 정렬

`src/lib/defect-master-autocreate.ts`에서도 현재 HDEC PIC와 HDEC ENG를 분리 캐시하고 있으므로,
이를 **사람(person) 단위 캐시**로 정리합니다.

변경 방향:
- HDEC는 `name` 기준 단일 person key로 인지
- 다만 PIC/ENG 중 어떤 역할이 이미 채워졌는지는 별도로 추적
- 같은 batch 내에서 같은 사람이 다른 역할로 다시 등장하면 호출을 완전히 막지 않고,
  필요한 경우 backend를 한 번 더 호출해 누락 역할 컬럼이 백필되도록 함

이렇게 하면 import 중에도 동일인을 중복 user로 만들지 않고, 필요한 역할 정보만 안전하게 보강할 수 있습니다.

### 5. 테스트 보강

다음 시나리오를 검증합니다.

1. 같은 이름의 HDEC PIC가 서로 다른 import 경로(T&C/Defect)에서 들어와도 기존 사용자 재사용
2. 같은 이름이 PIC → ENG 순서로 들어오면 새 user 없이 기존 프로필에 `hdec_eng_name` 추가
3. 같은 이름이 ENG → PIC 순서로 들어오면 새 user 없이 기존 프로필에 `hdec_pic_name` 추가
4. 완전히 새로운 이름일 때만 신규 user 생성
5. 동일 이름 재호출 시 `jh_le2` 같은 파생 login_id가 더 이상 생기지 않음

## Technical details

구현 방식:
- `findExistingMasterUser`에서 HDEC는 두 컬럼 OR 검색
- 기존 row를 찾으면 현재 프로필을 재조회해 누락된 HDEC 역할 컬럼만 patch
- 신규 생성 시에는 요청된 역할 컬럼만 우선 채우고, 이후 다른 역할 요청이 오면 백필 로직이 처리
- 클라이언트 측 `profileKeys` / role tracking도 이름 기준으로 통합

예상 최종 데이터 형태:
```text
profiles
- login_id: jh_lee
- user_type: hdec
- hdec_pic_name: 'JH Lee'
- hdec_eng_name: 'JH Lee'
```

## Out of scope

- subcontractor / subsub 동일인 규칙 변경
- 기존 데이터 대량 정리 마이그레이션
- 화면 UI 변경

필요하다면 구현 후 별도로, 이미 생성된 중복 HDEC 계정을 정리하는 후속 작업 계획을 추가할 수 있습니다.