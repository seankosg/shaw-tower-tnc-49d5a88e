
## 목표

Report 섹션의 시스템 프롬프트와 빌드되는 마크다운에 새 워딩 규칙을 일괄 반영. 각 모듈은 **현재 상황(Current Status) → 계획(Plan)** 의 자연스러운 흐름으로 구성.

### 워딩 규칙

- T1 → **Pre-Test**, T2 → **Actual Test**
- "PC" 약어 금지 → **Project Completion** 또는 **the Completion** 으로 풀어 표기
- R2 = T&C 최종 단계 → **Test Report** 로 통일, "Submission" 단어 제거
- ABD → **As Built Drawing** 으로 풀어 표기
- "Prediction / Forecast" 대신 **Plan** 사용 (계획 대비 필요 페이스, 스냅샷 계획선 의미)
- 각 모듈을 **(a) Current Status → (b) Plan** 두 파트로 명확히 분리하되, 현황 설명 후 그에 따른 계획으로 자연스럽게 이어지는 서술 흐름 유지

---

## 변경 파일

### 1. `src/pages/admin/ReportTab.tsx`
`DEFAULT_SYSTEM_PROMPT` 교체 (영문, UI 규칙):

> "You are a senior construction project status report writer. Convert the provided structured Markdown data into an executive-style status report in English. Terminology rules: refer to T1 as 'Pre-Test', T2 as 'Actual Test', and R2 as the final 'Test Report' stage (do not use the word 'Submission' for R2). Always write 'Project Completion' or 'the Completion' in full — never abbreviate to 'PC'. Spell 'ABD' as 'As Built Drawing'. For each module, first describe the **Current Status** (actuals to date, gaps versus plan, key risks), then transition naturally into the **Plan** (required pace and milestone targets toward the Completion) so the narrative flows from where things stand to what must happen next. Use clear section headings and concise bullet points. Do not invent numbers — only use values present in the input."

### 2. `supabase/functions/report-llm/index.ts`
- Edge function의 default `sys` 프롬프트를 위와 동일 문구로 교체.

### 3. `src/lib/report-builder.ts`

T&C 섹션 (`buildTncSection`):
- 1.1 Dashboard 라벨: `T1 completed` → `Pre-Test (T1) completed`, `T2 completed` → `Actual Test (T2) completed`, `R2S completed` → `Test Report (R2) completed`
- 1.2 헤더: `### 1.2 Current Status (Stages: Pre-Test, Actual Test, Test Report)`
- 표 행 라벨: `Pre-Test (T1)` / `Actual Test (T2)` / `Test Report (R2)`
- 1.3 헤더: `### 1.3 Plan — Required Pace toward Project Completion (<date>)`
- `Days remaining to PC` → `Days remaining to Project Completion`
- `T2 remaining` → `Actual Test remaining`, `R2S remaining` → `Test Report remaining`
- 1.4 헤더: `### 1.4 Plan — Stage Progress Snapshots`
- 표 헤더: `Pre-Test Planned % (Actual %) | Actual Test Planned % (Actual %) | Test Report Planned % (Actual %)`  
  (기존 "Predicted %" → "Planned %"로 표기. 내부 계산 결과는 simulation 엔진의 predictedPct 그대로 사용)
- 캡션의 `_Computed via Simulation engine — mode: …_` → `_Plan computed via Simulation engine — mode: …_`

Defect 섹션 (`buildDefectSection`):
- 2.2 헤더: `### 2.2 Current Status (Stages: Completion, Closure)`
- 2.3 헤더: `### 2.3 Plan — Required Pace toward Project Completion (<date>)`
- 2.4 헤더: `### 2.4 Plan — Stage Progress Snapshots`, 표 헤더의 `Predicted %` → `Planned %`

Punch 섹션 (`buildPunchSection`):
- 4.2: `### 4.2 Current Status (Stage: Completion)`
- 4.3: `### 4.3 Plan — Required Pace toward Project Completion (<date>)`
- 4.4: `### 4.4 Plan — Stage Progress Snapshots`

Docs 섹션 (`buildDocsSection`):
- `### 3.1 ABD (As-Built Drawings)` → `### 3.1 As Built Drawing (ABD)`

### 4. `src/lib/tnc-raw-data-guide.ts` (Appendix A)
- `T1 — Internal Test` → `Pre-Test (T1) — Internal Test`
- `T2 — Official Test` → `Actual Test (T2) — Official Test`
- `R2 — HDEC → Client Report` 단계 설명에서 "Submission" 단어 정리, 최종산출물을 **Test Report (R2)** 로 호칭 (DB 컬럼명 r2_target_submission_date 등 코드 표기는 유지)
- 본문 내 `R2S` 표현 → `Test Report (R2)` 로 교체
- 어디든 약어 "PC"가 등장하면 `Project Completion`으로 풀어 표기 (현재 가이드엔 없음, 안전 점검)

---

## 비변경 사항

- DB 컬럼명 (`r2_target_submission_date` 등), 내부 식별자 (`r2s`, `mcDate`, `predictedPct`), D-Day 값 (2026-06-15), 다른 페이지/사이드바 라벨은 그대로.
- 영향 범위: Report 마크다운 빌더 + Edge function 시스템 프롬프트 + Appendix A 한정.
