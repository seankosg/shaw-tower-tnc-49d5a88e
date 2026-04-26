## 목표

Defect Management의 모든 "지연(Overdue)" 판정을 **Data Date(데이터 기준일)** 단일 기준으로 통일한다.
- `today`(오늘)는 **At-Risk(미래 임박)** 판정에만 사용
- `Data Date`는 **모든 Overdue/지연 판정**에 사용
- Data Date의 출처는 **가장 최근 업로드 배치(`defect_upload_batches.data_date`)** 자동 조회

---

## 현재 발견된 오류 요약

| # | 위치 | 문제 |
|---|---|---|
| 1 | `defect-utils.ts` `isOverdueDefect(item, asOf = todayIso())` | 기본값이 today → 호출부에서 인자 누락 시 잘못된 비교 |
| 2 | `DefectRawDataPage` row highlighting (line 1126) | `isOverdueDefect(row)` 인자 없이 호출 → today 사용 |
| 3 | `DefectProgressPage` (line 82) | dataDate 개념 자체 없음 → today로 비교 |
| 4 | `DefectExportPage` (line 94) | 동일 문제 |
| 5 | Dashboard vs Raw Data | 비교 연산자 불일치 (`<=` vs `<`) |
| 6 | `isStageDone` | 상위 단계 완료 시 하위 단계 자동 완료 처리 안 됨 |
| 7 | `isOverdueDefect` | progress=100% 인정 안 함 (Dashboard와 비대칭) |
| 8 | `DefectRawDataPage` 필터 (line 552) | actual_closure_date 있으면 이전 단계 지연 미확인 |
| 9 | `isAtRisk` | Closure 단계 미포함 |
| 10 | `maxDelayDays` | 종결 항목 미제외 |

---

## 통합 정책 (확정)

| 항목 | 정책 |
|---|---|
| 단계 Done 기준 | `actual_date` 존재 **OR** `progress >= 100%` (Cascade: 상위 단계 Done이면 하위도 Done) |
| Overdue 비교 연산자 | `plan < dataDate` (오늘이 계획일이면 정상) |
| Overdue 기준 시점 | **항상 Data Date** |
| At-Risk 기준 시점 | **today** (미래 임박이라는 의미상) |
| Data Date 출처 | `defect_upload_batches`에서 가장 최근 `data_date` 자동 조회 (없으면 today fallback) |

---

## 구현 단계

### 1단계: Data Date 전역 조회 훅 신설
**`src/hooks/useLatestDataDate.ts` (신규)**
- `defect_upload_batches`에서 `status='completed'`인 배치 중 가장 최근 `data_date`를 React Query로 조회
- 5분 staleTime
- fallback: `todayIso()`
- 반환: `{ dataDate: string, isLoading: boolean, source: 'batch' | 'fallback' }`

### 2단계: SSoT 로직 강화 (`defect-dashboard-utils.ts`)
- `isStageDone(item, stage)`: Cascade 로직 추가
  - `start` Done = `actual_start_date` OR `completion` Done
  - `completion` Done = `actual_completion_date` OR `progress>=100` OR `closure` Done
  - `closure` Done = `actual_closure_date` OR `closure_status==='Closed'`
- `isStageDelayedAsOf(item, stage, asOf)`: `plan < asOf` 비교 + `!isStageDone`
- `isOverdue(item, asOf)`: 3단계 중 어느 하나라도 지연
- `isAtRisk(item, today, daysAhead)`: 미지연 항목 중 `asOf <= plan <= asOf+N` (Closure 포함)
- `maxDelayDays(item, asOf)`: Closure Done이면 0 반환

### 3단계: `defect-utils.ts` 위임
- `isOverdueDefect`: 기본값 제거 → **필수 인자**로 변경
  ```ts
  export function isOverdueDefect(item, asOf: string): boolean {
    return isOverdue(item, asOf);  // dashboard utils로 위임
  }
  ```
- TypeScript가 인자 누락을 컴파일 에러로 잡아줌 → 호출부 일괄 점검 강제

