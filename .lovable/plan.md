## Defect Import의 Subcontractor Issue No 정렬 규칙 수정

### 현재 확인된 원인
현재 `src/contexts/DefectImportContext.tsx` 의 `buildSubcontractorIssueAssignments()` 는:
- import 파일의 `Issue No` 흐름을 `detectIssueNoSortDirection()` 으로 먼저 판별하고
- `desc` 로 판단되면 높은 `Issue No` 부터 낮은 SC 번호를 부여하도록 정렬합니다.

즉, 지금 로직은 “파일 표시 순서 유지” 기준이고,
사용자 요구사항인 “항상 가장 작은 Issue No 가 가장 작은 SC 번호를 가져야 함” 기준과 다릅니다.

또한 현재 테스트(`src/test/defect-import-issue-assignment.test.ts`)도 이 기존 동작을 맞다고 가정하고 있어 함께 수정이 필요합니다.

### 목표 규칙
Subcontractor별 자동 생성 SC 번호는 import 파일이 오름차순이든 내림차순이든 상관없이 항상 아래 규칙을 따르도록 변경합니다.

```text
같은 Subcontractor(owner code) 내부에서
Issue No가 작은 row → 더 작은 SC-XXX-00001
Issue No가 큰 row   → 더 큰 SC-XXX-00002, 00003 ...
```

예:
```text
GRB rows: Issue No 1, 25, 2071
→ SC-GRB-00001, SC-GRB-00002, SC-GRB-00003
```

### 변경 내용

**1. 자동 생성 번호 정렬 기준 단순화** (`src/contexts/DefectImportContext.tsx`)
- `buildSubcontractorIssueAssignments()` 에서 auto-generated 대상 row들을 항상 `compareIssueNoAsc(a.issue_no, b.issue_no)` 기준으로 정렬
- `detectIssueNoSortDirection()` 결과로 asc/desc 분기하는 로직 제거
- owner code 별 시퀀스 증가 방식(`nextSeqByOwner`)은 유지
- imported SC 번호 / 기존 DB에 이미 존재하는 SC 번호를 보존하는 규칙은 그대로 유지

핵심적으로:
```text
기존: 파일이 desc면 높은 Issue No가 낮은 SC 번호를 가져감
변경: 파일 순서와 무관하게 낮은 Issue No가 낮은 SC 번호를 가져감
```

**2. 관련 테스트 기대값 전면 정리** (`src/test/defect-import-issue-assignment.test.ts`)
- descending import 케이스의 기대값을 새 규칙에 맞게 수정
- 특히 다음 케이스를 명확히 검증:
  - import가 ascending 이어도 올바름
  - import가 descending 이어도 결과는 동일 규칙
  - alphanumeric Issue No (`D-1`, `D-2`, `D-10`) 도 natural ascending 기준 적용
  - 여러 subcontractor가 섞여 있어도 각 owner code 별로 독립 시퀀스 유지
  - 기존 DB max sequence가 있을 때도 가장 작은 Issue No부터 이어서 배정

**3. 정렬 감지 함수의 역할 재정리**
- `detectIssueNoSortDirection()` 는 더 이상 SC 번호 자동 생성 순서 결정에 사용하지 않게 됨
- 선택지:
  - 완전히 미사용이면 제거
  - 다른 테스트/호환성 때문에 유지가 필요하면 export는 유지하되 번호 배정 로직에서는 사용하지 않음

구현 시 실제 사용처를 다시 확인해 가장 간단한 방향으로 정리합니다.

### 변경하지 않는 항목
- DB schema / RLS / migration
- 기존 defect row의 저장 데이터 자동 재정렬
- 수동 입력된 `subcontractor_issue_no`
- 기존 defect에 이미 저장된 SC 번호 보존 규칙
- 상세화면에서 subcontractor 변경 시 재발급하는 별도 로직

### 중요한 범위 메모
지금 수정은 **향후 import되는 데이터의 자동 번호 부여 규칙 수정**입니다.
이미 DB에 저장된 과거 SC 번호들(예: 현재 GRB 데이터)은 이 변경만으로 자동 재배치되지 않습니다.
기존 데이터까지 정정하려면 별도의 보정 작업 계획이 추가로 필요합니다.

### 검증 기준
```text
1. Asc import: Issue No 1,2,3 → SC-XXX-00001, 00002, 00003
2. Desc import: Issue No 3,2,1 → 최종 배정은 Issue No 1=00001, 2=00002, 3=00003
3. Mixed subcontractors: owner code마다 독립 시퀀스 유지
4. Existing max seq=304 일 때 다음 import의 가장 작은 Issue No가 305부터 시작
5. Imported subcontractor_issue_no가 이미 있으면 자동 생성보다 우선
6. Existing defect의 subcontractor_issue_no가 있으면 그대로 유지
7. D-1, D-2, D-10 같은 자연정렬도 낮은 번호부터 낮은 SC 번호 배정
```

### 영향 파일
```text
EDIT  src/contexts/DefectImportContext.tsx
EDIT  src/test/defect-import-issue-assignment.test.ts
```

### Technical details
- 현재 원인 코드:
  - `detectIssueNoSortDirection(rows)`
  - `direction === 'desc' ? compareIssueNoAsc(b.issue_no, a.issue_no) : compareIssueNoAsc(a.issue_no, b.issue_no)`
- 수정 방향:
  - 위 분기를 제거하고 항상 ascending comparator 사용
- comparator는 이미 `Intl.Collator(..., { numeric: true })` 기반이라 자연정렬 재사용 가능
- DB 변경이 없어 migration은 필요 없음