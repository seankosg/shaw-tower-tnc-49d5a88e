## 목표
앱 전반과 마크다운/가이드에서 **"Mechanical Completion"** 표기를 **"Project Completion"** 으로 통일합니다. (D-Day 기준일 자체는 변경하지 않음 — 2026-06-15 유지)

## 변경 파일

### 1) `src/lib/constants.ts`
- 상수 이름 변경: `MECHANICAL_COMPLETION_DDAY` → `PROJECT_COMPLETION_DDAY`
- JSDoc 주석도 "Project Completion target date" 로 수정.

### 2) `src/pages/DashboardPage.tsx`, `src/pages/DefectDashboardPage.tsx`
- import 명 갱신 → `PROJECT_COMPLETION_DDAY`
- `<DDayBadge ... />` 사용처에 `label="PC"` 추가(기본값 MC를 덮어씀).

### 3) `src/components/shared/DDayBadge.tsx`
- 기본 label 을 `'MC'` → `'PC'` 로 변경, 주석도 갱신.

### 4) `src/lib/report-builder.ts`
- 헤더 라인: `_Mechanical Completion D-Day: …_` → `_Project Completion D-Day: …_`
- T&C Simulation 섹션 제목: `(vs Mechanical Completion …)` → `(vs Project Completion …)`
- 모든 `Days remaining to MC` / `vs MC …` 문구 → `Days remaining to PC` / `vs PC …`

### 5) `src/pages/admin/ReportTab.tsx`
- Label: `Mechanical Completion D-Day` → `Project Completion D-Day`
- DEFAULT_SYSTEM_PROMPT 의 "toward Mechanical Completion" → "toward Project Completion"
- 변수명 `mcDate`/`setMcDate` 는 유지(내부 식별자, 사용자 비노출).

### 6) `supabase/functions/report-llm/index.ts`
- 동일하게 시스템 프롬프트 기본값의 "Mechanical Completion" → "Project Completion".

### 7) `src/lib/tnc-raw-data-guide.ts`
- 가이드 본문에는 MC 언급이 없으므로 변경 없음(그대로 유지).

## 비포함
- `system_master`/trade enum 의 "Mechanical"(분야명) 은 무관하므로 손대지 않음.
- DB 컬럼/마이그레이션 변경 없음(D-Day 는 코드 상수).
- 기준일(2026-06-15) 값 자체는 유지.

## 검증
- Dashboard / Defect Dashboard 헤더 배지에 "PC D-XX" 가 표시되는지 확인.
- Admin → Report 탭 Label 이 "Project Completion D-Day" 로 표시되는지 확인.
- Generate Markdown 결과 헤더/섹션 제목/문구가 모두 Project Completion / PC 로 출력되는지 확인.
- 빌드 에러(이전 import 명 미갱신) 없는지 확인.