### 4단계: 모든 호출부 수정
| 파일 | 변경 |
|---|---|
| `DefectRawDataPage.tsx` | `useLatestDataDate()` 도입. URL `asOf` 파라미터 우선, 없으면 `dataDate`. 모든 `isOverdueDefect(row)` → `isOverdueDefect(row, effectiveDataDate)`. line 552 필터 로직도 SSoT로 위임 |
| `DefectProgressPage.tsx` | `useLatestDataDate()` 도입. 모든 overdue 판정에 dataDate 전달. 헤더에 "Data Date: DD-Mon-YYYY" 뱃지 표시 |
| `DefectExportPage.tsx` | 동일 적용. 엑셀 export에 Data Date 메타 포함 |
| `defect-progress-utils.ts` | 함수 시그니처에 `dataDate: string` 인자 추가 (필수) |
| `defect-export-utils.ts` | 동일 |

### 5단계: UI 표시 개선
- Raw Data / Progress / Export 페이지 헤더에 **현재 적용된 Data Date 뱃지** 표시 (Dashboard와 일관성)
- Tooltip: "Data Date는 가장 최근 업로드의 기준일입니다. 모든 Overdue 판정은 이 날짜 기준으로 계산됩니다."
- At-Risk만 today 기준이라는 점을 KPI 카드 sub 텍스트에 명시 ("미래 N일 내 임박, 오늘 기준")

### 6단계: 테스트
**`src/lib/__tests__/defect-overdue.test.ts` (신규)**
- Cascade: closure 완료 → start/completion도 Done으로 인정
- Progress 100% but no actual_date → completion Done
- `plan === asOf` → Overdue 아님 (`<` 연산자)
- `plan < asOf` and not Done → Overdue
- At-Risk: `today < plan <= today + N` and not overdue
- Closure done item: `maxDelayDays = 0`

---

## 영향 범위

**변경 파일**
- 신규: `src/hooks/useLatestDataDate.ts`, `src/lib/__tests__/defect-overdue.test.ts`
- 수정: `src/lib/defect-dashboard-utils.ts`, `src/lib/defect-utils.ts`, `src/lib/defect-progress-utils.ts`, `src/lib/defect-export-utils.ts`, `src/pages/DefectRawDataPage.tsx`, `src/pages/DefectProgressPage.tsx`, `src/pages/DefectExportPage.tsx`

**예상되는 숫자 변화 (사용자 체감)**
- Raw Data의 Overdue 행 수가 Dashboard KPI와 **일치**하게 됨
- Progress/Export의 지연 카운트가 약간 **감소** (today 대신 더 이른 dataDate 기준 + Cascade로 일부 제외)
- Closure 완료된 건은 Top-10 Overdue에서 제외
- `progress=100%`인데 actual_date 없는 건도 Done으로 인정 (Raw Data Overdue 감소)

**무변경**
- Dashboard 페이지의 KPI 숫자 (이미 올바른 기준 사용 중)
- DB 스키마 / RLS / 마이그레이션 없음
- T&C 모듈 영향 없음

---

## 기술적 세부사항

### Cascade 의사코드
```ts
function isStageDone(item, stage) {
  if (stage === 'closure') {
    return !!item.actual_closure_date 
        || (item.closure_status?.toLowerCase() === 'closed');
  }
  if (stage === 'completion') {
    if (isStageDone(item, 'closure')) return true;
    return !!item.actual_completion_date 
        || (item.actual_progress_pct ?? 0) >= 100;
  }
  if (stage === 'start') {
    if (isStageDone(item, 'completion')) return true;
    return !!item.actual_start_date;
  }
}

function isStageDelayedAsOf(item, stage, asOf) {
  const plan = getStagePlan(item, stage);
  if (!plan) return false;
  if (isStageDone(item, stage)) return false;
  return plan < asOf;  // strict less-than
}

function isOverdue(item, asOf) {
  return ['start', 'completion', 'closure']
    .some(s => isStageDelayedAsOf(item, s, asOf));
}
```

### Data Date 조회
```ts
const { data } = useQuery({
  queryKey: ['latest-data-date'],
  queryFn: async () => {
    const { data } = await supabase
      .from('defect_upload_batches')
      .select('data_date')
      .eq('status', 'completed')
      .not('data_date', 'is', null)
      .order('data_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.data_date ?? todayIso();
  },
  staleTime: 5 * 60 * 1000,
});
```
