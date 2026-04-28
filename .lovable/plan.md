# Instruction / Comment / Reply를 Field Config로 관리되는 가상 컬럼으로 노출

## 목표

`defect_comments` / `subtest_comments`에 쌓이는 대화 내역(Instructions / Comments / Replies)을 Raw Data 그리드(Defects + T&C Subtests)에 **가상 컬럼**으로 표시하고, 일반 필드와 동일하게 **Field Config 화면에서 표시 토글 / 이름 변경 / 순서 변경**이 가능하도록 합니다.

## 사용자 화면 변화

Defect Raw Data 그리드와 Subtest List 그리드에 새 컬럼이 추가됩니다 (기본값은 켜짐 또는 꺼짐 선택 가능):

- **Instructions** — `type='instruction'` 개수
- **Comments** — `type='comment'` 개수
- **Replies** — `type='reply'` 개수
- **Last Activity** — 가장 최근 활동 시간 (선택, 기본 꺼짐)

각 셀 표시:
```text
💬 3   ● (현재 사용자가 안 읽은 항목 있으면 amber 점)
```
- 빈 행은 `—`
- 호버 시 툴팁: "3 instructions · 2 unread · last 2h ago"
- 클릭 시 해당 Defect/Subtest 상세 페이지의 Comments 섹션으로 이동

**Admin → Field Config** 화면에 (Defect / T&C 탭 모두) 다음 항목이 추가됩니다:

| Field name | Display name | Source | Default |
|---|---|---|---|
| `_meta_instruction_count` | Instructions | System | enabled |
| `_meta_comment_count` | Comments | System | enabled |
| `_meta_reply_count` | Replies | System | disabled |
| `_meta_last_activity_at` | Last Activity | System | disabled |

→ 관리자는 일반 필드와 동일하게 활성/비활성, 이름 수정, 순서 변경이 가능합니다. "Virtual" 배지로 일반 필드와 시각적으로 구분합니다.

## 동작 방식 (기술 설명)

### 1. RPC 확장 — type별 개수 분리

기존 `get_defect_comment_summary`, `get_subtest_comment_summary` RPC를 type별 개수와 마지막 활동 시간을 반환하도록 변경:

```sql
-- 반환 컬럼:
-- id uuid, instruction_count int, comment_count int,
-- reply_count int, has_unread bool, last_activity_at timestamptz
```

프론트엔드는 이미 이 RPC들을 호출 중(`DefectRawDataPage.tsx:400`, `SubtestList.tsx:502`)이므로 페이로드만 풍부해집니다.

### 2. Field Config 시드 데이터

`defect_field_config`와 `field_config` 각각에 `_meta_` 접두사가 붙은 4개 행을 INSERT (`source_origin = 'system'`). `_meta_` 접두사는 "가상 컬럼"임을 표시 — 실제 컬럼이 아니므로 Import / Export / Bulk Edit 대상에서 제외됩니다.

### 3. 그리드 통합

`DefectRawDataPage.tsx` / `SubtestList.tsx`에서:

- 컬럼 ID 목록(`DEFECT_RAW_FIELDS` 등)에 4개의 `_meta_*` ID 추가
- 각 meta 필드용 cell renderer 작성 (확장된 `commentSummary` 상태 사용)
- 표시 여부는 기존 `isFieldVisible(field)` 경로를 그대로 통과 → 별도 분기 없음
- 정렬 순서도 기존 `sortFieldNames` / `orderedFieldNames` 경로 그대로 사용
- Bulk Edit, Inline Edit, Excel Export(raw payload), Import 컬럼 매핑에서는 `_meta_*` 제외 처리

### 4. Field Config UI 보호

Field Config 관리 화면에서 `_meta_*` 행은:
- 작은 "Virtual" 배지 표시
- "Required" 토글 비활성화 (가상 컬럼은 import 필수 항목이 될 수 없음)
- 그 외(Display name 수정, Enable/Disable, 순서 변경, Role 가시성)는 동일하게 작동

### 5. 클릭 동작

- Defect 행 셀 클릭 → `/defects/${id}#comments`
- Subtest 행 셀 클릭 → `/subtests/${id}#comments`
- 상세 페이지에서 hash가 `#comments`이면 Comments 섹션으로 자동 스크롤

## 수정할 파일

- `supabase/migrations/<new>.sql` — RPC 2개 교체 + `_meta_*` 행 8개 INSERT
- `src/pages/DefectRawDataPage.tsx` — 가상 컬럼 4개 추가, 타입별 summary 상태, 클릭 핸들러
- `src/pages/SubtestList.tsx` — T&C 측에 동일 처리
- `src/pages/AdminPage.tsx` (Field Config 편집 영역) — Virtual 배지 + Required 토글 비활성화
- `src/pages/DefectDetailPage.tsx`, `src/pages/SubtestDetail.tsx` — `#comments` hash 시 스크롤
- `src/lib/defect-excel-export.ts`, `src/lib/excel-export.ts` — `_meta_*` 제외

## 범위 외 (이번 작업에서 안 함)

- Comment 작성/수정 로직 변경 (`DefectComments.tsx` / `SubtestComments.tsx`는 손대지 않음)
- 그리드에 메시지 본문 표시 (개수만 노출, 본문은 상세 페이지)
- "안 읽은 것만 보기" 같은 그리드 필터링 (필요 시 추후 추가)