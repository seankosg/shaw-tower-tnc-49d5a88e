
## 구현 계획: Defect Import 전 협력사 유사명 확인 대화창 추가

Defect Management Import 시 Excel에 있는 협력사명이 기존 Master에 완전히 일치하지 않더라도, 기존 등록 협력사와 유사하면 즉시 신규 등록하지 않고 사용자에게 확인 대화창을 띄우도록 구현합니다.

```text
현재 동작
- Excel 협력사명과 Master명이 완전 일치하지 않음
- 신규 Subcontractor Master로 자동 등록
- 신규 로그인 사용자도 자동 생성

변경 후 동작
- Excel 협력사명과 Master명이 완전 일치하지 않음
- 기존 Master와 유사한 이름이 있으면 Import 전 확인
- 사용자가 기존 업체로 매핑할지, 신규 업체로 등록할지 선택
- 선택 결과에 따라 defect_items / Master / 사용자 생성 처리
```

## 1. 적용 대상

우선 협력사 관련 Master에 적용합니다.

```text
subcontractor_name
subsub_name
```

HDEC PIC는 “업체명”이 아니므로 이번 범위에서는 자동 유사명 확인 대상에서 제외하고, 기존 방식대로 정확히 일치하지 않으면 신규 등록 로직을 유지합니다.

## 2. 유사명 판단 기준

Import 실행 전, 파일에 포함된 협력사명을 기존 `subcontractor_master`와 비교합니다.

비교 시 단순 대소문자 차이뿐 아니라 아래 차이를 완화해서 판단합니다.

```text
- 대소문자 차이
- 앞뒤 공백
- 중복 공백
- 점, 쉼표, 하이픈 등 일부 기호
- Co., Ltd / Co Ltd / Ltd / Pte Ltd 등 회사명 suffix 차이
- Corporation / Corp 등 약어 차이
```

예시:

```text
Excel: ABC Engineering Co., Ltd
Master: ABC Engineering

→ 유사 업체 후보로 표시
```

## 3. Import 전 Preflight 단계 추가

`Execute Import` 버튼 클릭 후 실제 DB 등록 전에 Preflight 검사를 먼저 실행합니다.

```text
1. 선택된 Defect Import 파일들의 parsed rows 확인
2. 파일 안의 subcontractor_name / subsub_name 수집
3. 기존 Master와 정확히 일치하는 이름은 통과
4. 정확히 일치하지 않지만 유사한 기존 Master가 있으면 pending decision 생성
5. pending decision이 있으면 실제 import를 중단하고 확인 Dialog 표시
6. 사용자가 모든 항목을 결정하면 실제 import 시작
```

즉, row loop 안에서 바로 Master를 생성하지 않고, Import 전에 먼저 판단하도록 순서를 바꿉니다.

## 4. 확인 Dialog UI

Defect Import 화면에 아래 형태의 대화창을 추가합니다.

UI 문구는 앱 정책에 따라 영어로 표시합니다.

```text
Possible Existing Subcontractors Found

Imported Name              Similar Existing Master              Action
ABC Engineering Co., Ltd   ABC Engineering                      [Use Existing] [Register New]
XYZ M&E Pte Ltd            XYZ M&E                              [Use Existing] [Register New]
```

각 항목별 선택지는 다음과 같습니다.

```text
Use Existing
- 기존 Master 업체와 동일 업체로 판단
- Excel의 업체명을 기존 Master의 표준 이름으로 치환
- 신규 Master / 신규 사용자 생성하지 않음

Register New
- 기존 업체와 다른 별도 업체로 판단
- 기존 자동 등록 로직대로 신규 Master 생성
- 신규 로그인 사용자 자동 생성
```

동일한 Excel 업체명이 여러 row에 반복되어도 Dialog에는 한 번만 표시하고, 선택 결과를 모든 row에 동일하게 적용합니다.

## 5. 매핑 결과 반영 방식

사용자가 `Use Existing`을 선택하면 해당 Import 세션에서는 row 값을 기존 Master 기준으로 표준화합니다.

