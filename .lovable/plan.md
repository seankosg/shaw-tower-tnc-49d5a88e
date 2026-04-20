

## Cumulative Progress Card에 진행률 시각화 추가

### 목적
현재 텍스트로만 표시되는 `${cumActual}/${cumPlan} (XX%)` 값을 시각적 Progress 바로 전환하여 한 눈에 진행률 파악 가능하게.

### 변경 내용
| 파일 | 변경 |
|---|---|
| `src/pages/SchedulePage.tsx` | Cumulative Progress KPI 카드 내부에 `Progress` 컴포넌트 추가, value에 `kpis.progressPct` 바인딩 |

### 구현 상세
**SchedulePage.tsx 210-225행 (Cumulative Progress Kpi) 수정:**
- 기존: `value` prop에 `${cumActual}/${cumPlan} (${progressPct}%)` 텍스트만 표시
- 변경: 
  1. `value` prop 제거하거나 축소 (예: `${progressPct.toFixed(0)}%`)
  2. 카드 본문에 `<Progress value={kpis.progressPct} className="h-2 mt-1" />` 추가
  3. 하단에 `subValue`로 `${cumActual}/${cumPlan}` 유지 (전체 개수 맥락 제공)

### UI 예시
```
┌─────────────────────────┐
│ Cumulative Progress     │
│        67%              │
│ [████████████░░░░░]     │
│ 45/67 completed         │
└─────────────────────────┘
```

### 추가 고려사항
- 진행률 < 30%: `bg-schedule-short` (빨강) 적용
- 진행률 30-90%: 기본 `bg-primary` (파랑) 적용  
- 진행률 >= 90%: `bg-green-500` (초록) 적용 — 색상 변화로 완료 임박 시각화

