# New Slide Generator — Draft 자동 저장

## 문제
미리보기(Step 2)까지 만든 슬라이드는 컴포넌트 state에만 존재. 다른 메뉴 탭으로 이동하면 unmount되며 사라짐. 사용자가 "Report에 추가하기"를 누르기 전까지 휘발성이라 불편.

## 목표
- 미리보기 생성 즉시 DB에 **Draft** 로 저장
- Draft는 Slide Composer 목록·Export PPT에 **노출되지 않음**
- "Report에 추가하기" 버튼을 누르면 Draft → **활성** 상태로 전환되어 노출 시작
- New Slide Generator 화면에 진입하면 **내가 만든 Draft 목록**을 보여주고, 이어서 확정/삭제 가능

## 변경 사항

### 1. DB 마이그레이션 (`custom_slides`)
- `status` 컬럼 추가: `text not null default 'active'`, 값 `'draft' | 'active'`
- 체크 제약 또는 enum 대신 단순 text + check (가벼움)
- 인덱스: `idx_custom_slides_status` (status 부분 필터링용)
- 기존 행은 모두 `'active'`로 백필 (default로 자동)

### 2. 백엔드 로직
- `fetchCustomSlides()` → 기본은 **active만** 반환 (Composer/Export/슬라이드 목록이 영향 안 받음)
- `fetchCustomSlides({ includeDrafts: true })` 옵션 추가 → Generator에서 사용
- `fetchDrafts(userId)` 헬퍼: 내가 만든 draft만 조회
- `insertCustomSlide({status})` 파라미터 지원
- `promoteDraftToActive(id)` 신규: status='active'로 업데이트 후 `appendSlideKey` 호출
- `slide-config.ts` `reconcile()`: draft 키는 활성 슬라이드 목록 후보에서 제외 (active 슬라이드만 customKeys에 포함)

### 3. UI — `SlideCodegen.tsx`
- **Step 1 (Describe)** 위에 "내 Draft" 섹션 추가
  - 마운트 시 본인이 만든 draft 목록 로드 (없으면 섹션 숨김)
  - 각 행: label · 생성일시 · `[Preview] [확정] [삭제]` 버튼
  - Preview 클릭 시 Step 2로 복원
- **Step 2 진입 시점 변경**: `onGenerate` 성공 직후 `insertCustomSlide({status:'draft'})` 호출 → 결과 id 보관
  - 토스트: "미리보기가 Draft로 저장되었습니다 (메뉴 이동해도 유지)"
- **"Report에 추가하기"** → `promoteDraftToActive(draftId)` 호출 (insert가 아닌 update + appendSlideKey)
- **"마음에 안 들어요"** → draft 행 삭제 + state 초기화
- **"다시 만들기"** → 새 description으로 generate 시 기존 draft를 update 또는 삭제 후 재생성 (단순화: 매번 새 draft 생성, 사용자가 목록에서 정리)

### 4. 안내 문구
- Step 2 상단에 "이 미리보기는 Draft 상태입니다. 확정 전까지는 Slide Composer/PPT Export에 표시되지 않습니다." 배지

## 영향 범위
- 파일: `src/lib/custom-slides-cache.ts`, `src/lib/slide-codegen.ts`, `src/lib/slide-config.ts`, `src/components/admin/SlideCodegen.tsx`
- 마이그레이션 1건 (custom_slides에 status 컬럼 추가)
- 기존 활성 슬라이드 동작·표시 변동 없음 (default 'active')

## 기대 효과
- 미리보기 후 메뉴 이동해도 복원 가능
- 확정 단계가 명시적으로 분리되어 "실수로 Report에 들어감" 위험 없음
- 여러 시안을 동시에 만들어두고 비교 후 확정하는 워크플로우 가능
