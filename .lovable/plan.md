
## 변경 목표

요청하신 2가지를 함께 적용합니다.

```text
요청1. 사용자가 로그인/최초 접속 후 Dashboard 페이지로 진입
요청2. 메뉴 간 이동 및 브라우저 Back 이동 시 이전 메뉴의 화면 상태 유지
```

## 구현 방향

### 1. 최초 접속 경로를 Dashboard로 변경

현재 앱의 기본 경로 `/`는 Raw Data 화면으로 연결되어 있습니다.

변경 후에는 다음처럼 동작하게 합니다.

```text
로그인 성공 → /dashboard
브라우저에서 기본 주소 접속 → /dashboard
권한 없는 경로 접근 시 fallback → /dashboard
```

단, 기존 Raw Data 화면은 계속 사용할 수 있어야 하므로 Raw Data 전용 경로를 추가합니다.

```text
/dashboard  → Dashboard
/raw-data   → Raw Data
/           → /dashboard 로 redirect
```

기존 Dashboard, Progress, Import, Export, Admin 등의 경로는 유지합니다.

### 2. Login 후 이동 경로 변경

현재 로그인 성공 후 `navigate('/')`로 이동하고 있습니다.

이를 다음으로 변경합니다.

```text
navigate('/dashboard')
```

비밀번호 강제 변경 대상자는 기존처럼 `/change-password`로 이동하는 정책을 유지합니다.

### 3. Sidebar의 Raw Data 메뉴 경로 변경

현재 Sidebar의 Raw Data 메뉴가 `/`로 이동합니다.

변경 후:

```text
Raw Data 메뉴 → /raw-data
Dashboard 메뉴 → /dashboard
```

또한 사용자가 Raw Data에서 필터/검색/정렬/스크롤 상태를 보고 있다가 다른 메뉴로 이동한 뒤 다시 Raw Data를 누르면, 가능하면 마지막 Raw Data 상태로 복귀하도록 처리합니다.

예:

```text
Raw Data에서 System=A01 필터 적용
→ Progress 이동
→ Raw Data 메뉴 클릭
→ /raw-data?system=A01 상태로 복귀
```

### 4. 메뉴별 화면 상태 유지 방식 추가

각 주요 메뉴 화면에 대해 “페이지 상태 저장/복원”을 적용합니다.

대상:

```text
Dashboard
Raw Data
Progress
Import
Import Logs
Export
```

저장 대상 예시:

```text
Dashboard:
- Team filter
- Breakdown tab
- System search/filter
- S-curve date range
- Daily/Weekly 선택
- 스크롤 위치

Raw Data:
- 검색어
- 컬럼 필터
- 정렬
- 컬럼 너비
- URL 필터
- 테이블 스크롤 위치

Progress:
- Group 선택
- Team filter
- Day/Week
- Stage filter
- As-of mode
- Range
- Hide past
- System search/filter
- Risk panel 표시 여부
- Lookup 날짜/Plan-Actual 선택
- 스크롤 위치

Import Logs:
- 선택한 batch
- Row Logs / Schedule Changes 탭
- 스크롤 위치

Export:
- System filter
- Status filter
```

### 5. URL 기반 상태와 저장소 기반 상태 병행

브라우저 Back 버튼 동작을 안정적으로 만들기 위해, 상태를 두 방식으로 나눠 관리합니다.

#### URL에 저장할 상태

Back/Forward로 정확히 되돌아가야 하는 핵심 화면 상태는 URL query string에 반영합니다.

예:

```text
/raw-data?system=A01&status=overdue
/schedule?group=system&bucket=week&stage=t1
/dashboard?team=construction&tab=system
```

이렇게 하면 브라우저 Back을 눌렀을 때 이전 화면과 필터 상태가 자연스럽게 복원됩니다.

#### localStorage 또는 sessionStorage에 저장할 상태

URL에 넣기 과한 UI 상태는 사용자별 저장소에 저장합니다.

예:

