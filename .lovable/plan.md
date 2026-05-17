
# Phase 2-A 구현 계획 — Design Tokens

승인된 사항:
- AI 호출은 **Anthropic Claude 직접 호출** (`claude-sonnet-4-20250514`), `ANTHROPIC_API_KEY` 시크릿 사용 → Phase 2-B/2-C-C 시작 시점에 시크릿 등록 요청
- 5단계 분할 진행 → 지금은 **Phase 2-A만** 작업
- Phase 2-A 즉시 시작

---

## 목표
`src/lib/ppt-builder.ts` 상단 하드코딩 컬러 7개(`COLOR_PRIMARY` 등)를 DB로 분리. Admin이 코드 수정 없이 색을 바꿔 PPT에 즉시 반영.

> 이번 단계는 **컬러 토큰만** 다룹니다 (폰트는 이미 font_registry로 분리됨). YAML/AI는 Phase 2-B에서.

---

## 1. 데이터베이스 (Migration)

테이블 `design_tokens` (key-value singleton 방식):

| 컬럼 | 타입 | 비고 |
|---|---|---|
| key | TEXT PK | 예: `ppt.color.primary` |
| value | TEXT | hex (6자리, `#` 없음) — pptxgenjs 규격 |
| description | TEXT | UI 라벨 |
| category | TEXT | 그룹핑용 (`ppt-color`) |
| updated_by | UUID | profiles.user_id |
| updated_at | TIMESTAMPTZ | 기본 now() |

기본 행 7개 시드:
- `ppt.color.primary` → `1E2761`
- `ppt.color.accent` → `4F46E5`
- `ppt.color.text` → `1F2937`
- `ppt.color.muted` → `6B7280`
- `ppt.color.bg_soft` → `F1F5F9`
- `ppt.color.danger` → `DC2626`
- `ppt.color.ok` → `16A34A`

RLS:
- SELECT: 인증된 모든 사용자 (PPT 빌드 시 누구나 읽어야 함)
- INSERT/UPDATE/DELETE: admin only (`is_admin_or_superuser(auth.uid())`)

값 검증 트리거: hex 6자리 정규식 `^[0-9A-Fa-f]{6}$` (잘못된 형식 거부).

`updated_at` 자동 갱신 트리거 (`public.update_updated_at_column` 재사용).

## 2. 클라이언트 토큰 로더

신규 파일 `src/lib/design-tokens.ts`:
- `DEFAULT_PPT_COLORS` 상수 (DB 다운 시 fallback)
- `fetchPptColorTokens(): Promise<PptColorTokens>` — `design_tokens` SELECT, key 매핑, 누락분은 default로 채움
- 단순 메모리 캐시 (5분 TTL) — 빌드 직전 매번 fetch는 과함

## 3. ppt-builder.ts 리팩토링

- 상단 `const COLOR_*` 7개 제거
- `buildPpt({ data, fontFamily })` 시그니처에 옵셔널 `colors?: PptColorTokens` 추가
- 내부에서 `colors ?? DEFAULT_PPT_COLORS` 사용
- 모든 `COLOR_PRIMARY` 참조를 `colors.primary` 등으로 치환 (약 30~40 군데, 단순 search-replace)

## 4. PptExportCard 연동

- 다운로드 직전 `fetchPptColorTokens()` 호출 → `buildPpt({ data, fontFamily, colors })` 전달
- 실패 시 default로 fallback + toast 경고

## 5. Admin UI — Design Tokens 편집기

신규 컴포넌트 `src/components/admin/DesignTokensEditor.tsx`:
- Report 페이지의 Font Library **바로 아래** 배치 (Card 없이 embedded 스타일, 일관성 유지)
- 7개 컬러 입력 (HTML `<input type="color">` + hex 텍스트 동기화)
- 우측에 라이브 미리보기 (PPT 표지 축소판: primary 배경 + 흰 제목 + accent 칩 등)
- "Reset to defaults" 버튼
- "Save" 버튼 → upsert
- 저장 후 캐시 무효화 → 다음 PPT 빌드부터 반영

권한 가드: Report 페이지 자체가 admin only이므로 컴포넌트 내부 추가 가드 불필요 (RLS가 백업).

---

## 변경/신규 파일 요약

**신규**
- migration: `design_tokens` 테이블 + RLS + 트리거 + 7개 시드
- `src/lib/design-tokens.ts`
- `src/components/admin/DesignTokensEditor.tsx`

**수정**
- `src/lib/ppt-builder.ts` (컬러 상수 → 파라미터화)
- `src/components/report/PptExportCard.tsx` (토큰 fetch + 전달)
- `src/pages/admin/ReportTab.tsx` (DesignTokensEditor 임베드)

---

## 비결정 사항

특별히 없음. 승인 시 마이그레이션부터 진행합니다.

## 다음 단계 (Phase 2-B 시점에 처리)

Phase 2-B 착수 시점에:
1. `ANTHROPIC_API_KEY` 시크릿 등록 요청 (Anthropic Console에서 발급)
2. `design-guide-analyze` edge function (Claude 직접 호출, `claude-sonnet-4-20250514`)
3. YAML 파서 (`js-yaml`) 추가
4. `design-guides` Storage 버킷 + `design_guide_versions` 테이블
5. YAML 업로드/다운로드/diff 분석/롤백 UI

이번 턴은 Phase 2-A 승인 시 곧장 마이그레이션 → 코드 작업 진행합니다.
