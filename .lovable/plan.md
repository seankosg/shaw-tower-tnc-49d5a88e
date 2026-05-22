# CAT 판별 로직 - Issue Description 컬럼 추가

## 배경
현재 `verifyPriority`는 Import 행의 `description` 한 컬럼만 lower-case 변환 후 키워드 매칭에 사용함.
Parser(`defect-parser.ts`)에서 `"description"`과 `"issue description"` 헤더가 동일 필드(`description`)로 매핑되어 둘 중 마지막 값이 덮어쓰이는 구조라서, Import 파일에 두 컬럼이 함께 존재할 때 한 쪽이 누락됨.

## 변경 방향
`Description` + `Issue Description` 두 컬럼의 텍스트를 **모두** 키워드 매칭 대상에 포함시킨다. (게이트 조건 — Priority / Status / 기존 closure_status — 은 변경 없음)

## 수정 파일

### 1. `src/lib/defect-priority-verifier.ts`
- `VerifyInput`에 `issueDescription?: string | null` 필드 추가
- `verifyPriority` 내부에서 `description`과 `issueDescription`을 줄바꿈으로 합쳐 하나의 hay 문자열로 lower-case 변환 후 룰 매칭에 사용
- 합쳐서 빈 문자열이면 `no_match` 반환 (현재 동작 유지)

### 2. `src/contexts/DefectImportContext.tsx` (verifyPriority 호출부, 약 833행)
- `row.raw_payload`에서 "Issue Description" / "IssueDescription" / "issue description" 키를 대소문자 무시로 탐색하는 헬퍼로 원본 값 추출
- `issueDescription`을 입력에 추가하여 호출

```ts
const issueDescRaw = pickRawValue(row.raw_payload, ['Issue Description', 'IssueDescription', 'issue description']);
const verifyOutcome = verifyPriority(
  {
    priority: row.priority,
    description: row.description,
    issueDescription: issueDescRaw,
    importStatus: row.status,
    existingClosureStatus: existing?.closure_status,
  },
  verificationRules,
);
```

`pickRawValue`는 raw_payload key들을 lower-case + trim으로 비교해 첫 매칭 값을 문자열로 반환하는 작은 로컬 헬퍼.

## 영향 범위 / 비변경
- DB 스키마: 변경 없음
- 게이트 조건(Priority == Cat A, Status != Closed, closure_status != Done): 변경 없음
- clear / preserve / no_match 동작: 변경 없음
- 룰 데이터(`defect_priority_verification_rules`): 변경 없음
- Description 컬럼만 있는 기존 파일도 동작 동일 (issueDescription이 비면 무시)

## 테스트
- `src/test/`에 priority-verifier 전용 테스트가 없으면 추가 생략 (기존 import 통합 테스트로 회귀 확인). 필요 시 후속 작업으로 단위 테스트 추가.
