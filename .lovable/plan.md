
## 수정 계획: T&C Dashboard Overdue 클릭 시 필터가 사라지는 문제 해결

## 원인

현재 T&C Dashboard의 Overdue 카드/배너 클릭 시 URL은 먼저 legacy route로 이동합니다.

```text
/raw-data?source=dashboard&status=overdue&as_of=...
```

하지만 `App.tsx`에서 `/raw-data`를 `/tc/raw-data`로 redirect하면서 query string을 보존하지 않습니다.

현재 구조:

```tsx
<Route path="/raw-data" element={<Navigate to="/tc/raw-data" replace />} />
```

결과적으로 실제 도착 URL이 아래처럼 되어 필터 조건이 사라집니다.

```text
/tc/raw-data
```

그래서 Raw Data 페이지가 `status=overdue`를 받지 못하고 전체 Subtest를 보여줍니다.

## 수정 범위

### 1. `src/pages/DashboardPage.tsx`

T&C Dashboard의 Raw Data 이동 경로를 legacy route가 아닌 현재 route로 직접 변경합니다.

변경 대상:

```text
/raw-data
→ /tc/raw-data
```

적용 위치:

```text
- Overdue KPI card
- Overdue Subtests alert card
- At-Risk Subtests alert card
- Systems KPI card
- Total Subtests KPI card
- Plan vs Actual table drill-down
```

핵심 변경:

```tsx
navigate(`/raw-data?${q}`);
```

를 아래처럼 변경합니다.

```tsx
navigate(`/tc/raw-data?${q}`);
```

그리고 직접 이동도 변경합니다.

```tsx
navigate('/raw-data')
```

를 아래처럼 변경합니다.

```tsx
navigate('/tc/raw-data')
```

### 2. `src/pages/SchedulePage.tsx`

같은 문제가 Schedule/Progress 화면에서도 발생할 수 있으므로 T&C Schedule drill-down도 같이 정리합니다.

변경 대상:

```text
/raw-data?... 
→ /tc/raw-data?...
```

적용 위치:

```text
- Delay Up to Data Date KPI
- Critical KPI
- Upcoming 7d Plan KPI
- Schedule matrix cell click
- Date lookup Go 버튼
```

### 3. `src/App.tsx`

legacy route로 직접 접근하는 경우에도 query string이 유지되도록 redirect helper를 추가합니다.

추가할 helper:

```tsx
function RedirectPreserveSearch({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}
```

이를 위해 import도 변경합니다.

```tsx
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
```

legacy redirect를 아래처럼 변경합니다.

```tsx
<Route path="/dashboard" element={<RedirectPreserveSearch to="/tc/dashboard" />} />
<Route path="/schedule" element={<RedirectPreserveSearch to="/tc/progress" />} />
<Route path="/schedule/revision" element={<RedirectPreserveSearch to="/tc/schedule-revision" />} />
<Route path="/raw-data" element={<RedirectPreserveSearch to="/tc/raw-data" />} />
<Route path="/import" element={<RedirectPreserveSearch to="/tc/import" />} />
<Route path="/import/logs" element={<RedirectPreserveSearch to="/tc/import/logs" />} />
<Route path="/export" element={<RedirectPreserveSearch to="/tc/export" />} />
<Route path="/mobile" element={<RedirectPreserveSearch to="/tc/quick-update" />} />
```

`/`는 query filter 목적이 없으므로 기존처럼 `/tc/dashboard`로 유지해도 됩니다.

## 유지할 부분

`src/pages/SubtestList.tsx`의 overdue 필터 로직은 이미 존재하므로 변경하지 않습니다.

현재 Raw Data는 아래 query를 받으면 필터링할 수 있습니다.

```text
status=overdue
as_of=YYYY-MM-DD
```

문제는 필터 로직이 아니라 query string이 route redirect 과정에서 사라지는 것입니다.

## 검증 항목

수정 후 아래를 확인합니다.

```text
1. T&C Dashboard > Overdue 카드 클릭
   → /tc/raw-data?source=dashboard&status=overdue&as_of=... 로 이동

2. Raw Data에 overdue subtest만 표시됨

3. Overdue Subtests alert card 클릭도 동일하게 동작

4. At-Risk Subtests alert card 클릭 시
   → /tc/raw-data?source=dashboard&status=at_risk&at_risk_days=... 로 이동

5. Plan vs Actual table 숫자 클릭 시 필터가 유지됨

6. Schedule/Progress 화면의 KPI 및 matrix drill-down도 query filter를 유지함

7. legacy URL인 /raw-data?status=overdue&as_of=... 로 직접 접근해도
   /tc/raw-data?status=overdue&as_of=... 로 query가 보존됨

8. Defect Management route는 영향 없음

9. build 성공
```

## 수정 대상 파일

```text
src/App.tsx
src/pages/DashboardPage.tsx
src/pages/SchedulePage.tsx
```
