

## Schedule 페이지 KPI 카드 재정비

### 현재 6개 카드 분석 (SchedulePage.tsx 132-155행)

| # | 라벨 | 계산 로직 | 문제점 |
|---|---|---|---|
| 1 | Today Plan | 오늘 bucket의 plan 합계 | "오늘 하루"만 → 주간 모드면 의미 모호. 단발성 숫자라 행동 유발 약함 |
| 2 | Today Actual | 오늘 bucket의 actual 합계 | 동일. 그날 실적은 보통 하루 끝에야 채워짐 → 낮 시간대엔 항상 낮게 보여 오해 유발 |
| 3 | Cum Actual/Plan | 누적 actual/plan + % | **유용**. 전체 진행률 한 눈에 |
| 4 | Variance | (actual-plan)/plan % | Cum Actual/Plan과 **중복**. 같은 데이터의 다른 표현 |
| 5 | Critical (≤7d) | 7일 내 위험 항목 수 | **유용**. CriticalWatchlist와 직접 연동, 클릭 가치 있음 |
| 6 | Overdue | 계획일 지났는데 미완료 | **유용**. 즉시 조치 필요한 항목 수 |

### 문제 요약
- **Today Plan / Today Actual**: 의미 약함. 주간 모드와 충돌. 행동 유발 X. 클릭 안 됨
- **Variance**: Cum과 중복. 한쪽만 있어도 충분
- **Critical / Overdue**: 카운트만 보여주고 클릭하면 SubtestList로 점프하는 동선이 없음 → "의미 있는 카드"가 되려면 클릭 필터 연동 필요

### 제안: 4개 카드로 정리 + 클릭 연동

| 카드 | 값 | 색상 | 클릭 동작 |
|---|---|---|---|
| **Cumulative Progress** | `cumActual / cumPlan (XX%)` + Variance를 sub-line에 작게 | 진행률 < 90% → short, > 100% → over | 비활성 (요약용) |
| **Overdue** | overdue 카운트 | >0 → short(빨강) | `/?overdue=1` 로 점프 |
| **Critical (≤7d)** | critical 카운트 | >0 → short | `/?at_risk=1` 로 점프 (또는 우측 Watchlist로 스크롤) |
| **Upcoming 7d Plan** | 오늘~+7일 plan 합계 | 정보용 | `/?date_from=today&date_to=today+7&date_field=planned` 로 점프 |

→ "Today Plan/Actual" 제거, "Variance"는 Cumulative 카드 안 sub-text로 흡수, **"Upcoming 7d"** 신설(미래 지향이라 hidePast 토글 컨셉과도 일치)

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/pages/SchedulePage.tsx` | KPI 계산부 정리(`upcoming7Plan` 추가), 카드 6→4개 축소, 카드에 `onClick` 추가하여 SubtestList 라우팅 |
| `src/pages/SchedulePage.tsx` | `Kpi` 컴포넌트에 optional `onClick` + `subValue` props 추가 |

### 검증
1. 카드 4개만 표시: Cumulative / Overdue / Critical / Upcoming 7d
2. Cumulative 카드에 작은 글씨로 `Variance +X.X%` 표기
3. Overdue/Critical/Upcoming 카드 클릭 시 SubtestList로 해당 필터 적용되어 이동
4. hidePast 토글과 무관하게 KPI는 원본 aggregate/subtests 기반 (현재와 동일)

