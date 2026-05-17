
# 일반 사용자 PPT 커스터마이즈 통합 구현

## 목표
Code Editor (Lovable 채팅 의존) 없이도 일반 사용자(`user` 이상)가 PPT 보고서의 **색/폰트/문구/레이아웃/표시 옵션**을 직접 편집할 수 있게 한다.

---

## A. 권한 개방 — Report 메뉴를 일반 사용자에게 공개

### A-1. 라우트/메뉴 권한 변경
- `/admin/report` 페이지를 `AdminReportPage` 에서 분리해 **일반 사용자 접근 가능한 새 경로 `/report`** 로 이동
- 사이드바(`AppSidebar`)에 "Report" 메뉴 노출 — `user` 이상 모두 표시
- `/admin/report` 는 admin 전용 항목(Code Editor 등)만 남기거나 redirect

### A-2. 탭별 권한 차등
| 탭 | 접근 | 편집 |
|---|---|---|
| Report Generator (PPT 다운로드) | user 이상 | user 이상 |
| Design Tokens | user 이상 | senior_user 이상 |
| Slide Composer | user 이상 | senior_user 이상 (본인 팀 슬라이드만 d_superuser 규칙 적용) |
| Slide Text Overrides | user 이상 | senior_user 이상 |
| Design Guide | user 이상 | admin |
| Code Editor | admin | admin (그대로) |

### A-3. DB RLS 정책 업데이트
- `design_tokens` — SELECT all, UPDATE는 `senior_user` 이상
- `slide_text_overrides` — SELECT all, INSERT/UPDATE/DELETE는 `senior_user` 이상
- `slide_config` (Slide Composer) — 동일 정책
- `custom_slides` — INSERT/UPDATE는 본인 row + Admin은 전체

---

## B. 텍스트 토큰 레지스트리 확장

### B-1. `src/lib/text-token-registry.ts` 항목 추가
현재 12개 슬라이드에 ~20개 필드만 등록 → **약 50~60개로 확장**:

- **공통 푸터**: `footer.company`, `footer.report_no`, `footer.page_format` (모든 슬라이드에 공유)
- **Cover**: `title` (현재 서브타이틀만 있음), `date_label`, `project_name`
- **Dashboard**: 4개 컬럼 헤더 (`col_tnc`, `col_defect`, `col_docs`, `col_punch`)
- **T&C / Defect / Docs / Punch Snapshot**: subhead, footnote
- **S-Curve**: Y축 라벨, 범례 (Plan / Actual / Forecast)
- **Action Plan**: 좌/우 패널 기본 안내 문장, 푸터 강조 텍스트
- **Forecast**: 마일스톤 라벨 (SC, MC, TOP 등)

### B-2. 푸터 같은 "공통 토큰" 지원
- 레지스트리에 `__common` slide key 도입
- `resolveText` 가 slide-specific → common → default 순서로 해석
- 모든 슬라이드 빌더가 푸터를 그릴 때 동일한 함수로 조회

### B-3. `SlideTextEditor` UI 개선
- 슬라이드 선택 위에 **"Common (all slides)"** 옵션 추가
- 검색창 추가 (필드명/슬라이드명 부분 일치)
- "Overridden only" 토글 — 커스텀된 것만 빠르게 확인

---

## C. Slide Composer 카드별 "Edit" 버튼 + 표시 옵션

### C-1. 새 테이블 `slide_display_options`
```text
id              uuid pk
slide_key       text     -- 'tnc_snapshot' 등 (custom slide 는 custom_slides.id)
options         jsonb    -- 슬라이드별 옵션 객체
updated_by      uuid
updated_at      timestamptz
unique(slide_key)
```
RLS: SELECT all, INSERT/UPDATE는 senior_user 이상.

### C-2. 슬라이드별 옵션 스키마 (Zod)
표준 12개 슬라이드 각각에 대해 어떤 옵션을 노출할지 정의:

- **공통 옵션** (모든 슬라이드):
  - `visible`: boolean (이미 Slide Composer 에 있음 — 통합)
  - `show_footer`: boolean
  - `headline_font_size_offset`: number (-4 ~ +4)

- **Snapshot 류**:
  - `show_stage_progress`: boolean
  - `show_kpi_strip`: boolean
  - `kpi_selection`: string[] (KPI 키 배열, 최대 4개)
  - `kpi_order`: string[]

- **S-Curve 류**:
  - `chart_type`: 'line' | 'area' | 'bar'
  - `show_forecast`: boolean
  - `y_axis_zero_based`: boolean
  - `date_range`: 'all' | 'last_30d' | 'last_90d' | 'custom'

