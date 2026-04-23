
## 제안: Import Issue No 정렬 기준에 맞춰 Subcontractor Issue No 자동 채번

## 현재 원인

현재 Defect Import는 Excel에서 읽힌 행 순서 그대로 처리합니다.

```text
Excel row order대로 for-loop 처리
→ 빈 Subcontractor Issue No 발견 시 즉시 다음 SEQ 부여
```

따라서 원본 Excel의 `Issue No`가 내림차순이면 아래처럼 보일 수 있습니다.

```text
Issue No      Subcontractor Issue No
1005          SC-ABC-00001
1004          SC-ABC-00002
1003          SC-ABC-00003
```

데이터 자체는 중복 없이 정상 생성되지만, 사람이 볼 때 `Issue No` 방향과 `Subcontractor Issue No` 방향이 반대로 느껴져 부자연스럽습니다.

## 적용 방향

자동 생성 대상 행에 대해서는 `Issue No` 정렬 기준으로 먼저 번호를 예약한 뒤, 기존 import 행 순서대로 insert/update를 진행하도록 변경합니다.

핵심 결과:

```text
Issue No가 내림차순이면
Issue No 큰 값부터 Subcontractor Issue No도 작은 SEQ부터 부여

Issue No      Subcontractor Issue No
1005          SC-ABC-00001
1004          SC-ABC-00002
1003          SC-ABC-00003
```

즉 화면/Excel에서 보이는 Issue No 순서와 Subcontractor Issue No 증가 방향이 맞게 됩니다.

## 상세 구현 계획

### 1. `Issue No` 자연 정렬 유틸 추가

`src/pages/DefectImportPage.tsx`에 Issue No 비교 함수를 추가합니다.

정렬 기준:

```text
- 숫자가 포함된 Issue No는 numeric sorting 사용
- 예: 2 < 10, D-2 < D-10
- 영문/기호가 섞인 경우에도 안정적으로 비교
- 값이 없으면 뒤로 보냄
```

구현 방식:

```tsx
const issueNoCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});
```

그리고 다음과 같은 helper를 둡니다.

```tsx
function compareIssueNoAsc(a: string | null | undefined, b: string | null | undefined) {
  return issueNoCollator.compare(String(a ?? ''), String(b ?? ''));
}

function compareIssueNoDesc(a: string | null | undefined, b: string | null | undefined) {
  return compareIssueNoAsc(b, a);
}
```

### 2. Import 파일의 Issue No 정렬 방향 감지

원본 import 파일이 오름차순인지 내림차순인지 자동 감지합니다.

방식:

```text
1. issue_no가 있는 row만 추출
2. 인접 row 간 비교
3. 오름차순 pair 수와 내림차순 pair 수 계산
4. 내림차순 pair가 더 많으면 desc로 판단
5. 그 외는 asc로 판단
```

예시:

```text
1005, 1004, 1003 → desc
1003, 1004, 1005 → asc
D-001, D-002, D-010 → asc
```

### 3. 자동 생성 번호 사전 예약 단계 추가

현재는 각 row를 처리하면서 즉시 `reserveSubcontractorIssueNo()`를 호출합니다.

이를 아래 구조로 바꿉니다.

```text
A. import 시작 전, 전체 row에 대해 Subcontractor Issue No assignment map 생성
B. assignment map 생성 시 Issue No 정렬 방향을 기준으로 자동 생성 번호 부여
C. 실제 DB insert/update는 기존 row 순서대로 수행
```

즉, 처리 순서는 유지하지만 번호 배정 기준만 개선합니다.

이렇게 하면:

```text
- progress 표시
- raw_row_no log
- upload row log
- inserted/updated/skipped/rejected count
```

기존 동작을 유지할 수 있습니다.

### 4. 기존 번호 보존 규칙 유지

아래 케이스는 절대 바꾸지 않습니다.

```text
- 기존 defect에 subcontractor_issue_no가 이미 있으면 그대로 보존
- Excel에 subcontractor_issue_no가 입력되어 있으면 imported 값 사용
- imported 값이 기존 DB 또는 같은 import session 내에서 중복이면 reject
```

정렬 기반 자동 채번은 오직 아래 케이스에만 적용합니다.

```text
신규 defect 또는 기존 defect 중 subcontractor_issue_no가 비어 있고,
Excel에도 subcontractor_issue_no가 없는 row
```

### 5. Owner Code별로 독립 채번 유지

