## 두 가지 작업

### 작업 A — 댓글 작성 시 대상자(Recipients) 필수 선택
T&C(Subtest)와 Defect Management 양쪽 댓글/Instruction 작성 시 **"To" 대상자**를 반드시 선택해야 저장되도록 구성. 다중 선택 가능.

**대상 카테고리** (해당 record의 책임자 정보를 기반으로 자동 후보 생성):
- HDEC PIC (`hdec_pic_name`)
- HDEC ENG (`hdec_eng_name`)
- Subcontractor (`subcontractor_name`)
- Sub-Sub (`subsub_name`)

존재하지 않는 카테고리(예: subsub가 비어있는 record)는 옵션에서 자동 제외.

### 작업 B — Dashboard "View All" 빈 페이지 원인 수정
- **원인**: `/comments/subtest` 페이지 (`AllCommentsView`)가 PostgREST embed 문법 `subtests(id, item_no, ...)`을 사용하는데, **`subtest_comments.subtest_id → subtests.id` 외래키가 DB에 정의되어 있지 않음**. 따라서 PostgREST가 관계를 찾지 못해 쿼리가 실패하고 페이지에 아무것도 표시되지 않음. (defect_comments는 FK가 있어서 정상 동작하지만 데이터가 0건이라 마찬가지로 비어 보임.)
- **수정**: `subtest_comments.subtest_id`에 FK 추가 (cascade delete). 같은 점검으로 `subtest_comments.parent_comment_id`, `defect_comment_reads`, `subtest_comment_reads`도 FK가 없는 경우 일관성 있게 추가.

---

## 작업 항목

### 1. DB 마이그레이션 — 누락된 FK 추가
- `subtest_comments.subtest_id → subtests(id) ON DELETE CASCADE`
- `subtest_comments.parent_comment_id → subtest_comments(id) ON DELETE CASCADE`
- `subtest_comment_reads.subtest_id → subtests(id) ON DELETE CASCADE`
- `subtest_comment_reads.user_id → auth.users(id) ON DELETE CASCADE`
- `defect_comment_reads.defect_id → defect_items(id) ON DELETE CASCADE`
- `defect_comment_reads.user_id → auth.users(id) ON DELETE CASCADE`

(comments 테이블의 author_user_id도 FK 추가하면 좋지만, 기존 시스템 패턴상 auth.uid()만 비교하므로 FK 없이도 무방. 일단 보류.)

### 2. DB 마이그레이션 — 댓글에 recipients 컬럼 추가
- `subtest_comments.recipients text[] NOT NULL DEFAULT '{}'`
- `defect_comments.recipients text[] NOT NULL DEFAULT '{}'`
- 값 형식: `['hdec_pic', 'hdec_eng', 'subcontractor', 'subsub']` 중 하나 이상
- 기존 데이터는 빈 배열로 유지(과거 데이터에 강제 적용은 하지 않음 — 신규 작성에만 필수).

### 3. 신규 컴포넌트 — `RecipientSelector`
- 위치: `src/components/comments/RecipientSelector.tsx`
- Props: `availableRecipients: { key: string; label: string; name: string | null }[]`, `value: string[]`, `onChange(value)`, `disabled?`
- 체크박스 형태의 인라인 그룹 (4개 옵션, 각 옆에 실제 담당자 이름 작게 표시)
- 비어있는 카테고리(name이 null/empty)는 비활성 + 회색 처리

### 4. `SubtestComments.tsx` / `DefectComments.tsx` 수정
- 부모로부터 책임자 4개 prop 추가 수신:
  - `hdecPicName`, `hdecEngName`, `subcontractorName`, `subsubName`
- 새 state: `recipients: string[]`
- 신규 작성 영역에 `<RecipientSelector>` 추가
- Send 버튼 활성 조건에 `recipients.length > 0` 추가
- Reply는 부모 댓글의 recipients를 그대로 상속(또는 사용자가 변경 가능)
- INSERT payload에 `recipients` 포함
- 표시 영역: 각 댓글 헤더에 recipient badge들 노출 (예: `To: HDEC PIC, Subcontractor`)
- Edit 모드는 메시지 수정만 — recipients는 잠금 (단순화)

### 5. 부모 페이지 prop 전달
- `src/pages/SubtestDetail.tsx`: `<SubtestComments>`에 4개 책임자 이름 전달
- `src/pages/DefectDetailPage.tsx`: `<DefectComments>`에 4개 책임자 이름 전달

### 6. `AllCommentsView.tsx` 보강
- recipients 컬럼을 select에 포함하고 각 행에 To 배지 표시
- (1번 마이그레이션 후) 기존 쿼리는 자동으로 정상 동작 — 추가 변경 불필요

---

## 기술 세부사항

- Recipient 키는 enum으로 고정: `'hdec_pic' | 'hdec_eng' | 'subcontractor' | 'subsub'`
- DB는 단순 `text[]` (CHECK 제약 대신 클라이언트 검증 + 향후 필요시 trigger)
- Reply의 type은 항상 `'reply'`이며 recipients 강제 없음(부모 상속). 신규 comment/instruction에만 필수.
- 기존 댓글(빈 recipients)은 표시 시 "To: —" 또는 표시 생략

## 변경 파일

- `supabase/migrations/<new>` (FK 추가 + recipients 컬럼)
- `src/components/comments/RecipientSelector.tsx` (신규)
- `src/components/defects/SubtestComments.tsx` (수정)
- `src/components/defects/DefectComments.tsx` (수정)
- `src/components/comments/AllCommentsView.tsx` (수정 — recipient 배지 표시)
- `src/pages/SubtestDetail.tsx` (수정 — prop 전달)
- `src/pages/DefectDetailPage.tsx` (수정 — prop 전달)
