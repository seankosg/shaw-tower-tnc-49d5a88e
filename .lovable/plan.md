# 대시보드 하단 댓글 리스트 구현

## 1. 어떤 댓글을 보여줄지 (제안)

전체 댓글을 모두 보여주는 건 비효율적이라, 다음 기준의 **"최근 활동 피드(Recent Activity Feed)"** 형태를 제안합니다.

### 기본 표시 규칙 (제안하는 디폴트)
- **최근 30일** 이내 작성된 댓글
- **최대 50건** (스크롤 영역 내)
- 작성일시 **내림차순**
- **현재 사용자가 권한으로 볼 수 있는 항목**의 댓글만 (Subtest는 RLS의 `can_view_subtest`가 자동으로 필터링됨)

### 상단 필터/탭 (UI 제어)
1. **타입 탭**:
   - `전체 (All)`
   - `Instructions only` — 지시사항만 (관리자/시니어가 내린 결정사항)
   - `My team` — 내 team의 항목 댓글
   - `Mentions/Replies to me` — 내가 작성한 댓글에 달린 답글, 또는 내가 쓴 댓글 (선택)
   - `Unread` — 내가 아직 안 읽은 댓글 (이미 `*_comment_reads` 테이블 존재)
2. **기간 선택**: 7일 / 30일 / 90일 (기본 30일)
3. **검색**: 메시지 본문 키워드 검색 (선택)

### 정렬 우선순위 보너스 (선택 적용)
- `Unread` + `instruction` 타입 댓글은 상단에 핀처럼 보이도록 강조 (배지)
- 같은 항목에 여러 댓글이 있으면 가장 최근 1건만 묶어 보여주고 "외 N건" 표시 (선택)

> 위 기본값(최근 30일 / 50건 / 전체+Unread+Instructions 탭)을 권장합니다.

---

## 2. 동작

- **T&C Dashboard (`/tc/dashboard`)**: 하단에 **"최근 Subtest 댓글"** 섹션
  - 댓글 행 클릭 → `/subtests/:id` 이동 (해당 Subtest 상세에 댓글 섹션이 이미 있음)
- **Defects Dashboard (`/defects/dashboard`)**: 하단에 **"최근 Defect 댓글"** 섹션
  - 댓글 행 클릭 → `/defects/:id` 이동
- 항목 컨텍스트(예: subtest의 `item_no`/`mos_code`, defect의 `issue_no`/`description`)도 함께 표시해서 어떤 항목인지 한눈에 인식 가능

---

## 3. 표시 카드 레이아웃 (행 단위)

```text
[작성자]  [type 배지: comment/instruction]  [unread 배지]   2025-04-25 14:03
└─ "댓글 메시지 본문 한 줄 요약 (최대 2줄, ellipsis)..."
   → 항목: ITEM-123 / MOS-A02   (클릭 시 상세 이동)
```

---

## 4. 기술 구현

### 신규 컴포넌트
- `src/components/dashboard/RecentSubtestComments.tsx`
- `src/components/dashboard/RecentDefectComments.tsx`

공통 props/구조:
- 내부에서 `subtest_comments` / `defect_comments` 를 join 해서 fetch
- 항목 메타(item_no, mos_code, issue_no 등) 함께 select
- 작성자 이름은 `profiles` 에서 별도 조회 후 in-memory join (기존 `DefectComments.tsx` 패턴 그대로)
- `*_comment_reads` 의 `last_read_at` 과 비교해 `hasUnread` 계산
- Realtime: `postgres_changes` on `subtest_comments` / `defect_comments` 로 자동 새로고침 (기존 `SubtestList` 패턴 참고)

### 쿼리 개요
```ts
// Subtest
supabase
  .from('subtest_comments')
  .select('id, subtest_id, type, message, created_at, author_user_id, edited, subtests!inner(id, item_no, mos_code, team, subcontractor_name, subsub_name)')
  .gte('created_at', thirtyDaysAgo)
  .order('created_at', { ascending: false })
  .limit(50)
```
RLS가 본인이 볼 수 없는 subtest의 댓글은 자동 필터링.

```ts
// Defect — 동일 패턴, defects(id, issue_no, description, team) join
```

### 페이지 통합
- `DashboardPage.tsx` 맨 아래에 `<RecentSubtestComments />` 카드 추가
- `DefectDashboardPage.tsx` 맨 아래에 `<RecentDefectComments />` 카드 추가
- 카드 헤더: 제목 + 탭(All / Instructions / Unread) + 기간 셀렉트
- 본문: `ScrollArea` 안에 행 리스트, 행 클릭 시 `navigate(...)`

### 읽음 처리 (선택)
- 행을 클릭해서 상세로 이동할 때 해당 항목의 `*_comment_reads.last_read_at` 을 `now()` 로 upsert (기존 상세 페이지 진입 시 처리 로직이 있다면 중복 방지)
- 본 작업에서는 **상세 페이지 기존 로직에 위임**하고 피드에서는 표시만 함

---

## 5. 권한/RLS

- `defect_comments` / `subtest_comments` 모두 SELECT는 authenticated 전체 허용. 단, `subtests` join은 `can_view_subtest` RLS가 적용되어 자동으로 권한 외 항목은 제거됨.
- `defect_items` 도 authenticated 전체 read 가능 → 모든 사용자가 모든 defect 댓글을 볼 수 있음. 필요 시 team 필터로 1차 제한 권장.

---

## 6. 변경 파일 요약

**신규**
- `src/components/dashboard/RecentSubtestComments.tsx`
- `src/components/dashboard/RecentDefectComments.tsx`

**수정**
- `src/pages/DashboardPage.tsx` — 하단에 카드 1개 추가
- `src/pages/DefectDashboardPage.tsx` — 하단에 카드 1개 추가

---

## 7. 확인 부탁드리는 옵션

승인 전 한 가지만 정해주시면 그대로 적용합니다. (미응답 시 **A**로 진행)

- **A. 권장 기본값 그대로**: 최근 30일 / 최대 50건 / 탭(All · Instructions · Unread) / 내 권한 내 항목만
- **B. 더 단순하게**: 최근 20건만, 탭/필터 없이 단순 리스트
- **C. 더 풍부하게**: 위 A + 검색창 + 기간 7/30/90 셀렉트
