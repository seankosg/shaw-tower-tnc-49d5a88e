## 문제 요약

대시보드(`/tc/dashboard`)의 **Recent Subtest Comments** 카드(그리고 결함 대시보드의 **Recent Defect Comments**)에 코멘트가 하나도 표시되지 않습니다. 사용자는 댓글이 달린 Subtest가 많다고 합니다.

## 조사 결과

DB 직접 조회로 확인한 사실:

- `subtest_comments`: **총 39건**, 모두 최근 24시간 내 작성, `created_at` 범위 정상 (오늘까지 포함)
- 모든 코멘트가 가리키는 `subtests` row는 **존재하고 `is_active = true`**
- `RecentSubtestComments` 컴포넌트는 `DashboardPage`에 정상 마운트되어 있음 (line 503)
- 컴포넌트 기본 윈도우는 30일 → 최근 데이터는 모두 들어와야 함

따라서 **데이터/시간범위/마운트 문제가 아닙니다.** 거의 확실한 원인은 다음 중 하나입니다.

### 원인 후보 A — `subtests(...)` 임베디드 join이 RLS로 비어 옴 (가장 유력)

쿼리:
```ts
.from('subtest_comments')
.select('id, ..., subtests(id, item_no, mos_code, team, subcontractor_name, subsub_name)')
```

`subtest_comments` 자체의 SELECT RLS는 `true`(누구나 읽기)지만, 임베드된 `subtests`는 `can_view_subtest(...)` RLS를 통과해야만 함께 옵니다. 이 함수는:

- admin/superuser/super_guest → 모두 보임
- `user_type = hdec/pm_pd/admin` → 모두 보임
- `user_type = subcontractor/subsub` → **자기 회사 row만 보임**

지금 표시 안 되는 사용자가 hdec가 아닌 subcontractor/subsub이거나, 권한 매칭이 안 되면 **`subtests`가 null로 옵니다**. 코드에서는 그러면 `noAccess` 배지로라도 보여야 하는데, 사용자가 "하나도 안 보인다"고 한 것은 다른 문제와 결합되었을 가능성.

### 원인 후보 B — 컴포넌트 자체의 무음 실패 (보조)

- 데이터 로드 후 `error` 발생 시 콘솔에만 로그 없이 빈 상태로 떨어짐 (현재 콘솔 로그 없음)
- 로딩 상태가 풀리지 않고 "Loading..."으로 멈췄을 가능성

## 수정 계획

### 1. `RecentSubtestComments` / `RecentDefectComments` 데이터 페칭 분리

현재 단일 쿼리로 코멘트와 subtest를 join하는 방식을, **두 단계 페치**로 변경:

```ts
// Step 1: 코멘트만 가져옴 (RLS true)
const { data: rawComments } = await supabase
  .from('subtest_comments')
  .select('id, subtest_id, type, message, created_at, author_user_id, edited, parent_comment_id')
  .gte('created_at', sinceIso)
  .order('created_at', { ascending: false })
  .limit(50);

// Step 2: 별도로 subtests를 IN 쿼리 → 권한 없는 row는 단순히 누락됨
const subtestIds = [...new Set(rawComments.map(c => c.subtest_id))];
const { data: subtests } = await supabase
  .from('subtests')
  .select('id, item_no, mos_code, team, subcontractor_name, subsub_name')
  .in('id', subtestIds);

// Map 머지
const subMap = new Map(subtests?.map(s => [s.id, s]) ?? []);
const merged = rawComments.map(c => ({ ...c, subtests: subMap.get(c.subtest_id) ?? null }));
```

이렇게 하면 임베드 join의 RLS 부작용에서 자유로워지고, 코멘트는 항상 화면에 뜨며 권한 없는 항목만 "No access" 배지로 표시됩니다.

### 2. 진단 로그 추가 + 빈 상태 메시지 개선

```ts
if (error) {
  console.error('[RecentSubtestComments] load error', error);
}
console.debug('[RecentSubtestComments] loaded', { count: rows.length, days, sinceIso });
```

빈 상태 문구를 더 정확하게:
- `loaded === 0` → "No comments in the last N days"
- `loaded > 0 && filtered === 0` → "All comments are filtered out by tab '..'"

### 3. `RecentDefectComments`에도 동일 변경 적용

같은 패턴으로 `defect_items` 임베드 → 별도 페치로 분리.

### 4. (선택) 기본 윈도우를 30일 → 90일로 확장

대시보드 기본값을 90일로 늘려, 첫 진입 시 더 많은 코멘트가 보이도록.

## 영향 범위

- `src/components/dashboard/RecentSubtestComments.tsx` — 페칭 로직 분리, 진단 로그
- `src/components/dashboard/RecentDefectComments.tsx` — 동일 패턴 적용
- DB / RLS 변경 없음
- 기존 UI/UX 동일 (No access 배지 동작 그대로 유지)

## 기대 결과

- HDEC/admin 사용자: 모든 39개 subtest 코멘트가 대시보드에 즉시 표시
- subcontractor/subsub 사용자: 권한 있는 코멘트는 풀 정보, 권한 없는 코멘트는 "No access" 배지로 표시 (이전엔 join 실패로 표시 자체가 누락되었을 수 있음)
- 빈 상태 시 정확한 사유 안내
