
## 목적
Defect Detail 페이지에서 **Priority**, **HDEC's Verification**, **HDEC's Reason** 값을 수정 가능하게 만들고, 수동 수정된 값은 이후 import / 자동 분류 backfill에서 덮어쓰지 않도록 보존(잠금)한다.

## 변경 사항

### 1. DB 스키마 (migration)
`defect_items` 테이블에 잠금 플래그 2개 추가:
- `priority_locked boolean NOT NULL DEFAULT false` — 사용자가 Priority를 수동 변경한 경우 true
- `hdec_verification_locked boolean NOT NULL DEFAULT false` — 사용자가 HDEC's Verification 또는 Reason을 수동 변경한 경우 true

별도 RLS 변경 없음(기존 정책 사용).

### 2. Detail 페이지 UI (`src/pages/DefectDetailPage.tsx`)
- **Priority**: 현재 표시되지 않음 → `SelectField` 추가 (Classification 그룹). 옵션은 기존 Priority 마스터/유니크 값에서 가져옴.
- **HDEC's Verification**: `ReadonlyField` → `SelectField`로 교체. 옵션: `Cat A - Major Defect (Before SC)` / `Cat B - Minor Defect` / `Review Needed` / (빈 값).
- **HDEC's Reason**: 회색 박스 표시 → `Textarea`로 교체.
- 세 필드 옆에 **잠금 상태 뱃지**(🔒 Locked / Auto) 표시. 잠금 해제 버튼 제공 → 다음 import/backfill 때 다시 자동 분류되도록.
- 사용자가 값을 변경하면 저장 시점에 해당 `*_locked` 플래그를 자동으로 true 세팅.
- 권한: 기존 `canEdit` 사용. `useDefectFieldConfig`의 `isFieldEditable` 게이트도 적용 (admin은 항상 통과).

### 3. Import 로직 (`src/contexts/DefectImportContext.tsx`)
- Priority 적용 직전: `existing.priority_locked === true`면 import 값 무시하고 `existing.priority` 유지 + import_field_log에 `skipped_locked` 기록.
- HDEC's Verification 분류 블록(라인 890~):
  - `existing.hdec_verification_locked === true`면 `verifyPriority` 자체를 호출하지 않고 `existing` 값 유지, `priority_verification_locked` 로그 추가.
- 잠금 플래그 자체는 import에서 절대 변경하지 않음(보존).

### 4. Backfill Edge Function (`supabase/functions/defect-priority-verification-backfill/index.ts`)
- CLEAR pass / SET pass 모두 `hdec_verification_locked = false` 조건 추가.
- 응답에 `locked_skipped` 카운터 추가.

### 5. 표시 동기화
- `src/lib/defect-cache.ts`, `src/contexts/DefectImportContext.tsx`의 컬럼 화이트리스트에 두 잠금 컬럼 포함시켜 Detail이 최신 상태를 받도록 보장.
- Raw Data 테이블에는 컬럼 추가하지 않음(요구 범위 외).

## 기술 메모
- 자동 분류 트리거(import)와 수동 잠금이 충돌하지 않도록, 잠금 체크가 항상 분류 로직보다 먼저 실행.
- Backfill에서 잠금 해제 후 재실행하면 자동 규칙으로 다시 채워짐.
- 잠금 해제 버튼 클릭 시 즉시 DB UPDATE (값은 그대로 두고 플래그만 false).
- 마이그레이션 후 `src/integrations/supabase/types.ts` 자동 재생성되므로 코드 수정은 그 이후 진행.

## 영향받는 파일
- `supabase/migrations/<new>.sql` (신규)
- `src/pages/DefectDetailPage.tsx`
- `src/contexts/DefectImportContext.tsx`
- `src/lib/defect-cache.ts`
- `supabase/functions/defect-priority-verification-backfill/index.ts`
