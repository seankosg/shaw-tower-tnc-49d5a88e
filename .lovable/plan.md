# Warranty Comments 통합 + Thread 일회성 마이그레이션

## 목표
T&C / OMM Raw Data와 동일한 **댓글(Comments) 기능**을 Warranty Raw Data/Detail에 추가하고, 기존 임포트로 쌓인 `warranty_threads` **185건(59 항목)** 을 신규 `warranty_comments` 테이블로 **1회 이전**합니다. **Thread와 Comment를 분리하지 않고 모두 동일한 Comment로 통합**합니다.

## Step A — DB 마이그레이션 (스키마)

`warranty_comments` 테이블 생성 (omm_comments 패턴 그대로):
- `id`, `warranty_item_id` (FK CASCADE), `author_user_id`
- `parent_comment_id` (self-FK CASCADE) — 답글
- `type` ('comment' / 'instruction' / 'reply')
- `message`, `recipients text[]`, `edited`, `created_at`, `updated_at`
- 인덱스: `warranty_item_id`, `parent_comment_id`, `created_at`, GIN(`recipients`)
- RLS (omm_comments와 동일):
  - SELECT: authenticated 모두
  - INSERT: 본인
  - UPDATE/DELETE: 작성자 본인 또는 admin/superuser
- updated_at 트리거

## Step B — 일회성 데이터 마이그레이션

`warranty_threads` 185건 → `warranty_comments` 복사:
- **`message`** = thread 헤더 + 내용 합성:
  ```
  **{display_label}**
  {content}
  ```
  action_party 있으면 `_Action: {party}_` 라인 추가
- **`author_user_id`** = 첫 admin 유저 ID (시스템 마이그레이션)
- **`type`** = `'comment'`
- **`parent_comment_id`** = NULL (모두 최상위, 평탄화)
- **`created_at`** = thread.created_at + sort_order × 1ms (순서 보존)
- 중복 방지 마커: message 끝에 `<!-- migrated_from_thread:{id} -->`

## Step C — UI 코드 변경

1. **`src/components/docs/WarrantyComments.tsx`** (신규)
   - OMM Detail의 댓글 컴포넌트(`DocsOMMDetailPage` 내부 패턴)를 참고해 작성
   - 목록/작성/수정/삭제/답글/recipients 멘션

2. **`src/pages/docs/DocsWarrantyDetailPage.tsx`**
   - 기존 **Discussion Threads 섹션 제거** (사용자 지시: thread/comment 분리 안 함)
   - 그 자리에 `<WarrantyComments warrantyItemId={...} projectId={...} />` 1개 섹션만 노출
   - thread CRUD 코드 / state / fetch 로직 제거

3. **`src/pages/docs/DocsWarrantyRawDataPage.tsx`**
   - 변경 없음 (선택적으로 댓글 카운트 배지는 후속 작업)

## Step D — 후속 정리 (선택)

- **`warranty_threads` 테이블 자체는 이번 작업에서 유지** (안전망). UI에서는 더 이상 노출하지 않음. 안정화 확인 후 별도 작업으로 DROP 가능.
- **임포트 파서**: 다음 임포트부터 `Tread*` 헤더를 `warranty_comments`로 직접 적재하도록 변경 — 별도 작업으로 분리 (이번엔 out of scope).

## Step E — 검증

- `SELECT count(*) FROM warranty_comments` = 185
- `SELECT count(DISTINCT warranty_item_id) FROM warranty_comments` = 59
- Warranty Detail 진입 → Comments 섹션에 임포트된 thread가 시간순으로 평탄하게 표시
- 새 댓글 작성/수정/삭제/답글 동작

승인하시면 Step A 마이그레이션부터 실행합니다.
