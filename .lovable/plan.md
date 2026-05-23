## HDEC's Basis of Cat B — 차트 추가 (분포 시각화)

대상: `src/pages/DefectDashboardPage.tsx` `Banner 2 — HDEC's Basis of Cat B` (≈534~597 line).

### 목표
현재 reason 칩들로만 표시되는 데이터를, 우측에 **분포 차트**로 함께 보여줘 "어떤 사유가 얼마나 큰 비중을 차지하는지" 한눈에 파악.

### 추천 차트: 가로 막대(Horizontal Bar) — 파이차트 아님

**파이차트 비추 사유:**
- reason 라벨이 보통 긴 문장형 텍스트 → 파이 슬라이스 라벨 배치 어려움, 범례 길어짐
- 항목 수가 가변(5~15+) → 슬라이스 많아지면 가독성·색 구분 급격히 저하
- 비중 차이가 작은 사유들 비교 불가
- 클릭 영역(drill-down) 좁아 모바일 사용성 떨어짐

**가로 막대 장점:**
- 긴 라벨 좌측 정렬, truncate + tooltip 자연스러움
- 길이 비교가 직관적 (사람 눈은 길이를 각도보다 정확히 비교)
- 상위 N 정렬 → 우선순위 시각적 즉시 파악
- 행 단위 클릭 = 칩 클릭과 동일한 drill-down 일관
- 항목 수 늘어나도 스크롤로 대응 가능

대안 후보: Treemap(공간 효율적이나 라벨 잘림 심함), Donut + 외부 범례(여전히 라벨 길이 문제). → **가로 막대 채택**.

### 레이아웃

데스크탑(≥md): 2열 그리드, 좌측 칩 영역 / 우측 차트.
모바일: 1열 스택 (차트가 칩 아래).

```text
┌─ HDEC's Basis of Cat B ───────────────────────────────────────┐
│ ┌── 좌 (칩, 기존) ─────────┐ ┌── 우 (신규 차트) ───────────┐ │
│ │ [Reason A  42]            │ │ Distribution (Top 8)         │ │
│ │ [Reason B  31] [C 18]     │ │ Reason A ████████████  42  │ │
│ │ [D 12] ...                │ │ Reason B █████████     31  │ │
│ │ ▸ Show 6 more             │ │ Reason C █████         18  │ │
│ │                            │ │ Reason D ███           12  │ │
│ │                            │ │ ...                         │ │
│ └────────────────────────────┘ │ Others (n) ██           24  │ │
│                                 └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

`CardContent`를 `grid md:grid-cols-[1fr_minmax(0,360px)] gap-4`로 분할.

### 차트 사양 (우측 패널)

- 헤더: `Distribution` + 총합 `({total} items)`
- 정렬: 카운트 내림차순, Top 8 표시, 나머지 합계는 "Others (n)" 행으로 묶음 (`muted` 색)
- 각 행:
  - 좌측: reason 라벨 (max-w로 truncate, `title` tooltip)
  - 중앙: 가로 막대 (width = `count/maxCount * 100%`)
  - 우측: 카운트 + 백분율(`%`)
- 색상:
  - 1위: `bg-destructive`
  - 2~3위: `bg-destructive/70`
  - 그 외: `bg-destructive/40`
  - Others: `bg-muted-foreground/40`
  - Unspecified(`__EMPTY__`): `bg-muted-foreground/50` + 라벨 `Unspecified` (기존 칩과 동일 규칙)
- 행 hover: `hover:bg-muted/40`, 클릭 → 기존 `goRaw({ hdecVerification: 'Cat B - Minor Defect', hdecReason, notClosureDone: 'true' })` 호출 (칩과 동일)
- "Others" 행은 클릭 비활성 (또는 모든 나머지 reason multi-filter 미지원이므로 단순 표시만)
- 빈 상태: `kpis.dispute.hdecCatBReasons.length === 0` → 차트도 숨김 (좌측 "No disputes recorded." 만 노출, grid 해제)

### 기술 디테일

- recharts 도입 안 함. 단순 div 기반 막대로 구현(가볍고 라벨 제어 자유로움). 프로젝트에 이미 recharts 사용 중이나 이 케이스는 라벨 제어가 더 중요.
- `tabular-nums`로 숫자 정렬 안정화.
- 백분율 계산: `Math.round(count / total * 100)`, 0%는 `<1%`로 표기.
- Top N 상수: `const CHART_TOP_N = 8`.
- 좌측 칩 영역의 기존 Top 4 + Collapsible 구조는 **변경 없이 유지**(요청 범위 외).

### 범위 외
- `Banner 1 — Dispute in Category` 변경 없음
- 데이터 집계 로직(`kpis.dispute.hdecCatBReasons`) 변경 없음
- 다른 섹션·라우팅 파라미터 변경 없음

### 차트 종류에 대한 사용자 확인 필요
파이차트로 강제 진행할지, 추천대로 **가로 막대**로 갈지 선택 부탁드립니다. (도넛 + 우측 범례도 가능하나 라벨 잘림 이슈는 동일)
