## Goal

Docs Management 대시보드(`/docs/dashboard`)를 4개 sub-module(ABD / OMM / Spare Part / Warranty)을 한 페이지에서 한눈에 파악할 수 있는 운영 중심 레이아웃으로 재설계합니다. 기존 T&C 대시보드의 정보 밀도와 비주얼 톤을 유지하되, 도면/문서 영역의 핵심 KPI인 **제출 진행률 / 잔여 / Risk(Red·Amber·Green) / SC Date 기준 lead-time 위반**에 초점을 맞춥니다.

## Current State

`src/pages/docs/DocsDashboardPage.tsx`(115줄)는 ABD만 표시하며 4개 KPI 카드와 단일 Risk 분포 배지가 전부입니다. OMM / Spare Part / Warranty 영역이 비어 있고, 기존 T&C 대시보드 같은 stage progression / drill-down 링크 / 제출 추세가 없습니다.

## Proposed Layout

상하 5개 섹션, 단일 페이지 스크롤 (모바일 935px 폭에서도 read-friendly).

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: Docs Management Dashboard          [Data Date pick]  │
│ Sub: 4 sub-modules · last updated …                          │
├──────────────────────────────────────────────────────────────┤
│ Section 1 — Tier 1 KPI Strip (4 cards × 4 modules = 4)       │
│ ┌──────────┬──────────┬──────────┬──────────┐                │
│ │ ABD      │ OMM      │ Spare P. │ Warranty │  ← module KPI │
│ │ 1,240    │   312    │   178    │    24    │  Total docs   │
│ │ ▰▰▰░ 72% │ ▰▰░░ 41% │ ▰░░░ 18% │ ▰▰▰▰ 92% │  Submit %     │
│ │ R 12     │ R 28     │ R 4      │ R 1      │  Red risk     │
│ └──────────┴──────────┴──────────┴──────────┘                │
├──────────────────────────────────────────────────────────────┤
│ Section 2 — Risk & Status Matrix (한 카드 안에 4모듈 행)      │
│  Module    │ Total │ Submitted │ Pending │ R │ A │ G │ Overdue │
│  ABD       │ 1,240 │   894     │   346   │12 │64 │1164│  18    │
│  OMM       │   312 │   128     │   184   │28 │47 │237 │  31    │
│  ...                                                            │
│ (각 셀 클릭 → 해당 모듈 Raw Data로 필터 적용된 채 이동)         │
├──────────────────────────────────────────────────────────────┤
│ Section 3 — Per-Module Detail (4개 카드, md:2col / xl:4col)   │
│ ┌── ABD Card ───────────┐ ┌── OMM Card ───────────┐         │
│ │ Submit Progress 894/  │ │ ...                   │         │
│ │  1240   72%           │ │                       │         │
│ │ Sub-stage breakdown   │ │ Sub-stage breakdown   │         │
│ │  Sub1 ✓ 1100  Sub2 ⋯  │ │                       │         │
│ │ SC Date: 2026-09-30   │ │ SC Date: —            │         │
│ │ Days to SC: 149       │ │                       │         │
│ │ Top 5 overdue         │ │                       │         │
│ │  • DOC-001 (-12d)     │ │                       │         │
│ │ [Open Raw Data →]     │ │                       │         │
│ └───────────────────────┘ └───────────────────────┘         │
├──────────────────────────────────────────────────────────────┤
│ Section 4 — Submission Trend (Line, last 12 weeks, 1 chart)  │
│  4 색 라인: ABD/OMM/SP/War. 주별 누적 승인 건수             │
├──────────────────────────────────────────────────────────────┤
│ Section 5 — Cross-cutting Tables (탭)                        │
│  [ Subcontractor ] [ HDEC PIC ] [ Trade ]                    │
│  · 행 = 담당자/협력사, 열 = 4모듈별 Pending/Overdue 카운트    │
│  · 행 클릭 → 해당 모듈 + 필터로 deep-link                    │
└──────────────────────────────────────────────────────────────┘
```

## Visual Conventions

기존 T&C / Defect 대시보드와 톤을 통일.

- **Card**: shadcn `Card` + `border-border/60`, padding `p-4`, 카드 헤더는 `text-base font-medium`.
- **KPI 숫자**: `text-2xl tabular-nums font-semibold`, 라벨 `text-xs text-muted-foreground uppercase tracking-wide`.
- **Module 식별 색**(semantic token으로 등록):
  - ABD = `--module-abd` (slate/blue)
  - OMM = `--module-omm` (teal)
  - Spare Part = `--module-sp` (violet)
  - Warranty = `--module-warranty` (amber)
  좌측 4px accent border + 작은 아이콘 칩으로 모듈 구분.
- **Risk pill**: 기존 `computeRisk` 색 토큰 그대로 재사용 (red/amber/green).
- **Progress bar**: shadcn `Progress`, 높이 `h-2`, 라운드 `rounded-full`.
- **Drill-down**: 카드/행/셀 클릭 가능 영역은 `cursor-pointer hover:bg-muted/40` + 키보드 포커스 링.
- **빈 상태**: 모듈 데이터 0건이면 카드 내부에 "No data — Import 탭에서 등록부 업로드" 안내 + 이동 링크.

## Data & Calculations

각 모듈별 단일 SELECT 1회 (병렬 `Promise.all`):

| Module | Source table | 핵심 컬럼 |
|---|---|---|
| ABD | `docs_drawings` (sub_module='as_built') | `is_submitted`, `current_status`, `transmittal_due_date` |
| OMM | `docs_omm` | `current_status` (또는 `status` 필드) |
| Spare Part | `docs_spare_part` | `current_status` |
| Warranty | placeholder — Phase 3 전까지 빈 카드 + "Coming soon" |

공통 파생값:
- `submitProgress = submitted / total`
- `riskBuckets = {red, amber, green}` — `computeRisk(is_submitted, scDate, leadDays)` 재사용 (모듈별 lead-day 설정: `docs_lead_days_as_built`, `docs_lead_days_omm` … `app_settings`).
- `overdueCount` — 해당 모듈에서 due_date 지난 미제출 건수.

Submission Trend는 모듈별 `approved_date`(또는 `sub3_approval_date`)를 주 단위 bucket으로 집계 → 4 시리즈 line chart (recharts `LineChart`).

Cross-cutting 탭:
- Subcontractor 행: ABD/OMM/SP/Warranty 각각의 `subcontractor_name`별 pending/overdue
- HDEC PIC, Trade도 동일 구조

## Interaction

- 헤더의 **Data Date picker**(기존 T&C와 동일 컴포넌트 재사용)로 risk/overdue 재계산.
- KPI 카드, Risk 매트릭스 셀, Per-module Top-5 항목, Cross-cutting 행 → 모두 해당 모듈 Raw Data로 query string 포함 navigate (예: `/docs/abd?status=overdue&as_of=2026-05-04`).
- 새 권한 전제: viewer 역할은 drill-down만, manager+는 export 버튼 노출 (Section 1 우상단).

## Files to Add / Modify

- `src/pages/docs/DocsDashboardPage.tsx` — 전면 재작성
- `src/components/docs/DocsModuleKpiCard.tsx` — Tier1 카드
- `src/components/docs/DocsRiskMatrix.tsx` — Section 2
- `src/components/docs/DocsModuleDetailCard.tsx` — Section 3
- `src/components/docs/DocsSubmissionTrendChart.tsx` — Section 4 (recharts)
- `src/components/docs/DocsCrossCutTabs.tsx` — Section 5
- `src/lib/docs-dashboard-data.ts` — 4개 모듈 데이터 fetch + 집계 헬퍼
- `src/index.css` — 4개 module accent token 추가 (HSL)

OMM/Spare Part 모듈에 `is_submitted` 동등 컬럼이 없으면, status enum 매핑을 `docs-omm-status.ts` / `docs-spare-part-status.ts`에 `isSubmittedLike(status)` 헬퍼로 추가.

## Out of Scope (Phase 3 이후)

- Warranty 9-stage workflow 시각화 (placeholder 카드만)
- 실시간(realtime) 구독, 사용자별 대시보드 커스터마이즈
- PDF/이메일 리포트 자동 발송

## Decisions Needed

1. **모듈 색 팔레트** — 위 제안(slate/teal/violet/amber)으로 갈지, 아니면 단색(slate) 통일 + 아이콘만으로 구분할지
2. **Submission Trend 기간** — 12주 주별 vs 6개월 월별 vs 둘 다 토글
3. **Cross-cutting 탭 표시 단위** — Pending+Overdue 2지표만 vs Total/Submitted/Pending/Overdue 4지표
4. **Warranty 카드** — Phase 1에서는 "Coming soon" placeholder로 두는 게 맞는지 확인
