
## 수정 목표

`Schedule Revision` 화면에 다음 3가지를 반영하겠습니다.

```text
1. Subcontractor 표시
2. Sub-Sub 표시
3. Team 표시
4. 헤더 정렬 / 필터 기능 추가
```

## 구현 방식

### 1. Schedule Revision 데이터에 Subtest 정보 연결

현재 `Schedule Revision`은 `schedule_change_audit` 기준으로 아래 정보만 표시합니다.

```text
Project
System
Row
Item No
MOS Code
Subtest ID
Pred / T1 / T2 변경 정보
```

요청하신 `Subcontractor`, `Sub-Sub`, `Team`은 `schedule_change_audit` 테이블에 직접 저장되어 있지 않고, 현재 Subtest Master DB의 `subtests` 데이터에 있습니다.

따라서 `schedule_change_audit` 조회 후, 해당 이력의 `subtest_id`를 기준으로 `subtests`에서 아래 값을 추가로 조회해 매핑하겠습니다.

```text
subtests.id
subtests.subcontractor_name
subtests.subsub_name
subtests.team
```

최종 표시 컬럼은 다음처럼 확장합니다.

```text
Changed At
Project
System
Team
Subcontractor
Sub-Sub
Row
Item No
MOS Code
Subtest ID
Pred ...
T1 ...
T2 ...
```

### 2. Team 표시 포맷 적용

Team 값은 Raw Data와 동일하게 enum label을 사용하겠습니다.

예:

```text
EL
MECH
ARCH
...
```

값이 없으면 기존 화면 규칙과 동일하게 `—`로 표시합니다.

### 3. 헤더 정렬 기능 추가

`Schedule Revision` 테이블을 `@tanstack/react-table` 기반으로 전환하거나, 현재 테이블 구조에 동일한 정렬 상태 로직을 추가하겠습니다.

정렬 가능한 주요 컬럼:

```text
Changed At
Project
System
Team
Subcontractor
Sub-Sub
Row
Item No
MOS Code
Subtest ID
Pred Diff
T1 Diff
T2 Diff
Pred Prev.Gap / Cur.Gap
T1 Prev.Gap / Cur.Gap
T2 Prev.Gap / Cur.Gap
```

헤더 클릭 시 동작:

```text
1회 클릭: 오름차순
2회 클릭: 내림차순
3회 클릭: 정렬 해제
```

Raw Data와 동일하게 정렬 방향을 `▲ / ▼`로 표시하겠습니다.

### 4. 헤더 필터 기능 추가

각 컬럼 헤더에 필터 아이콘을 추가합니다.

필터 방식은 컬럼 타입별로 나눕니다.

```text
Text filter:
Project, System, Subcontractor, Sub-Sub, Item No, MOS Code, Subtest ID

Multi-select filter:
Team

Date range filter:
Changed At
Pred Old/New date
T1 Old/New date
T2 Old/New date

Numeric/text filter:
Row
Diff
Prev.Gap
Cur.Gap
```

필터가 적용된 컬럼은 필터 아이콘 색상을 활성 상태로 표시합니다.

상단에는 현재 필터 개수와 초기화 버튼을 추가합니다.

```text
Clear filters (N)
Clear sort
```

### 5. 기존 행 클릭 동작 유지

기존 동작은 유지합니다.

```text
Schedule Revision 행 클릭
→ /subtests/{subtest_id}
```

### 6. 기존 Import Logs 화면은 변경하지 않음

이번 수정은 별도 탭인 `Schedule Revision` 화면만 대상으로 합니다.

```text
src/pages/ScheduleRevisionPage.tsx
```

`Import Logs > Schedule Changes` 화면은 기존 구조 그대로 유지합니다.

## 수정 대상 파일

```text
src/pages/ScheduleRevisionPage.tsx
```

필요 시 Raw Data에서 이미 사용 중인 필터 UI 패턴을 참고하되, 공통 컴포넌트로 분리하지 않고 우선 Schedule Revision 화면 안에 적용하겠습니다.

## 검증 항목

구현 후 다음을 확인하겠습니다.

```text
1. Schedule Revision에 Team 컬럼 표시
2. Schedule Revision에 Subcontractor 컬럼 표시
3. Schedule Revision에 Sub-Sub 컬럼 표시
4. 각 컬럼 헤더 클릭 시 정렬 동작
5. 필터 아이콘으로 컬럼별 필터 동작
6. Clear filters / Clear sort 동작
7. 행 클릭 시 기존처럼 Subtest Detail로 이동
8. 기존 Import Logs 화면 영향 없음
```
