
## 변경 파일
`src/lib/report-builder.ts` 단일 파일만 수정합니다.

---

## [1] Defect S-Curve 추가

### 타입 추가
```ts
export interface DefectScurvePoint {
  date: string;
  bucketLabel: string;
  completionPlanPct: number;
  completionActualPct: number | null;
  closurePlanPct: number;
  closureActualPct: number | null;
}
```

### `DefectReportData`에 필드 추가
```ts
scurve?: DefectScurvePoint[];
```

### import 추가
```ts
import { buildDefectSCurveAllStages } from '@/lib/defect-dashboard-utils';
```

### `buildReport()`의 defect 블록(763~766줄) 보강
T&C scurve 처리와 동일 패턴으로, defect 데이터를 만든 뒤 S-Curve를 계산해 주입합니다.

- `startDate = addDays(defectDataDate, -35)`
- `endDate = opts.mcDate ?? MC_DEFAULT`
- `today = defectDataDate` (Data Date 기준 actual 절단 — T&C 패턴과 일치)
- `granularity: 'day'`
- `groupBy: null` (총량만 필요)
- `buildDefectSCurveAllStages`는 stages별로 `total` 시리즈(plan/actual 누적)를 같은 bucket 축으로 반환하므로, completion·closure를 한 번에 받아 % 변환

```ts
const sc = buildDefectSCurveAllStages(rows, {
  granularity: 'day',
  startDate: addDays(defectDataDate, -35),
  endDate: opts.mcDate ?? MC_DEFAULT,
  today: defectDataDate,
  groupBy: null,
});
const tot = data.defect.totals.total || 1;
data.defect.scurve = sc.buckets.map((b, i) => ({
  date: b,
  bucketLabel: sc.bucketLabels[i],
  completionPlanPct:   Math.round((sc.byStage.completion.plan[i]   / tot) * 1000) / 10,
  completionActualPct: sc.byStage.completion.actual[i] != null
    ? Math.round((sc.byStage.completion.actual[i] as number) / tot * 1000) / 10
    : null,
  closurePlanPct:      Math.round((sc.byStage.closure.plan[i]      / tot) * 1000) / 10,
  closureActualPct: sc.byStage.closure.actual[i] != null
    ? Math.round((sc.byStage.closure.actual[i] as number) / tot * 1000) / 10
    : null,
}));
```

PPT JSON 전용 — `renderDefectMd`는 변경하지 않음 (UI/Markdown 영향 없음).

---

## [2] ABD `statusCounts` 추가

### `DocsSubmoduleData`에 필드 추가
```ts
statusCounts?: Record<string, number>;
```

### `computeDocsData`의 ABD 처리
이미 `docs_drawings` SELECT에 `current_status`가 포함되어 있고 `AbdRow`에 `current_status` 필드도 있으므로 추가 fetch 불필요.

ABD 결과 생성 후 다음을 부여:
```ts
const abdData = mk(abd, ABD_COLS);
abdData.statusCounts = {
  under_review:  abd.filter(r => r.current_status === 'Under Review').length,
  not_submitted: abd.filter(r => !r.sub1_submission_date).length,
};
```

---

## [3] OMM `statusCounts` 추가

OMM 결과 생성 후:
```ts
const ommData = mk(omm, OMM_COLS);
ommData.statusCounts = {
  under_review: omm.filter(r => r.sub2_actual_date && !r.final_response_actual_date).length,
};
```

최종 return을 `abd: abdData, omm: ommData, …` 형태로 정리.

Warranty / SparePart는 변경 없음. `renderDocsMd`는 변경하지 않음.

---

## 검증
- `bunx tsc --noEmit` 으로 타입 체크
- 다른 파일은 일절 수정하지 않음