```text
테이블 컬럼 너비
스크롤 위치
Dashboard chart date range
Progress risk panel 표시 여부
Raw Data table horizontal/vertical scroll
```

기존 Raw Data의 localStorage 저장 구조는 유지하되, `/raw-data` 경로에서도 정상 동작하도록 보완합니다.

### 6. 공통 상태 저장 Hook 추가

반복 코드를 줄이기 위해 공통 유틸/Hook을 추가합니다.

예상 신규 파일:

```text
src/hooks/usePersistedState.ts
src/hooks/usePageScrollMemory.ts
src/hooks/useLastRouteMemory.ts
```

역할:

```text
usePersistedState:
- 사용자별 localStorage/sessionStorage 상태 저장
- 초기 mount 시 복원
- 값 변경 시 자동 저장

usePageScrollMemory:
- 페이지 또는 테이블 scrollTop / scrollLeft 저장
- 다시 돌아왔을 때 위치 복원

useLastRouteMemory:
- 메뉴별 마지막 방문 URL 저장
- Sidebar 메뉴 클릭 시 마지막 query 포함 경로로 이동
```

### 7. Browser Back 동작 보장

다음 시나리오를 기준으로 구현합니다.

```text
1. Dashboard에서 Team filter 변경
2. Progress 메뉴 이동
3. Progress에서 Week / T1 / Range 변경
4. Raw Data로 이동 후 필터 적용
5. Subtest Detail 진입
6. 브라우저 Back
```

기대 동작:

```text
Back 1회 → Raw Data, 기존 필터/스크롤 유지
Back 2회 → Progress, 기존 Week/T1/Range 상태 유지
Back 3회 → Dashboard, 기존 Team filter 상태 유지
```

### 8. 기존 Dashboard/Progress에서 Raw Data로 이동하는 링크 수정

현재 Dashboard와 Progress의 KPI/Chart 클릭은 `/?...` 형태로 Raw Data에 필터를 전달합니다.

변경 후에는 모두 `/raw-data?...` 형태로 수정합니다.

예:

```text
기존:
navigate('/?source=dashboard&status=overdue')

변경:
navigate('/raw-data?source=dashboard&status=overdue')
```

Subtest 상세 페이지 경로는 그대로 유지합니다.

```text
/subtests/:id
```

### 9. App route 구조 정리

`src/App.tsx`에서 route를 정리합니다.

변경 예:

```text
<Route path="/" element={<Navigate to="/dashboard" replace />} />
<Route path="/dashboard" element={<DashboardPage />} />
<Route path="/raw-data" element={<SubtestList />} />
```

그리고 기존 `/` 기반 Raw Data 접근은 신규 `/raw-data`로 대체합니다.

필요하면 과거 링크 호환을 위해 `/raw-data`만 공식 경로로 두고, `/`는 Dashboard 전용으로 유지합니다.

## 수정 예상 파일

```text
src/App.tsx
src/pages/Login.tsx
src/components/layout/AppSidebar.tsx
src/components/layout/AppLayout.tsx
src/pages/DashboardPage.tsx
src/pages/SchedulePage.tsx
src/pages/SubtestList.tsx
src/pages/ImportLogsPage.tsx
src/pages/ExportPage.tsx
```

신규 추가 예상:

```text
src/hooks/usePersistedState.ts
src/hooks/usePageScrollMemory.ts
src/hooks/useLastRouteMemory.ts
```

## 데이터베이스 변경 여부

데이터베이스 변경은 필요 없습니다.

```text
DB migration 없음
RLS 변경 없음
Backend 변경 없음
```

## 최종 동작

```text
사용자 로그인
→ Dashboard로 진입

브라우저 기본 주소 접속
→ Dashboard로 진입

Dashboard / Raw Data / Progress / Import / Export 메뉴 이동
→ 각 메뉴의 필터, 탭, 스크롤 상태 저장

브라우저 Back
→ 이전 메뉴와 이전 화면 상태 복원

Sidebar에서 메뉴 재클릭
→ 해당 메뉴의 마지막 화면 상태로 복귀
```

