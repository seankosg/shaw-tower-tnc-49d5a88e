## 목표
Warranty Raw Data의 코멘트를 Admin/Superuser가 수정할 수 있도록 합니다. 수정 가능 항목: 코멘트 **내용**과 **작성 일시(created_at)**. 또한 삭제도 가능하게 합니다.

## 권한 정책 (이미 준비됨)
`warranty_comments` 테이블의 RLS는 이미 `(author_user_id = auth.uid()) OR is_admin_or_superuser(auth.uid())` 조건으로 UPDATE/DELETE를 허용하고 있습니다. 따라서 **DB 마이그레이션은 불필요**합니다. 단, UPDATE 트리거가 `updated_at`을 자동 갱신하므로 `created_at`을 수동 변경해도 안전합니다.

## 변경 사항

### `src/pages/docs/DocsWarrantyDetailPage.tsx`

**a. 권한 플래그 추가**
- `const canModifyComments = roles.some(r => ['admin', 'superuser'].includes(r));`
- (작성자 본인의 메시지 편집 권한은 이번 범위에서 다루지 않음 — 요청은 Admin 한정)

**b. 코멘트 카드에 편집/삭제 UI 추가**
각 코멘트 항목 우측에 `canModifyComments`일 때만 작은 아이콘 버튼 두 개:
- `Pencil` (편집) → 인라인 또는 Dialog로 편집 모드 전환
- `Trash2` (삭제) → confirm 후 `delete from warranty_comments where id=...`

**c. 편집 Dialog (shadcn `Dialog`)**
필드:
- **Message**: `Textarea` (필수, trim 후 저장)
- **Created at**: `Input type="datetime-local"` (현재 `created_at`을 로컬 datetime-local 포맷으로 표시 ↔ 저장 시 ISO string으로 변환)

저장 동작:
```ts
await supabase.from('warranty_comments').update({
  message: newMessage.trim(),
  created_at: new Date(newDateTimeLocal).toISOString(),
  edited: true,
}).eq('id', commentId);
```
- 성공 시 toast + 코멘트 목록 재조회 (`order created_at asc`)
- 권한 부족(RLS) 에러는 친절한 메시지로 변환

**d. 삭제 동작**
- `window.confirm('Delete this comment?')` 후 delete → 토스트 + 재조회

**e. 표시 보강**
- 코멘트가 `edited === true`이면 날짜 옆에 작은 `(edited)` 라벨 표시

### 범위 외
- 작성자 본인의 자가 편집 UI는 추가하지 않음 (요청은 Admin 한정)
- Realtime 구독 변경 없음 (Raw Data 페이지의 카운트는 기존 구독으로 자동 갱신)
- 다른 모듈(OMM/Defect) 코멘트 편집 UI 변경 없음
- DB 스키마/정책 변경 없음

## 기술 메모
- `datetime-local` ↔ ISO 변환:
  - 표시: `new Date(c.created_at).toISOString().slice(0,16)` 대신 로컬 시간 기준으로 `toLocaleString` 분해 또는 `formatInTimeZone` 없이 간단히 `Date` getters로 `YYYY-MM-DDTHH:mm` 구성
  - 저장: `new Date(value).toISOString()` (브라우저가 로컬 → UTC 변환)
- 정렬은 `created_at asc` 유지하므로 created_at 수정 시 카드 순서가 자연스럽게 재배치됨