예시:

```text
Excel row subcontractor_name:
ABC Engineering Co., Ltd

사용자 선택:
Use Existing → ABC Engineering

DB 저장 defect_items.subcontractor_name:
ABC Engineering
```

Sub-Subcontractor도 parent subcontractor 기준과 함께 처리합니다.

```text
Excel:
subcontractor_name = ABC Engineering Co., Ltd
subsub_name = ABC ELV Team

선택 결과:
subcontractor_name → ABC Engineering

Sub-sub 등록/확인 시:
parent = ABC Engineering 기준으로 처리
```

## 6. 신규 등록 전 차단 보장

현재 Defect Import는 `createDefectMasterEnsurer(...).ensureForRow(row)`에서 Master를 즉시 생성합니다.

이를 다음 구조로 변경합니다.

```text
Before:
row 처리 중 ensureForRow(row)
→ 유사명 확인 없이 즉시 신규 등록 가능

After:
startImport()
→ preflightSimilarMasterDecisions()
→ decision map 생성
→ importOneFile()
→ decision map을 적용한 row로 ensureForRow(row)
```

이렇게 해서 유사 업체가 발견된 경우에는 사용자가 선택하기 전까지 신규 Master가 생성되지 않도록 합니다.

## 7. 수정 대상 파일

```text
src/pages/DefectImportPage.tsx
src/lib/defect-master-autocreate.ts
```

필요 시 유사도 계산 유틸을 별도 파일로 분리할 수 있습니다.

```text
src/lib/master-name-match.ts
```

## 8. DB 변경 여부

이번 구현에는 DB schema 변경이 필요 없습니다.

사용자 선택 결과는 해당 Import 실행에만 적용합니다.

```text
- 기존 Master를 선택한 경우: defect_items에 기존 Master 이름 저장
- 신규 등록을 선택한 경우: 기존 자동 등록 로직 사용
```

향후 같은 유사명에 대해 반복 확인을 줄이려면 별도 alias 테이블을 추가할 수 있지만, 이번 요청 범위에서는 “등록 전에 확인 Dialog 표시”에 집중합니다.

## 9. Import 흐름 변경 후 최종 동작

```text
1. Defect Excel 업로드
2. Data Date 선택
3. Team 선택
4. Execute Import 클릭
5. 기존 subcontractor_master와 유사명 비교
6. 유사 업체가 있으면 Dialog 표시
7. 사용자가 Use Existing 또는 Register New 선택
8. 선택 결과를 모든 parsed row에 반영
9. 실제 Defect Import 실행
10. 기존 업체 선택 항목은 신규 Master/User 생성하지 않음
11. 신규 등록 선택 항목만 Master/User 자동 생성
12. defect_items insert/update
13. Schedule Revision / Daily Snapshot / Import Logs 기존처럼 처리
```

## 10. 검증 항목

```text
1. Excel 협력사명이 기존 Master와 완전 일치하면 Dialog 없이 import됨
2. Excel 협력사명이 기존 Master와 유사하지만 완전 일치하지 않으면 Dialog가 표시됨
3. Use Existing 선택 시 defect_items.subcontractor_name이 기존 Master명으로 저장됨
4. Use Existing 선택 시 신규 subcontractor_master가 생성되지 않음
5. Use Existing 선택 시 신규 로그인 사용자가 생성되지 않음
6. Register New 선택 시 기존 자동 등록 로직대로 Master가 생성됨
7. Register New 선택 시 신규 로그인 사용자가 자동 생성됨
8. 동일한 Excel 업체명이 여러 row에 있어도 Dialog에는 한 번만 표시됨
9. 선택 결과가 해당 파일의 모든 row에 일관되게 적용됨
10. subsub_name 처리 시 선택된 parent subcontractor 기준으로 연결됨
11. Dialog 결정 전에는 실제 import batch / master insert가 실행되지 않음
12. 기존 Data Date / Team / Schedule Revision / Import Summary 기능이 유지됨
```
