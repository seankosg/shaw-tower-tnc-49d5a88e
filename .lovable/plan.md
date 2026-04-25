# Defect Comment / Reply 시스템 + Row Data 표시 + 미읽음 강조

## 목표
1. Defect 단위 댓글·답글(스레드) — 작성·수정·삭제·실시간 동기화
2. Row Data 표의 **Issue No 셀 옆**에 말풍선 아이콘 + 댓글 개수 표시
3. **내가 마지막으로 본 시각 이후의 새 댓글**이 있으면 강조(노란 점 + bold)
4. Defect 상세 페이지 'Comments' 카드 헤더에도 개수 뱃지

## 데이터베이스 (마이그레이션 1개)

### 테이블 1 — `public.defect_comments`
```text
id                uuid PK default gen_random_uuid()
defect_id         uuid NOT NULL → defect_items(id) ON DELETE CASCADE
parent_comment_id uuid NULL → defect_comments(id) ON DELETE CASCADE
author_user_id    uuid NOT NULL                       -- auth.uid()
type              text NOT NULL DEFAULT 'comment'     -- comment | instruction | reply
message           text NOT NULL
edited            boolean NOT NULL DEFAULT false
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()
```
인덱스: `(defect_id, created_at DESC)`, `(parent_comment_id)`, `(author_user_id)`.

### 테이블 2 — `public.defect_comment_reads`
사용자별 "이 Defect 의 댓글을 마지막으로 본 시각" 1행씩 보관.
```text
id            uuid PK default gen_random_uuid()
user_id       uuid NOT NULL          -- auth.uid()
defect_id     uuid NOT NULL → defect_items(id) ON DELETE CASCADE
last_read_at  timestamptz NOT NULL DEFAULT now()
UNIQUE (user_id, defect_id)
```
인덱스: `(user_id)`.

### 헬퍼 함수 (security definer)
```sql
create or replace function public.can_modify_defect_comment(_user_id uuid, _comment_id uuid)
returns boolean ...
-- 본인 / admin / superuser / (senior_user AND defect.team = profile.team)
```

### RLS
**defect_comments**
- SELECT: 인증 사용자 모두 (`true`)
- INSERT: `author_user_id = auth.uid()`
- UPDATE: `can_modify_defect_comment(auth.uid(), id)`
- DELETE: `can_modify_defect_comment(auth.uid(), id)`

**defect_comment_reads**
- SELECT: `user_id = auth.uid()`
- INSERT / UPDATE: `user_id = auth.uid()` (upsert)

### 트리거
- `defect_comments.updated_at` 자동 갱신 + 메시지 변경 시 `edited = true`
- 별도 Event Log 트리거는 부착하지 않음(노이즈 방지)

### Realtime
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.defect_comments;
```

### 집계 RPC — `get_defect_comment_summary`
Row Data 한 페이지에서 한 번의 호출로 **현재 보이는 defect id 들에 대한 (count, has_unread)** 를 반환.
```sql
create or replace function public.get_defect_comment_summary(_defect_ids uuid[])
returns table (
  defect_id uuid,
  comment_count int,
  last_comment_at timestamptz,
  has_unread boolean
)
language sql stable security definer
set search_path = public
as $$
  with c as (
    select defect_id,
           count(*)::int as cnt,
           max(created_at) as last_at
    from public.defect_comments
    where defect_id = any(_defect_ids)
    group by defect_id
  ),
  r as (
    select defect_id, last_read_at
    from public.defect_comment_reads
    where user_id = auth.uid()
      and defect_id = any(_defect_ids)
  )
  select c.defect_id,
         c.cnt as comment_count,
         c.last_at as last_comment_at,
         (r.last_read_at is null or c.last_at > r.last_read_at) as has_unread
  from c left join r using (defect_id);
$$;
```

## 새 컴포넌트
**`src/components/defects/DefectComments.tsx`**
ALSMK `TaskComments.tsx` 포팅:
- props `{ defectId, defectTeam, onCountChange? }`
- `useAuth()` 의 `user`, `profile`, `isAdmin`, `isSuperuser`, `roles` 사용
- 작성자 이름은 `profiles` 에서 조회
- 권한: 본인 / admin / superuser / (senior_user 이고 `defectTeam === profile.team`)
- `instruction` 타입 선택 가능: admin / superuser / senior_user
- Realtime channel `defect-comments-${defectId}`
- 마운트 직후 `defect_comment_reads` upsert(`last_read_at = now()`)
- 새 댓글 도착 시도 자동 read 갱신
- ALSMK 의 `notifications` 호출은 모두 제거(추후 별도 작업)

## Row Data 표시
**`src/pages/DefectRawDataPage.tsx`**

1. 데이터 로드 후, 화면 상의 `defect_items` id 배열로 `get_defect_comment_summary` RPC 호출 → `commentSummary: Record<defectId, { count, hasUnread }>` 상태에 저장.
2. 새 댓글 Realtime 구독으로 요약 자동 갱신(`defect-comments-summary` 채널, `defect_comments` 테이블 INSERT/DELETE 만 listen → debounce 후 다시 RPC).
3. **issue_no 컬럼의 cell 렌더링 수정**: 값 우측에 작은 칩
   - 0건 → 아무것도 없음
   - 1건 이상 → `<MessageSquare className="h-3 w-3" />` + `count`
   - `hasUnread === true` → 색상 `text-amber-500`, **bold**, 좌측에 작은 도트(`bg-amber-500 rounded-full w-1.5 h-1.5`)
   - hover 시 툴팁 "3 comments · 1 unread"
4. 행 클릭 → 기존대로 `/defects/:id` 로 이동(상세에서 read 마킹).

별도 컬럼은 추가하지 않음(요청대로 Issue No 옆 인디케이터만).

## 상세 페이지 통합
**`src/pages/DefectDetailPage.tsx`** 하단에 카드 추가:
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <MessageSquare className="h-4 w-4" />
      Comments
      {count > 0 && (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted text-xs px-2 py-0.5">
          {count}
        </span>
      )}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <DefectComments
      defectId={record.id}
      defectTeam={record.team ?? null}
      onCountChange={setCount}
    />
  </CardContent>
</Card>
```
DefectComments 가 마운트되면서 `defect_comment_reads` 를 갱신하므로 Row Data 로 돌아왔을 때 미읽음 표시가 자동 해제됨.

## 영향 / 위험
- 기존 데이터·동작 영향 없음(신규 테이블·RLS·RPC 만 추가).
- Row Data 추가 비용: 페이지당 RPC 1회 + Realtime 1채널. 5,000행 한도 내에서 부담 미미.
- 미읽음 표시는 사용자별 read 시각 기준 → 다른 사용자의 미읽음과 무관.
- 알림(notifications) 시스템은 본 작업 범위 밖.

## 검증
- 두 사용자(본인 / admin) 로 댓글 작성·답글·수정·삭제 동작
- senior_user(같은 team) 가 다른 사람의 댓글 수정·삭제 가능, 다른 team 은 불가
- Row Data 에서 댓글 작성 후 다른 사용자 화면에서 노란 점 + 카운트 즉시 반영
- 상세 페이지 진입 후 다시 Row Data 로 가면 미읽음 표시 사라짐
- `bunx tsc --noEmit` 통과
