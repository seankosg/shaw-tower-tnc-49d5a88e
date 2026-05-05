## 목표
Docs Dashboard를 **ABD + OMM** 중심으로 재설계. 현재 OMM 데이터 소스 컬럼이 변경되어(`submission_actual_date` 등 제거, 워크플로우 컬럼 도입) 깨진 집계를 복구하고, 사용자가 한눈에 "어디가 막혔는지" 파악할 수 있도록 레이아웃을 정돈합니다. Spare Part / Warranty 카드는 자리만 유지(Coming soon 톤).

## 디자인 컨셉
- **톤**: 기존 앱과 동일한 professional / Inter / 차분한 카드형. 새 색상 추가 없음.
- **정보 위계**: Health (한 줄) → Module Focus (ABD / OMM 좌우 카드) → 진행 흐름 → Action lists.
- **반응형**: 1655px 기준 2열, 1280px 미만 1열.

## 레이아웃 (위→아래)

```text
┌────────────────────────────────────────────────────────────┐
│ Header: Title · Project filter · Data Date picker          │
├────────────────────────────────────────────────────────────┤
│ Section 1 — Portfolio Health Strip (4 KPI 카드, 1줄)        │
│ [ABD] [OMM] [Spare Part: dim] [Warranty: dim]              │
├────────────────────────────────────────────────────────────┤
│ Section 2 — Module Focus (2열: ABD | OMM)                  │
│  · Donut: Submitted / Pending / Overdue                    │
│  · 7-stage funnel (OMM) 또는 Sub1→Sub3 funnel (ABD)        │
│  · Risk chip row: Red / Amber / Green                      │
├────────────────────────────────────────────────────────────┤
│ Section 3 — Submission & Approval Trend (라인 차트)         │
│  · Day / Week / Month 토글 · ABD vs OMM 2 series           │
├────────────────────────────────────────────────────────────┤
│ Section 4 — Attention Required (탭)                         │
│  [Overdue] [Stuck > 14d] [Awaiting Response]                │
│  → 모듈 뱃지 + 행 라벨 + 경과일 + 담당자 (클릭 시 상세)      │
├────────────────────────────────────────────────────────────┤
│ Section 5 — Workload Cross-Cut (탭)                         │
│  [Subcontractor] [HDEC PIC] [Trade]                         │
│  → 가로 누적 막대: Submitted / Pending / Overdue            │
└────────────────────────────────────────────────────────────┘
```

## 데이터 연동 수정 (핵심)

### `src/lib/docs-dashboard-data.ts` — OMM 집계 재작성
현재 코드가 존재하지 않는 컬럼(`submission_actual_date`, `final_response_planned_date`, `work_trade_material`, `submission_target_date`, `draft_target_date`)을 select / 참조 → **빈 결과**가 반환됨. 실제 스키마에 맞게 변경:

- SELECT: `id, sn, contract_doc, project_id, draft_planned_date, draft_actual_date, draft_response_status, draft_response_date, final_planned_date, final_actual_date, final_response_planned_date, final_response_actual_date, final_response_status, hdec_pic_name, subcontractor_name, trade, current_stage, current_status, pdf_required_qty, pdf_actual_qty, hardcopy_required_qty, hardcopy_actual_qty, category`
  - (확인 결과 `final_response_planned_date` 와 `draft_response_date` 는 실제로 존재. 이전 select 문구가 누락 — 새 select 로 재구성)
- Submitted = `computeOmmStatus(row) === 'Approved'`
- Due date = `final_response_planned_date ?? final_planned_date ?? draft_planned_date`
- Top-overdue label: `${sn} — ${contract_doc ?? category ?? ''}`
- Stage 분포 추가: `computeOmmStage(row)` 의 Draft / Final / Closed 카운트 → 새 funnel용
- Copy quantity short 카운트 추가: `copyAlertState(pdf_required_qty, pdf_actual_qty)` 가 `'short'` 인 행 수 → "Copy Shortfall" KPI 보조 지표

### `ModuleStats` 타입 확장
- `stageCounts: { draft: number; final: number; closed: number }` (OMM 전용, ABD는 sub1/sub2/sub3 단계 카운트로 재사용)
- `copyShortfall?: number` (OMM 전용)
- `awaitingResponse: number` (Draft Under Review + Final Under Review 합)

## 신규 / 변경 컴포넌트

| 컴포넌트 | 종류 | 설명 |
|---|---|---|
| `DocsModuleKpiCard` | 변경 | 우측 상단에 "Risk Red" 외 "Awaiting" 보조 수치 1줄 추가 |
| `DocsModuleFocusCard` | **신규** | 모듈별 Donut + Funnel + Risk chip 통합. ABD / OMM 각각 1개씩 |
| `DocsStageFunnel` | **신규** | 가로 funnel bar (Pending Draft → Draft Review → Pending Final → Final Review → Approved). ABD는 (Pending → Sub1 → Sub2 → Sub3 → Approved) |
| `DocsAttentionTabs` | **신규** | Overdue / Stuck / Awaiting Response 탭 + 행 리스트 (모듈 뱃지 색 구분) |
| `DocsSubmissionTrendChart` | 변경 | series 색상을 ABD=primary, OMM=accent 로 분리, Spare/Warranty 라인 제거 |
| `DocsCrossCutTabs` | 유지 | 모듈 필터 셀렉트(All / ABD / OMM) 추가 |
| `DocsRiskMatrix` | **삭제** | Module Focus 카드의 Risk chip 으로 정보 중복 → 제거 |
| `DocsModuleDetailCard` | **삭제** | Module Focus 카드로 대체 |

## 스타일 토큰
- 모듈 뱃지 색: ABD = `bg-primary/10 text-primary`, OMM = `bg-accent/15 text-accent-foreground` (기존 토큰만 사용)
- Funnel bar: `bg-muted` 트랙 + `bg-primary` 채움, 단계 경계는 `border-background` 흰 분리선
- Donut: recharts `PieChart` — submitted=`hsl(var(--primary))`, pending=`hsl(var(--muted-foreground)/0.4)`, overdue=`hsl(var(--destructive))`

## 변경 파일
- `src/lib/docs-dashboard-data.ts` — OMM select / 집계 / 새 필드
- `src/pages/docs/DocsDashboardPage.tsx` — 섹션 재배치
- `src/components/docs/DocsModuleFocusCard.tsx` (신규)
- `src/components/docs/DocsStageFunnel.tsx` (신규)
- `src/components/docs/DocsAttentionTabs.tsx` (신규)
- `src/components/docs/DocsModuleKpiCard.tsx` (보조 지표 1줄 추가)
- `src/components/docs/DocsSubmissionTrendChart.tsx` (series 정리)
- `src/components/docs/DocsCrossCutTabs.tsx` (모듈 필터 추가)
- `src/components/docs/DocsRiskMatrix.tsx` (삭제)
- `src/components/docs/DocsModuleDetailCard.tsx` (삭제)

## 비범위
- Spare Part / Warranty 데이터 연동은 기존 그대로 두고 KPI 카드만 dim 처리 유지.
- 새 DB 컬럼/마이그레이션 없음.
- 권한 변경 없음 (super_guest+ 가 Docs Dashboard 접근하는 현 정책 유지).
