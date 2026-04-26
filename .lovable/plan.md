## 목표

대시보드 "Recent Comments" 카드와 "모두 보기" 페이지에서:
1. 기존에 기록된 모든 댓글이 누락 없이 표시되도록 보완
2. **Reply는 부모 코멘트 아래에 묶어 스레드 형태로 표시**
3. 권한이 없어 부모 항목(서브테스트/디팩트)을 못 보는 댓글은 표시하되 클릭 비활성화

현재 DB 상태:
- `subtest_comments`: 39건 (전부 30일 이내)
- `defect_comments`: 0건 (정상 — 아직 등록된 게 없음)

## 변경 사항

### 1. RecentSubtestComments / RecentDefectComments 컴포넌트 보완

**조인 방식 변경**
- `subtests!inner` → `subtests` (left join)
- `defect_items!inner` → `defect_items` (left join)
- 부모가 RLS로 가려진 행은 회색 처리 + "No access" 배지 + 클릭 비활성화

**스레드 그룹핑 로직 (핵심)**
- fetch는 윈도우(기본 30일) + limit 50 유지
- 정렬: 부모 코멘트의 **마지막 활동 시각**(자기 자신 또는 자식 reply 중 가장 최근 `created_at`) 기준 내림차순
- 화면 구성:
  - 최상위 행 = `parent_comment_id IS NULL` 코멘트(comment / instruction)
  - 같은 부모를 가진 reply들은 부모 카드 내부에 들여쓰기 + 좌측 보더로 묶여 표시
  - reply가 3개를 넘으면 "더 보기 (N)" 토글로 접힘
- **고아 reply 처리** (부모가 30일 윈도우 밖에 있어 안 잡힌 경우): 부모를 별도 fetch로 한 번 더 가져와 같은 스레드로 묶음. 그래도 없으면 단독 카드로 표시 + "Reply (parent unavailable)" 배지
- 타입 배지: Instruction(빨강) / Reply(회색) / New(unread)

**카드 헤더**
- "모두 보기" 링크 추가:
  - Subtest → `/comments/subtest`
  - Defect → `/comments/defect`
- 탭(All / Instructions / Unread)은 부모 기준으로 필터링 (예: Unread = 스레드 내에 미열람 항목이 하나라도 있으면 노출)

### 2. 새 페이지: 모든 댓글 보기

`src/pages/AllSubtestCommentsPage.tsx` (`/comments/subtest`)
`src/pages/AllDefectCommentsPage.tsx` (`/comments/defect`)

기능:
- 기간: Last 7 / 30 / 90 / 365 / All time (기본 All time)
- 타입 필터: All / Comment / Instruction / Reply
- Unread 토글
- 작성자/본문 검색
- 페이지네이션 (50건 단위 Load more)
- 표시 모드 토글: **"Threaded" / "Flat"** (기본 Threaded — 부모-자식 묶음)
- 행 클릭 시 상세 페이지로 이동 (권한 없으면 비활성)

### 3. 라우팅 등록

`src/App.tsx`에 두 라우트 추가 (기존 ProtectedRoute 패턴 사용).

## 기술 노트

- 그룹핑은 클라이언트에서 수행: 가져온 행들을 `parent_comment_id`로 분리 → 부모 맵 생성 → 자식 reply를 부모에 attach → 정렬 키는 `max(parent.created_at, ...child.created_at)`.
- 고아 reply의 부모 보충 fetch: `IN ('parent_id', ...)` 단건 쿼리로 한 번에 처리.
- 권한 가려짐 판정: left join 후 부모 객체가 `null`인지로만 확인 (별도 권한 호출 불필요).
- 실시간: 기존 `postgres_changes` 구독 유지 — INSERT/UPDATE/DELETE 모두 다시 그룹핑.

## 영향 받는 파일

- 수정: `src/components/dashboard/RecentSubtestComments.tsx`
- 수정: `src/components/dashboard/RecentDefectComments.tsx`
- 신규: `src/pages/AllSubtestCommentsPage.tsx`
- 신규: `src/pages/AllDefectCommentsPage.tsx`
- 수정: `src/App.tsx` (라우트 추가)
