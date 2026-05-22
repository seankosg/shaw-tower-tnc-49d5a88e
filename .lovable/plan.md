# Defect Dashboard — Captured By 테이블에 "By Priority" 그룹 컬럼 추가

## 목표
Captured By 통계 테이블을 2-그룹 헤더로 재구성한다.
- **By Quantity** (기존 4컬럼): Total / Completed / Closed / In Dispute
- **By Priority** (신규 4컬럼): Total / Cat. A / Cat. B / No Cat. — Raw Data의 `priority` 컬럼 값을 담당자별로 집계

## 변경 위치
`src/pages/DefectDashboardPage.tsx` — `CapturedByStatsSection` 컴포넌트(약 802~1050행) 단독 수정. 다른 파일/유틸/DB 변경 없음.

## 상세

### 1) 데이터 집계 (`useMemo` 내부)
- `CapturedByStat` 인터페이스에 4개 필드 추가:
  `priTotal` (= 기존 `total`과 동일 값), `priCatA`, `priCatB`, `priNoCat`
- 각 row 집계 시 `priority` 값 기준 분기:
  - `'Cat A - Major Defect (Before SC)'` → `priCatA++`
  - `'Cat B - Minor Defect'` → `priCatB++`
  - falsy(빈값) → `priNoCat++`
- (Priority 분류 상수는 상위 `kpis.byPriority` 계산 로직과 동일하게 사용 — 단일 진실 원천 유지)
- `totals` / `visibleTotals` / `unknown` 동일하게 4개 priority 합계 누적

### 2) 테이블 헤더 — 2단 그룹 헤더
기존 단일 `TableRow` 헤더를 두 줄로 교체:

```text
| Name | -------- By Quantity --------- | -------- By Priority --------- |
|      | Total | Completed | Closed | InD | Total | Cat. A | Cat. B | NoCat |
```

- 1단 헤더: 빈 셀(Name 위) + `colSpan=4` "By Quantity" + `colSpan=4` "By Priority"
- 그룹 라벨은 `text-[11px] font-semibold text-muted-foreground uppercase tracking-wide` 정도로 차분하게
- 두 그룹 사이는 `border-l`로 시각 분리
- 2단 헤더: 기존 Name 컬럼 + 기존 4 컬럼 + 신규 4 컬럼(우측 정렬, sort 버튼 포함)

### 3) 정렬 키 확장
`SortKey` 타입에 `'priCatA' | 'priCatB' | 'priNoCat'` 추가
(By Priority의 Total은 By Quantity의 Total과 동일하므로 별도 정렬 키 불필요 — 기존 `total` sort 재사용)

### 4) 본문 행 렌더
- TOTAL 합계 행: 신규 4개 컬럼 합계 표시 (Cat A / Cat B / No Cat은 muted 톤, 0이면 더 흐리게)
- 각 person 행: 신규 4개 셀에 클릭 가능한 숫자 버튼.
  클릭 시 `onMetricClick(name, priorityMetric)` 호출.
- `colSpan` 빈 상태 메시지: 5 → **9**로 변경

### 5) 클릭 → Raw Data 라우팅
`CapturedByMetric` 타입 확장:
```ts
type CapturedByMetric =
  | 'total' | 'completed' | 'closed' | 'dispute'
  | 'priTotal' | 'priCatA' | 'priCatB' | 'priNoCat';
```

상위(`DefectDashboardPage`)의 `onMetricClick` 핸들러(약 460행)에서 분기 추가:
```ts
const params: Record<string, string> = { capturedBy: name };
if (metric === 'priCatA') params.priority = 'Cat A - Major Defect (Before SC)';
else if (metric === 'priCatB') params.priority = 'Cat B - Minor Defect';
else if (metric === 'priNoCat') params.priority = '__EMPTY__';
// priTotal은 priority 없이 capturedBy만
// 기존 completed/closed/dispute는 기존 분기 유지
goRaw(params);
```
→ 기존 Priority 카드와 동일한 `priority` 쿼리 파라미터 컨벤션 재사용 (DefectRawDataPage 변경 불요).

## 영향 범위
- 변경 파일: `src/pages/DefectDashboardPage.tsx` 1개
- Raw Data 페이지 / 유틸 / DB / 디자인 토큰 추가 없음
- 기존 그룹(All/Arch/Facade/MEP/Other) 탭, 이름 필터, 디버그 reconcile 로직은 그대로 동작
