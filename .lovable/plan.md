## 목표

기존 Tier 3 영역의 **Overdue / At-Risk 배너 각각을 2개로 분리**하여 총 **4개의 배너**를 한 줄에 배치합니다. 현재 디자인(border, 배경색, 아이콘, View 화살표, 클릭 동작)은 그대로 유지하고, 폭만 절반이 됩니다.

```text
┌─────────────────────┬─────────────────────┬─────────────────────┬─────────────────────┐
│ ⚠ 89                │ ⚠ 134               │ 🕐 N                │ 🕐 M                │
│ Overdue Subtests    │ Overdue Stage       │ At-Risk Subtests    │ At-Risk Stage       │
│ unique subtests     │ Occurrences         │ unique subtests     │ Occurrences         │
│ Any stage planned…  │ total stage…        │ Any stage planned…  │ total stage…        │
│              View > │              View > │              View > │              View > │
└─────────────────────┴─────────────────────┴─────────────────────┴─────────────────────┘
```

- **배너 1 (Overdue – Unique)**: `overdueCountAll` 고유 Subtest 수. 기존 destructive 톤. 클릭 → 기존과 동일한 overdue 라우팅.
- **배너 2 (Overdue – Stage Occurrences)**: 6개 스테이지(Pred/T1/T2/R1S/R2S/R2A) 각 지연 건수의 **합계**. destructive 톤. 클릭 → 동일 overdue 라우팅 (현재로선 동일 페이지 이동).
- **배너 3 (At-Risk – Unique)**: `atRiskCountAll` 고유 Subtest 수. warning 톤. 기존과 동일.
- **배너 4 (At-Risk – Stage Occurrences)**: 6개 스테이지 At-Risk 건수의 합계. warning 톤. 클릭 → 동일 at-risk 라우팅.

각 배너는 기존 `AlertBanner` 컴포넌트(제목 + 설명 + View) 구조를 그대로 사용하며, 제목/설명 문구만 종류별로 달라집니다.

## 변경 파일

### 1. `src/lib/dashboard-utils.ts`
신규 헬퍼 2개 추가 (기존 함수 변경 없음):
- `countOverdueStageOccurrences(subs, asOfDate)` → `['pred','t1','t2','r1','r2s','r2a']` 각각에 대해 `isStageDelayedAsOf` 매칭 건수의 총합
- `countAtRiskStageOccurrences(subs, today, thresholdDays)` → 같은 6 스테이지에서 `0 ≤ daysBetween(today, planned) ≤ threshold` 이면서 not Done 인 건수의 총합

### 2. `src/pages/DashboardPage.tsx`
- `kpis` useMemo에 추가: `overdueOccurrencesAll`, `atRiskOccurrencesAll`
- 기존 `<div className="grid gap-3 md:grid-cols-2">` 컨테이너를 **`md:grid-cols-4`** 로 변경
- 그 안에 `AlertBanner` **4개** 배치:
  1. title: `${overdueCountAll} Overdue Subtests`, description: `Unique subtests with any stage overdue as of Data Date (${dataDateLabel}).`
  2. title: `${overdueOccurrencesAll} Overdue Stage Occurrences`, description: `Sum of overdue counts across Pred/T1/T2/R1S/R2S/R2A as of Data Date.`
  3. title: `${atRiskCountAll} At-Risk Subtests`, description: `Unique subtests with any stage planned within ${atRiskDays} day(s) and not Done.`
  4. title: `${atRiskOccurrencesAll} At-Risk Stage Occurrences`, description: `Sum of at-risk counts across Pred/T1/T2/R1S/R2S/R2A within ${atRiskDays} day(s).`
- `AlertBanner` 컴포넌트 자체는 **수정하지 않음** — 시그니처/디자인 그대로
- 화면 좁아질 때 깨지지 않도록 4열은 `md:` 이상에서만 적용, 그 이하에선 1열(현재 grid 기본 동작 유지)

## 비고

- 클릭 라우팅: Stage Occurrences 배너 2개는 Unique 배너와 동일한 라우팅을 사용합니다(현 시점에선 동일 페이지). 추후 stage별 breakdown 페이지가 필요하면 별도 라우팅으로 분리 가능.
- Overdue Stage Occurrences 합계는 Tier 2 스테이지 카드들의 OD 배지 숫자 합과 정확히 일치합니다(예: 2+11+2+74+45+R2S).
- 폰트 크기/패딩 등은 현재 `AlertBanner` 그대로 사용 — 폭이 좁아져도 한 줄짜리 제목/설명이라 자연스럽게 wrap 됩니다.
