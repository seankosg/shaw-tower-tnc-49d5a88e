
## 구현 목표

현재 `Import Logs > Schedule Changes` 탭에 구현되어 있는 **Pred / T1 / T2 그룹형 Schedule Changes 표시 구조**를 별도 화면으로 분리하여, 좌측 메뉴의 Schedule 영역 아래에 **Schedule Revision** 탭/메뉴로 추가하겠습니다.

즉, 사용자는 Import Logs로 들어가지 않아도 Schedule Revision 화면에서 일정 변경 이력을 직접 확인할 수 있게 됩니다.

## 구현 방식

### 1. 새 페이지 추가

새 화면을 추가합니다.

```text
src/pages/ScheduleRevisionPage.tsx
```

이 화면은 `schedule_change_audit` 테이블을 기준으로 일정 변경 이력을 표시합니다.

표 구조는 기존 완료된 구조를 그대로 따릅니다.

```text
Row | System | Item No | MOS Code | Subtest ID | Pred 그룹 | T1 그룹 | T2 그룹
```

각 Stage 그룹은 다음 컬럼을 가집니다.

```text
Old date | New date | Diff | Prev.Gap | Cur.Gap
```

### 2. 라우트 추가

다음 경로를 추가합니다.

```text
/schedule/revision
```

`src/App.tsx`에 새 Route를 등록합니다.

```text
/schedule/revision → ScheduleRevisionPage
```

### 3. 좌측 메뉴에 Schedule Revision 추가

`src/components/layout/AppSidebar.tsx`의 Navigation 메뉴에서 기존 Schedule/Progress 항목 아래에 새 항목을 추가합니다.

현재:

```text
Dashboard
Progress
Raw Data
Import
Export
```

변경 후:

```text
Dashboard
Progress
Schedule Revision
Raw Data
Import
Export
```

표시명은 요청하신 대로 다음으로 사용합니다.

```text
Schedule Revision
```

아이콘은 기존 Schedule 계열과 어울리도록 `CalendarClock` 또는 유사한 일정 이력 아이콘을 사용합니다.

### 4. 상단 Breadcrumb / Page Title 처리

`src/components/layout/AppLayout.tsx`에 새 화면 제목을 추가합니다.

```text
SHAW T&C / Schedule Revision
```

브라우저 타이틀도 다음처럼 표시되도록 반영합니다.

```text
Schedule Revision · SHAW T&C
```

### 5. 권한 처리

기존 Schedule 화면과 동일하게 접근 가능하도록 처리합니다.

현재 권한 규칙상 `/schedule` 경로는 모든 인증 사용자에게 허용되어 있으므로, `/schedule/revision`도 같은 권한 범위에 포함됩니다.

데이터베이스 권한 변경은 하지 않습니다.

```text
새 테이블 생성 없음
컬럼 추가 없음
RLS 정책 변경 없음
Backend Function 변경 없음
```

### 6. 데이터 조회 방식

`ScheduleRevisionPage`에서 다음 데이터를 조회합니다.

```text
schedule_change_audit
system_master
projects
```

표시는 `schedule_change_audit`를 기준으로 하고, `system_id`, `project_id`는 화면 표시용으로 master 데이터와 매핑합니다.

기본 정렬은 최신 변경 이력이 위로 오도록 합니다.

```text
created_at desc
```

그리고 동일 시간대 내에서는 원본 row 순서를 유지합니다.

```text
raw_row_no asc
```

### 7. 화면 구성

상단에는 간단한 제목과 설명을 표시합니다.

```text
Schedule Revision
Pred / T1 / T2 planned date revision history
```

아래에는 Revision 로그 테이블을 표시합니다.

기본 컬럼:

```text
Changed At
Project
System
Row
Item No
MOS Code
Subtest ID
Pred Old/New/Diff/Prev.Gap/Cur.Gap
T1 Old/New/Diff/Prev.Gap/Cur.Gap
T2 Old/New/Diff/Prev.Gap/Cur.Gap
```

기존 `ImportLogsPage.tsx`의 `StageCells`, `stageGroups`, `stageLabels`, 날짜 포맷, diff 색상 표시 로직을 동일하게 재사용하거나 새 페이지 안에 동일 패턴으로 분리 구현합니다.

### 8. 행 클릭 동작

기존 Schedule Changes 탭과 동일하게 유지합니다.

```text
Revision 행 클릭
→ 해당 Subtest Detail 화면으로 이동
```

경로:

```text
/subtests/{subtest_id}
```

### 9. Import Logs 화면은 유지

기존 `Import Logs > Schedule Changes` 탭은 삭제하지 않습니다.

역할을 분리합니다.

```text
Import Logs > Schedule Changes
→ 특정 Import Batch 안에서 발생한 변경 이력 확인

Schedule Revision
→ 전체 Schedule 변경 이력을 독립 화면에서 확인
```

### 10. 초기 표시 개수

성능을 위해 우선 최근 변경 이력 기준으로 일정 개수만 조회합니다.

```text
최근 500건
```

이후 필요하면 pagination 또는 기간 필터를 별도 요청으로 확장할 수 있습니다.

## 수정 대상 파일

```text
src/App.tsx
src/components/layout/AppSidebar.tsx
src/components/layout/AppLayout.tsx
src/hooks/useRouteMemory.ts
src/pages/ScheduleRevisionPage.tsx
```

## 최종 동작

구현 후 사용 흐름은 다음과 같습니다.

```text
1. 좌측 메뉴에서 Schedule Revision 클릭
2. 전체 schedule_change_audit 이력 확인
3. Pred / T1 / T2 변경 전/후 날짜 및 Gap 확인
4. 필요한 행 클릭
5. 해당 Subtest Detail 화면으로 이동
```

