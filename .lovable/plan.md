## 목표
Admin 페이지에 **Report** 탭을 추가합니다. 모듈/섹션/스냅샷 날짜를 선택하면 앱 내 데이터를 집계해 **Markdown 보고서**를 생성하고, 외부 LLM(Lovable AI Gateway)과 연동해 자동으로 보고서 본문까지 작성할 수 있도록 합니다.

## 노출 제어
- `useAuth().isAdmin === true` 일 때만 `Report` 탭 렌더 (Superuser/D.Superuser 비노출).
- 별도 안내 문구는 표기하지 않음.

## UI (`src/pages/admin/ReportTab.tsx`)

```text
[Report 탭]
┌─ Modules ──────────────────────────────────────────────┐
│ ☑ T&C   ☑ Defect   ☑ Docs (ABD/OMM/Warranty/Spare)    │
│ ☑ Punch                                                 │
└────────────────────────────────────────────────────────┘
┌─ Sections per module ──────────────────────────────────┐
│ ☑ Dashboard summary (KPI, 상태 분포)                    │
│ ☑ Progress summary (스테이지별 누적/주간 진도율)         │
│ ☑ Simulation summary (현재 vs 목표, To-Achieve)         │
│ ☑ Stage Progress Snapshots (날짜별 스테이지 진도율)     │
└────────────────────────────────────────────────────────┘
┌─ Snapshot Dates ───────────────────────────────────────┐
│ 2026-05-30   2026-06-07   2026-06-14   [+ 날짜 추가]    │
└────────────────────────────────────────────────────────┘

[ Generate Markdown ]   [ Copy ]   [ Download .md ]

┌─ Preview (textarea, MD 원문) ──────────────────────────┐

──── External LLM ────────────────────────────────────────
Model: [google/gemini-3-flash-preview ▼]  (gemini/gpt-5 계열 선택)
System prompt: [편집 가능 textarea — 기본값 제공]
[ Generate Report via LLM ]   [ Copy Report ]   [ Download Report .md ]

┌─ LLM Output (스트리밍 표시) ───────────────────────────┐
```

## MD 출력 구조

```markdown
# SHAW Project — Status Report
Generated: YYYY-MM-DD HH:mm (SGT)
Mechanical Completion D-Day: 2026-06-15

## 1. T&C Management
### 1.1 Dashboard
- Total subtests: N / Completed/In Progress/Pending …
### 1.2 Progress (Stages: T1, T2, R2S)
- T1 (Internal Test):     planned X / actual Y (xx%)
- T2 (Official Test):     planned X / actual Y (xx%)
- R2S (Report Submission): planned X / actual Y (xx%)
### 1.3 Simulation
- Current pace, Required pace to MC, Forecast finish, Gap
### 1.4 Stage Progress Snapshots
| Date | T1 % | T2 % | R2S % |
|------|------|------|-------|
| 2026-05-30 | … | … | … |
| 2026-06-07 | … | … | … |
| 2026-06-14 | … | … | … |

## 2. Defect Management
### Stages: Completion, Closure
... (Dashboard / Progress / Simulation / Snapshots)
### Snapshot table
| Date | Completion % | Closure % |

## 3. Docs Management
서브모듈별(ABD / OMM / Warranty / Spare Part) 섹션 + 각 서브모듈의 **모든 스테이지** 스냅샷 표.

## 4. Punch Management
... (Dashboard / Progress / Simulation / Snapshots)
```

## 데이터 집계 매핑

| 모듈 | Dashboard | Progress | Simulation | Snapshot 스테이지 |
|------|-----------|----------|------------|-----------------|
| T&C    | `lib/dashboard-utils.ts` | `lib/stage-metrics.ts` | `lib/tnc-simulation.ts` | **t1, t2, r2s** |
| Defect | `lib/defect-dashboard-utils.ts` | `lib/defect-progress-calc.ts` | `lib/defect-simulation.ts` | **completion, closure** |
| Docs   | `lib/docs-dashboard-data.ts`, `lib/docs-executive-dashboard-data.ts` | `lib/docs-stage-records.ts` | (해당 시) | **모든 stage** (서브모듈별) |
| Punch  | Punch Dashboard 페이지 로직 재사용 | status 기반 카운트 | (없으면 생략) | status 변경일 기반 |

스냅샷 계산: 각 행의 actual 완료일이 snapshotDate 이하인 비율을 백분율로 표기. 데이터 없는 항목은 `_(not available)_` 명시.

## 외부 LLM 연동
- 신규 edge function: `supabase/functions/report-llm/index.ts`
  - body: `{ markdown, model, systemPrompt }`
  - Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) 호출, **스트리밍 SSE** 응답
  - 429/402 에러 토스트로 surface
  - `verify_jwt` 기본값 사용
- 클라이언트는 SSE 토큰을 받아 textarea에 점진적 렌더 → Copy / Download 가능
- 기본 model: `google/gemini-3-flash-preview`, 선택지: gemini-2.5-pro, gpt-5, gpt-5-mini, gpt-5.2
- 기본 system prompt 예: *"You are a construction project status report writer. Convert the following structured Markdown data into an executive-style status report in English with sections, bullet points, and key risks."* (편집 가능)

## 변경 파일
1. **신규** `src/pages/admin/ReportTab.tsx` — UI, 상태, MD 생성/LLM 호출
2. **신규** `src/lib/report-builder.ts` — 모듈별 집계 → MD 빌더 (단위 테스트 가능)
3. **신규** `supabase/functions/report-llm/index.ts` — Lovable AI 게이트웨이 SSE 프록시
4. **수정** `src/pages/AdminPage.tsx` — `Report` `TabsTrigger`/`TabsContent` 추가 (admin 한정)

## 범위 외
- 보고서 결과의 DB 영구 저장 (필요 시 별도 작업)
- 엑셀/PDF 내보내기 (현재는 .md만)

승인하시면 위 구조대로 구현하겠습니다.