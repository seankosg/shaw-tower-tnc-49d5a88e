## 목표

Defect Dashboard Tier 1 KPI 카드 "Closure Done"이 **`closure_status === 'Done'`**일 때만 카운트되도록 변경. 현재는 `actual_closure_date`에 날짜가 들어 있기만 해도 status와 무관하게 Done으로 집계되어 부정확함.

## 현재 동작 (문제)

`src/lib/defect-dashboard-utils.ts:103`
```ts
export function isClosureComplete(item) {
  if (item.actual_closure_date) return true;  // ← status 무시하고 무조건 Done
  const status = String(item.closure_status ?? '').trim().toLowerCase();
  return status === 'done' || status === 'closed';
}
```

이 함수는 카드 카운트 외에도:
- `buildClosurePie` (도넛 차트)
- `topOverdue` (지연 Top 10)
- `isStageDone(item, 'closure')` (cascade 로직 → completion/start 단계 판정)
- `DefectRawDataPage` 의 `closureComplete` URL 필터
- `DefectStageProgress` 컴포넌트

전반에 사용되므로 **단일 소스인 `isClosureComplete` 자체를 수정**하면 모든 곳에 일관되게 적용됨.

## 변경 사항

### 1. `src/lib/defect-dashboard-utils.ts` — `isClosureComplete` 엄격화

```ts
export function isClosureComplete(item: Pick<DefectForDashboard, 'closure_status'>): boolean {
  const status = String((item as any).closure_status ?? '').trim().toLowerCase();
  return status === 'done';
}
```

- `actual_closure_date` 체크 제거
- `'closed'` 도 제거 (사용자가 "Done만"이라고 명시)
- JSDoc 주석을 새 정책에 맞게 업데이트

### 2. Cascade 로직(`isStageDone`) 검토 — 변경 없음

`isStageDone`의 cascade ("completion done이면 closure도 done으로 간주")는 그대로 유지. 단, closure 단계 자체는 새 엄격 정의를 따르므로 자연스럽게 일관됨:
- `closure` → `closure_status === 'Done'`만
- `completion` → closure done이거나 actual_completion_date 있음
- `start` → 위 둘 중 하나거나 actual_start_date 있음

### 3. 부수 효과 (자동 반영, 추가 코드 변경 불필요)

- **Closure Done KPI 카드** (`DefectDashboardPage.tsx:170`): status='Done' 행만 집계
- **Overall Progress %** (line 172): `closureDone / total` 비율도 함께 정정
- **Difference KPI** (`actualDone - closureDone`): 의미가 더 명확해짐 (완료됐지만 아직 closure 처리 안 된 항목 수)
- **Closure Pie** (`DefectDashboardPage.tsx:941`): Closed 슬라이스가 status='Done'만
- **Top Overdue** (line 277): `closure_status='Done'`이 아닌 행은 모두 지연 후보가 됨
- **Raw Data 필터** (`DefectRawDataPage.tsx:670-671`): "closureComplete=true" URL 필터가 동일 기준
- **DefectStageProgress** 컴포넌트: 단계 표시 일관

### 4. 사용자 영향 안내

이 변경 후 다음 케이스가 새롭게 "미완료(Not Done)"로 바뀝니다:
- `actual_closure_date`는 입력됐지만 `closure_status`가 `WIP`/`Planned`/`Delay` 등인 행
- `closure_status`가 `'Closed'` 인 행 (있다면)

→ **데이터 영향도 사전 확인 쿼리** 1회 실행:
```sql
SELECT closure_status, count(*) 
FROM defect_items 
WHERE is_active=true AND actual_closure_date IS NOT NULL 
GROUP BY closure_status;
```
결과를 사용자에게 보고하여, 의외로 큰 수의 행이 Done에서 빠진다면 추가 협의.

## 변경 파일 (1개)

- `src/lib/defect-dashboard-utils.ts` — `isClosureComplete` 함수 본문 + 주석

## 테스트

- Defect Dashboard 진입 → "Closure Done" 카드 숫자가 `closure_status='Done'` 행 수와 정확히 일치하는지 확인
- "Closure Done" 카드 클릭 → Raw Data 페이지에서 같은 수의 행이 표시되는지 확인
- Closure pie 차트의 Closed 슬라이스도 동일 수치인지 확인
