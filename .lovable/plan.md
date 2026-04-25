## T&C(Subtest) 댓글 시스템 구현 계획

Defect 댓글 시스템과 동일한 구조를 T&C(subtests) 페이지에도 적용합니다.

### 1. 데이터베이스 (마이그레이션)

**새 테이블 2개 생성** — 기존 `defect_comments` / `defect_comment_reads`와 동일 구조:

- **`subtest_comments`**: `id, subtest_id, parent_comment_id, author_user_id, type ('comment'|'instruction'|'reply'), message, edited, created_at, updated_at`
- **`subtest_comment_reads`**: `user_id, subtest_id, last_read_at` (사용자별 마지막 읽음 시각)

**RLS 정책**:
- 모든 인증 사용자: 댓글 읽기 가능
- 본인만 자신의 댓글 작성 가능
- 수정/삭제는 `can_modify_subtest_comment(_user_id, _comment_id)` SECURITY DEFINER 함수로 검사
  - 권한: 본인 OR admin/superuser OR 같은 team 의 senior_user
- `subtest_comment_reads`는 본인 행만 select/insert/update

**RPC 함수**: `get_subtest_comment_summary(_subtest_ids uuid[])`
- 반환: `subtest_id, comment_count, last_comment_at, has_unread`
- Raw Data 표에서 보이는 행들의 댓글 개수 + 미읽음 여부를 한 번에 조회

**트리거**: `fn_subtest_comments_touch` — `updated_at` 자동 갱신, message 변경 시 `edited=true`

**Realtime**: `subtest_comments` 테이블을 `supabase_realtime` publication에 추가

### 2. 프론트엔드

**새 컴포넌트** `src/components/defects/SubtestComments.tsx`
- `DefectComments.tsx`를 그대로 복제하되 `defect_id` → `subtest_id`, 테이블명/RPC명 변경
- `defectTeam` 대신 `subtestTeam` prop 받음 (senior_user 같은 팀 권한 검사용)

**`src/pages/SubtestDetail.tsx` 수정**
- 페이지 하단(Change History 카드 다음)에 "Comments" 카드 추가
- 카드 헤더: `Comments (N)` 형태로 카운트 뱃지 표시
- `<SubtestComments subtestId={...} subtestTeam={...} />` 렌더링

**`src/pages/SubtestList.tsx` 수정** (T&C Raw Data 표)
- 마운트 시 보이는 행들의 `subtest_id`로 `get_subtest_comment_summary` 호출 → `commentSummary` 상태 저장
- 필터/페이지가 바뀔 때 visible row 변경 감지 후 재조회
- `item_no` 컬럼 cell 안에 💬 아이콘 + 개수 표시
- 미읽음 있으면 amber dot + bold amber 색상 (Defect와 동일 스타일)
- Realtime 채널로 `subtest_comments` INSERT 감지 시 summary 갱신

### 3. 권한 요약 (Defect와 동일)

| 행위 | 허용 대상 |
|------|----------|
| 댓글 보기 | 모든 인증 사용자 |
| 댓글 작성 | 모든 인증 사용자 |
| Instruction 작성 | admin / superuser / senior_user |
| 댓글 수정/삭제 | 본인 + admin/superuser + 같은 팀 senior_user |
| 미읽음 표시 | 사용자별로 자동 추적 (상세 진입 시 읽음 처리) |

### 변경 파일

- 마이그레이션 1개 (테이블 2개, RLS, 함수 2개, 트리거, realtime)
- 신규: `src/components/defects/SubtestComments.tsx`
- 수정: `src/pages/SubtestDetail.tsx`
- 수정: `src/pages/SubtestList.tsx`