Subcontractor Issue No는 owner code별 sequence이므로 정렬 후에도 owner code별로 독립적으로 부여합니다.

예시:

```text
Issue No   Owner   Generated
1005       ABC     SC-ABC-00001
1004       XYZ     SC-XYZ-00001
1003       ABC     SC-ABC-00002
1002       XYZ     SC-XYZ-00002
```

기존 DB에 이미 번호가 있으면 다음 번호부터 시작합니다.

```text
기존 최대: SC-ABC-00027
신규 시작: SC-ABC-00028
```

### 6. 함수 구조 정리

`reserveSubcontractorIssueNo()`는 단일 row 즉시 예약용으로만 쓰기보다, assignment 생성 로직에서 재사용 가능한 형태로 정리합니다.

추가 예상 함수:

```tsx
function detectIssueNoSortDirection(rows: ParsedDefectRow[]): 'asc' | 'desc'

function buildSubcontractorIssueAssignments(
  rows: ParsedDefectRow[],
  registry: IssueRegistry,
  existingByIssueNo: Map<string, any>
): Map<number, IssueAssignment>
```

`Map` key는 `rawRowNo` 또는 stable row key를 사용해 원본 row와 assignment를 연결합니다.

### 7. 기존 import 루프 반영

`importOneFile()`에서 row별로 매번 DB 조회하는 구조는 유지하되, 최소한 assignment 생성에 필요한 existing 조회 결과를 재사용하도록 정리합니다.

변경 후 흐름:

```text
1. profile/team map 준비
2. master ensurer 준비
3. issue registry 준비
4. import rows에 대한 existing defect 조회 또는 map 구성
5. Issue No 정렬 방향 감지
6. Subcontractor Issue No assignment map 생성
7. 기존 row order대로 import loop 실행
8. row별 assignment를 payload에 반영
```

## 예외 처리

### Issue No가 완전히 정렬되어 있지 않은 경우

혼합 정렬이면 다수 방향을 기준으로 판단합니다.

```text
대부분 내림차순 → desc
대부분 오름차순 또는 판단 불가 → asc
```

### Issue No가 숫자형이 아닌 경우

`Intl.Collator`의 numeric compare를 사용하므로 문자열 기반 Issue No도 자연 정렬됩니다.

```text
D-2, D-10, D-11
```

### Issue No가 비어 있는 경우

기존처럼 reject 대상입니다.

```text
reason_code: missing_issue_no
```

자동 채번 대상에서 제외합니다.

## 테스트 계획

### 1. Unit test 추가

`src/test/defect-import-issue-assignment.test.ts`를 추가하거나 기존 테스트 파일에 포함합니다.

테스트 케이스:

```text
1. Issue No 오름차순 import
   1001, 1002, 1003
   → SC-ABC-00001, 00002, 00003

2. Issue No 내림차순 import
   1003, 1002, 1001
   → Excel 표시 순서 기준 SC-ABC-00001, 00002, 00003

3. 자연 정렬
   D-10, D-2, D-1
   → desc 판단 및 numeric order 유지

4. owner code별 sequence 분리
   ABC / XYZ 섞여 있어도 각 owner별 00001부터 증가

5. 기존 DB 최대 SEQ 이후부터 시작
   existing SC-ABC-00027
   → 신규 SC-ABC-00028부터

6. existing defect에 기존 subcontractor_issue_no가 있으면 보존

7. Excel imported subcontractor_issue_no가 있으면 자동 생성하지 않음

8. imported subcontractor_issue_no 중복이면 기존처럼 reject
```

### 2. Build 확인

수정 후 아래를 확인합니다.

```text
npm run build
npm run test
```

## 수정 대상 파일

```text
src/pages/DefectImportPage.tsx
src/test/defect-import-issue-assignment.test.ts
```

## 기대 결과

수정 후 Defect Import에서 원본 Excel의 `Issue No`가 내림차순이면 `Subcontractor Issue No`도 같은 표시 방향으로 자연스럽게 증가합니다.

```text
Before
Issue No      Subcontractor Issue No
1005          SC-ABC-00001
1004          SC-ABC-00002
1003          SC-ABC-00003

After
Issue No      Subcontractor Issue No
1005          SC-ABC-00001
1004          SC-ABC-00002
1003          SC-ABC-00003
```

단, 기존 데이터 보존, 중복 방지, owner code별 sequence, import log 동작은 그대로 유지합니다.