- **Forecast**:
  - `milestones`: string[] (표시할 마일스톤)
  - `bar_orientation`: 'horizontal' | 'vertical'

- **Action Plan**:
  - `panels`: ('left' | 'right')[]
  - `max_items_per_panel`: number (3~10)

- **Critical Watchlist 포함 슬라이드**:
  - `watchlist_top_n`: number (5~20)
  - `watchlist_sort`: 'delay_days' | 'dday' | 'priority'
  - `filter_team`: string | null
  - `filter_system`: string | null

### C-3. UI — Slide Composer 카드에 "Edit" 아이콘 추가
- 각 슬라이드 카드 우측에 ⚙️ 버튼
- 클릭 시 `<Dialog>` 열림 — 슬라이드 타입별 폼 (react-hook-form + zod)
- 폼 필드는 C-2 스키마 기반으로 자동 렌더 (체크박스/select/슬라이더/multi-select)
- 우측에 **실시간 프리뷰 영역** (선택 사항, 초기엔 미니맵 없이 "Save & Regenerate" 만)
- "Reset to default" 버튼

### C-4. PPT 빌더에서 옵션 적용
- `src/lib/ppt-builder.ts` 각 슬라이드 함수 시작부에서 `fetchSlideDisplayOptions(slideKey)` 호출
- 캐시는 `design-tokens` 와 동일한 5분 TTL
- 각 옵션을 분기 처리 (e.g. `if (!opts.show_stage_progress) skip; }`)
- 기존 동작은 모든 옵션 기본값일 때 그대로 유지 (하위 호환)

### C-5. `src/lib/slide-display-options.ts` 신규 파일
- `fetchSlideDisplayOptions()`, `saveSlideDisplayOptions()`, `resetSlideDisplayOptions()`
- Zod 스키마 export
- 캐시 invalidate 함수

---

## 작업 순서 (한 번에 진행)

1. **DB 마이그레이션** — `slide_display_options` 테이블 + 5개 테이블 RLS 정책 업데이트
2. **레지스트리/라이브러리**
   - `text-token-registry.ts` 확장 + `__common` 지원
   - `slide-display-options.ts` 신규
   - `resolveText` 공통 토큰 fallback 로직
3. **PPT 빌더** — 12개 슬라이드 빌더에 옵션 분기 추가, 푸터에 공통 토큰 적용
4. **UI**
   - `AppSidebar` 에 Report 메뉴 추가, 권한 가드 완화
   - 새 페이지 `src/pages/ReportPage.tsx` (탭 구조는 `AdminReportPage` 복사 + Code Editor 제외)
   - `SlideTextEditor` — 공통 탭/검색/오버라이드 필터
   - `SlideComposer` 카드에 ⚙️ Edit 버튼 + `SlideDisplayOptionsDialog` 신규
   - 역할 기반 read-only 모드 (편집 권한 없는 사용자는 보기만)
5. **검증** — 각 슬라이드 기본 출력이 변하지 않는지, 옵션 변경 시 즉시 반영되는지

---

## 변경/추가 파일 요약

**신규**
- `supabase/migrations/<timestamp>_*.sql` (테이블 + RLS)
- `src/pages/ReportPage.tsx`
- `src/lib/slide-display-options.ts`
- `src/components/admin/SlideDisplayOptionsDialog.tsx`

**수정**
- `src/App.tsx` (라우트 추가)
- `src/components/layout/AppSidebar.tsx` (메뉴 항목)
- `src/pages/admin/AdminReportPage.tsx` (탭 정리)
- `src/components/admin/SlideComposer.tsx` (Edit 버튼)
- `src/components/admin/SlideTextEditor.tsx` (공통/검색)
- `src/components/admin/DesignTokensEditor.tsx` (권한 조건 완화)
- `src/lib/text-token-registry.ts` (토큰 ~40개 추가)
- `src/lib/ppt-builder.ts` (12개 슬라이드 함수에 옵션 분기)
- `src/lib/slide-text-overrides.ts` (공통 토큰 처리)

---

## 비기능 요건
- 모든 UI 라벨/버튼은 영어 (메모리 규칙)
- 기존 PPT 출력과 100% 하위 호환 (옵션 없으면 현재와 동일)
- D.Super User 는 본인 팀 데이터만 편집 가능 (memory의 d_superuser 규칙 유지)

## 범위 제외
- Code Editor 자체는 손대지 않음 (admin 전용으로 그대로)
- 자유 콘텐츠/이미지 슬라이드 (D 범위) — New Slide Generator로 이미 대체 가능
- 실시간 PPT 프리뷰 — 후속 작업으로 분리

승인 시 위 순서대로 한 번에 구현하겠습니다.
