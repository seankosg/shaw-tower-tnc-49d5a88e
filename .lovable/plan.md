# Defect Dashboard — Priority 카드 OD 칩 추가

## 목표
Defect Dashboard의 신규 Priority 카드 4종(Total / Cat. A / Cat. B / No Cat.)에 **계획대비 완료되지 않은(Overdue) 개수**를 표시하는 OD 칩을 추가하고, 클릭 시 Raw Data로 필터링 이동되게 한다.

## OD 정의
- "계획대비 완료되지 않은" = **Completion 단계 지연**
  → `isStageDelayedAsOf(item, 'completion', dataDate)` 기준
  (기존 KPI "Overdue - Completion"과 동일한 판정)
- Data Date(`dataDate`) 기준으로 계산

## 변경 사항

### 1) `src/pages/DefectDashboardPage.tsx` — kpis 집계
`kpis.byPriority` 계산 시 각 버킷(total / catA / catB / noCat)에 **completion-overdue count**를 함께 산출.

```ts
const bucketize = (rows) => {
  ...
  const overdue = rows.filter(i => isStageDelayedAsOf(i, 'completion', dataDate)).length;
  return { total, completion, closure, completionPct, closurePct, overdue };
};
```

### 2) `PriorityCard` 컴포넌트
- `PriorityStats`에 `overdue: number` 추가
- `onOverdueClick?: () => void` prop 추가
- 카드 상단(라벨 옆 또는 total 아래)에 작은 **destructive 색상 칩** `OD {n}` 렌더
  - 값이 0이면 muted 톤으로 표시(클릭 비활성)
  - 클릭 시 부모 카드 onClick 전파 차단(`stopPropagation`)

### 3) 4개 카드 렌더 매핑
각 카드마다 `onOverdueClick` 전달:
```ts
onOverdueClick={() => goRaw({
  ...teamParam,
  ...pParam,
  overdue: 'true',
  stage: 'completion',
  asOf: dataDate,
})}
```
→ 기존 `DefectRawDataPage`의 `overdue/stage/asOf` 필터 로직 그대로 활용 (코드 변경 불요).

## 영향 범위
- 변경 파일: `src/pages/DefectDashboardPage.tsx` 1개
- Raw Data 페이지 / 유틸리티 / DB 변경 없음
- 디자인 시스템 토큰만 사용 (destructive, muted-foreground)
