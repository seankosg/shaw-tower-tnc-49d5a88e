
## 점검 결과

현재 코드 기준으로는 Defect Management의 주요 drill-down은 이미 대부분 현재 route인 `/defects/raw-data`로 직접 이동하고 있어, T&C에서 발생했던 `/raw-data → /tc/raw-data` legacy redirect 과정의 query 손실 문제와 동일한 구조는 보이지 않습니다.

확인된 현재 상태:

```text
Defect Dashboard
- KPI card drill-down: /defects/raw-data?... 직접 이동
- Overdue / At-Risk alert: /defects/raw-data?... 직접 이동
- Plan vs Actual table drill-down: /defects/raw-data?... 직접 이동
- Pie chart drill-down: /defects/raw-data?... 직접 이동

Defect Progress
- Matrix group/cell drill-down: /defects/raw-data?... 직접 이동

App Router
- /defects/raw-data route 존재
- 현재 /defects/* legacy redirect는 별도로 없음
```

따라서 T&C와 동일하게 “legacy redirect가 query string을 제거해서 필터가 풀리는 문제”는 Defect Management에서는 현재 직접 재현될 가능성이 낮습니다.

다만 Defect drill-down 쪽에는 별도 보완이 필요한 부분이 있습니다.

## 발견된 보완 포인트

### 1. Defect legacy alias가 없음

T&C는 기존 route를 `/tc/*`로 바꾸면서 legacy route를 query-preserving redirect로 유지합니다.

```text
/raw-data?... → /tc/raw-data?...
```

Defect Management는 현재 `/defects/*`가 처음부터 실제 route로 보이며 legacy redirect는 없습니다.

하지만 사용자가 과거/외부 링크로 아래 같은 경로를 접근할 가능성을 고려하면 query-preserving alias를 추가하는 것이 안전합니다.

```text
/defect/dashboard?...      → /defects/dashboard?...
/defect/progress?...       → /defects/progress?...
/defect/raw-data?...       → /defects/raw-data?...
/defect/import?...         → /defects/import?...
/defect/import/logs?...    → /defects/import/logs?...
/defect/export?...         → /defects/export?...
/defect/quick-update?...   → /defects/quick-update?...
```

핵심은 T&C처럼 `RedirectPreserveSearch`를 재사용해서 query string을 반드시 보존하는 것입니다.

### 2. Defect Progress Matrix drill-down의 date field가 불명확함

현재 `DefectProgressPage`에는 date field 선택이 있습니다.

```text
Planned Date / Target Date
```

하지만 `DefectProgressMatrix`에서 Raw Data로 이동할 때는 아래만 전달합니다.

```text
dateStart
dateEnd
```

`dateField`를 전달하지 않기 때문에 Raw Data에서는 fallback 로직으로 `target_date ?? planned_date` 기준 필터를 적용합니다.

즉 사용자가 Progress 화면에서 `Planned Date`를 선택해도 matrix drill-down에서는 그 선택이 명확히 반영되지 않을 수 있습니다.

수정 방향:

```text
DefectProgressPage의 dateField 값을 DefectProgressMatrix에 prop으로 전달
DefectProgressMatrix drill-down URL에 dateField=planned_date 또는 target_date 포함
```

예상 URL:

```text
/defects/raw-data?subTrade=...&dateStart=2026-04-24&dateEnd=2026-04-24&dateField=planned_date
```

### 3. Defect Progress Matrix의 빈 그룹값 처리 보완

현재 Defect progress group key가 없으면 label/key가 `—`로 생성됩니다.

```text
row.key = "—"
```

그리고 drill-down 시 아래처럼 전달됩니다.

```text
/defects/raw-data?subTrade=—
```

하지만 Raw Data의 column filter가 실제 blank/null 값을 `—` 문자열과 동일하게 처리하지 않으면 필터 결과가 비거나 부정확할 수 있습니다.

T&C 쪽은 빈 값 표현에 `__EMPTY__` 같은 convention을 사용하고 있으므로 Defect 쪽도 동일하게 맞추는 것이 안전합니다.

수정 방향:

```text
DefectProgressMatrix에서 row.key가 "—" 또는 "(None)"이면 __EMPTY__ 전달
DefectRawDataPage에서 __EMPTY__를 blank/null filter로 해석
```

### 4. Defect Raw Data URL filter key 정리

현재 Defect Dashboard와 Progress에서 사용하는 query key는 아래 형태입니다.

```text
team
subcontractor
subsub
hdecPic
level
mainTrade
subTrade
status
closureStatus
issueNo
subcontractorIssueNo
dateStart
dateEnd
dateField
actualComplete
closureComplete
overdue
atRisk
asOf
atRiskDays
```

이 key들은 `DefectRawDataPage`에서 대부분 처리되고 있습니다.

다만 수정 시 다음을 함께 재확인합니다.

```text
- dateField가 DATE_FILTER_FIELDS에 있을 때 column filter로 정상 반영되는지
- dateField가 없을 때 fallback date range가 의도대로 동작하는지
- overdue=true + asOf=YYYY-MM-DD 필터가 정상 동작하는지
- atRisk=true + atRiskDays=N 필터가 정상 동작하는지
- group filter와 overdue/date filter가 동시에 적용되는지
```

## 수정 계획

### 1. `src/App.tsx`

현재 T&C에 적용된 `RedirectPreserveSearch`를 Defect legacy alias에도 재사용합니다.

추가 route:

```tsx
<Route path="/defect/dashboard" element={<RedirectPreserveSearch to="/defects/dashboard" />} />
<Route path="/defect/progress" element={<RedirectPreserveSearch to="/defects/progress" />} />
<Route path="/defect/schedule-revision" element={<RedirectPreserveSearch to="/defects/schedule-revision" />} />
<Route path="/defect/raw-data" element={<RedirectPreserveSearch to="/defects/raw-data" />} />
<Route path="/defect/import" element={<RedirectPreserveSearch to="/defects/import" />} />
<Route path="/defect/import/logs" element={<RedirectPreserveSearch to="/defects/import/logs" />} />
<Route path="/defect/export" element={<RedirectPreserveSearch to="/defects/export" />} />
<Route path="/defect/quick-update" element={<RedirectPreserveSearch to="/defects/quick-update" />} />
```

효과:

```text
/defect/raw-data?overdue=true&asOf=2026-04-24
→ /defects/raw-data?overdue=true&asOf=2026-04-24
```

### 2. `src/pages/DefectProgressPage.tsx`

`dateField`를 `DefectProgressMatrix`에 전달합니다.

변경 방향:

```tsx
<DefectProgressMatrix
  rows={matrix.rows}
  buckets={matrix.buckets}
  bucket={bucket}
  groupBy={groupBy}
  dateField={dateField}
/>
```

### 3. `src/components/defects/DefectProgressMatrix.tsx`

props에 `dateField`를 추가하고, bucket drill-down 시 URL에 포함합니다.

변경 방향:

```text
- dateField prop 추가
- openRawData()에서 bucketStart가 있을 경우 dateField도 params에 set
- 빈 그룹값은 __EMPTY__로 normalize
```

예상 query:

```text
/defects/raw-data?subTrade=ARCH&dateStart=2026-04-24&dateEnd=2026-04-24&dateField=planned_date
```

### 4. `src/pages/DefectRawDataPage.tsx`

URL filter에서 `__EMPTY__`를 blank/null 값으로 처리하도록 보완합니다.

적용 대상:

```text
team
subcontractor
subsub
hdecPic
level
mainTrade
subTrade
status
closureStatus
issueNo
subcontractorIssueNo
```

처리 방향:

```text
param value가 __EMPTY__이면 해당 column의 null/blank row만 매칭
일반 value는 기존처럼 text/multi-select filter 유지
```

가능하면 T&C `SubtestList`의 empty handling convention과 맞춥니다.

### 5. Defect drill-down 경로 재점검

아래 drill-down이 모두 `/defects/raw-data?...` 직접 이동하는지 확인하고, legacy 또는 잘못된 route가 있으면 수정합니다.

```text
DefectDashboardPage
- Total Defects
- Sub Trades
- Actual Complete
- Closure
- Overdue
- Overdue alert
- At-Risk alert
- Plan vs Actual table values
- Pie chart slices

DefectProgressPage / DefectProgressMatrix
- Group label click
- Bucket cell click
```

## 검증 항목

수정 후 아래를 확인합니다.

```text
1. Defect Dashboard > Overdue 클릭
   → /defects/raw-data?source=dashboard&overdue=true&asOf=... 이동

2. Defect Raw Data에 overdue defect만 표시됨

3. Defect Dashboard > At-Risk 클릭
   → /defects/raw-data?source=dashboard&atRisk=true&atRiskDays=... 이동

4. Defect Dashboard > Plan vs Actual 숫자 클릭
   → group filter + date/dateField/overdue 조건이 함께 유지됨

5. Defect Progress Matrix bucket 클릭
   → dateStart/dateEnd/dateField가 모두 URL에 포함됨

6. Defect Progress에서 Planned Date 선택 후 drill-down
   → planned_date 기준으로 Raw Data 필터링됨

7. Defect Progress에서 Target Date 선택 후 drill-down
   → target_date 기준으로 Raw Data 필터링됨

8. 빈 그룹값 drill-down
   → __EMPTY__ 처리로 blank/null row만 표시됨

9. legacy alias 직접 접근 확인
   → /defect/raw-data?overdue=true&asOf=... 가 /defects/raw-data?overdue=true&asOf=... 로 query 보존 redirect됨

10. T&C 기존 route와 drill-down 영향 없음

11. build 성공
```

## 수정 대상 파일

```text
src/App.tsx
src/pages/DefectProgressPage.tsx
src/components/defects/DefectProgressMatrix.tsx
src/pages/DefectRawDataPage.tsx
```
