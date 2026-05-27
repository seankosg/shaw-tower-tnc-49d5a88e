## 목표
Defect Dashboard / Raw Data의 **체감 로딩 속도와 필터 응답성**을 저사양 PC에서도 즉시 반응 수준으로 끌어올린다. 표시값·기능·디자인은 그대로 유지한다.

## 진단 (현재 비용 구조)

`src/pages/DefectDashboardPage.tsx` (2,307줄, useMemo 50개)와 `src/lib/defect-dashboard-utils.ts` 분석 결과, 필터 변경 시마다 다음이 모두 재실행된다.

1. **KPI 다중 패스** — `useMemo(kpis)` 안에서 `filteredItems`를 `.filter(...).length` 로 약 15~18회 순회 → N=5,000일 때 70k~90k 패스.
2. **그룹 집계 7회 동시 계산** — Sub Trade / Subcontractor / Sub-Sub / HDEC PIC / HDEC ENG / Team / Work Type 7개 탭의 `aggregateDefectPlanActualByGroup` 가 **모두** 매번 계산됨. 보이는 건 1개 탭뿐.
3. **O(N²) 버킷 누적** — `aggregate...` 내부에서 `buckets.set(key, [...(buckets.get(key) ?? []), item])` — 그룹당 매 push마다 배열 복사. 큰 그룹(예: subcontractor 상위) 하나가 수천 행이면 O(N²).
4. **`calcMetrics`** 안에서 `isStageDone` → `isClosureComplete`/`isActualComplete` 가 매 항목·매 stage 마다 재계산. 7개 그룹 × 2 stage × N행 = 동일 계산 14회 반복.
5. **S-Curve가 항상 빌드됨** — `scurveOpen=false`로 collapse돼 있어도 `buildDefectSCurve`/`buildDefectSCurveAllStages`가 매 변경 시 계산.
6. **번들/초기 로드** — recharts(Bar/Line/Pie/ComposedChart) + 2,307줄 컴포넌트 + `defect-dashboard-excel-export` 가 전부 dashboard 라우트 진입 시 동기 로드.
7. **캐시 heavy 컬럼** — `defect-cache.ts` 가 dashboard에서 쓰지 않는 description/remarks/hdec_comments/aconex_comments/raw_payload/custom_payload(6개 무거운 컬럼)까지 백그라운드로 끌어옴. Raw Data 입장 전엔 불필요한 네트워크/메모리 압박.

## 개선 작업

### A. `defect-dashboard-utils.ts` 핵심 알고리즘 교정 — 가장 큰 효과

1. **`aggregateDefectPlanActualByGroup` 재작성**
   - `buckets.set(key, [...arr, item])` 패턴을 `arr.push(item)`로 교체 → O(N²) → O(N).
   - 항목당 한 번만 `isStageDone(item, 'completion'|'closure')` 와 plan/actual 날짜를 계산해 캐시한 뒤 메트릭 누적.
   - 두 stage(completion/closure) 메트릭을 **그룹 루프 한 번**에서 함께 누적해 calcMetrics 중복 호출 제거.

2. **항목별 파생값 1회 계산** — `precomputeDefectFlags(items)` 헬퍼 추가:
   - `closureDone`, `actualDone`, `startDone`, 각 stage의 `planDate`/`actualDate`/`delayed(dataDate)` 를 한 번에 계산.
   - 결과를 dashboard에서 `useMemo([items, dataDate])` 로 한 번만 만들고 KPI·집계·S-Curve가 공유.

3. **`isStageDelayedAsOf`/`isStageDone` 분기 인라인화** — 핫 패스에서 함수 호출/문자열 lower-casing(`closure_status`) 제거. closure_status는 사전에 lowercase 캐싱.

### B. `DefectDashboardPage.tsx` 렌더 비용 절감

1. **KPI 단일 패스 reduce** — 현재 ~18개 `.filter().length` 호출을 단일 `for` 루프로 통합. Cat A/B/NoCat 버킷도 같은 루프에서 누적.

2. **활성 탭만 집계** — 7개 `useMemo(by...)` 중 `breakdownTab` 에 해당하는 그룹 하나만 계산하도록 변경(나머지는 lazy). 탭 전환 시 즉시 계산 + 캐시.

3. **S-Curve 지연 계산** — `scurveOpen`가 true일 때만 `buildDefectSCurve` / `buildDefectSCurveAllStages` 호출. collapse 상태에선 빌드 스킵.

4. **`criticalDefects` 짧은 회로** — `is_critical` 항목이 보통 소수이므로 미리 필터 후 map.

### C. 캐시 슬림화 (`defect-cache.ts`)

1. Dashboard에서 사용하지 않는 6개 heavy 컬럼은 **자동 백그라운드 로딩 제거**. Raw Data/상세/Export 라우트에서만 `ensureHeavyLoaded()` 명시 호출.
2. 현재도 slim 컬럼이 47개인데 dashboard가 실제 쓰는 컬럼은 약 25개. dashboard 전용 selector(useMemo)로 메모리 상 객체 크기는 그대로 두되 GC/렌더 비용은 1회만 발생하도록 정렬.
3. 첫 페인트: slim 1페이지(1,000행) 도착 시점에 dashboard가 **부분 데이터로 즉시 렌더**. 현재는 `initialLoaded=true` 까지 spinner. → 페이지네이션 완료 전 첫 청크에서 `partialReady` 신호 발행, 후속 청크는 백그라운드 머지.

### D. 코드 스플릿 / 번들

1. `DefectDashboardPage` 라우트를 `React.lazy` 로 분리 (`src/App.tsx`).
2. Pie/ComposedChart 블록을 별도 컴포넌트(`DefectScurveChart`, `DefectDistributionPies`)로 추출 후 lazy import → recharts 청크가 dashboard 진입 시까지만 로드, 그것도 차트 가시 시점까지 지연.
3. `defect-dashboard-excel-export`, `scurve-excel-export`, `defect-cat-b-reason-export`, `defect-captured-by-export` 를 export 버튼 핸들러 안에서 `await import(...)` 동적 로드.

### E. Raw Data 페이지 보조 개선 (필터 응답성)

- 텍스트 입력 필터(`subTradeTextFilter` 등)에 150 ms `useDeferredValue` 적용.
- 정렬·필터 결과 메모이즈 키를 안정화(객체 대신 primitive 조합).
- 큰 테이블은 이미 가상화돼 있으면 유지, 미적용이면 `react-virtual` 도입은 별도 차후 작업으로 분리.

## 비기능 보장

- 표시 숫자/도넛/S-Curve/지연 판정 로직은 동일 결과를 내야 함 → `src/test/defect-dashboard-utils.test.ts` 에 다음 테스트 추가:
  - 동일 시드 1,000행으로 기존 vs 신규 `aggregateDefectPlanActualByGroup` 결과 일치(snapshot).
  - 단일 패스 KPI 결과가 기존 다중 필터 합산과 일치.
- 캐시 변경은 Raw Data/Detail에서 heavy 컬럼이 필요할 때만 fetch — 회귀 테스트로 `description` 등이 로드되는지 확인.

## 예상 효과

- N=5,000 행, 7개 그룹 기준 dashboard 필터 토글 시 메인 스레드 작업: 약 70 k 패스 + O(N²) → **단일 패스 + O(N)** 로 약 1/15 ~ 1/30 수준.
- 첫 진입 JS 청크: recharts/2,307줄 컴포넌트/4개 export 모듈 제거 시 약 200~350 KB(gz) 감소 예상.
- Spinner→첫 화면: 캐시 첫 페이지 도착(보통 1초 이내)에서 KPI 카드 노출.

## 기술 세부 (참고)

```text
hot path before (per filter change):
  filteredItems  : O(N)
  kpis           : ~18 × O(N)
  by* aggregates : 7 × O(N²)  ← dominant
  scurve         : O(N + B)   (B = buckets)

hot path after:
  filteredItems  + precomputeFlags : O(N) 1회, 결과 공유
  kpis           : O(N) 1회 (single reduce)
  by*            : 활성 탭 1개 × O(N), push 기반
  scurve         : scurveOpen일 때만
```

## 변경 파일 (예상)

- `src/lib/defect-dashboard-utils.ts` — 알고리즘 교정, `precomputeDefectFlags` 추가
- `src/pages/DefectDashboardPage.tsx` — KPI reduce, 활성 탭 집계, S-Curve 지연, 차트 lazy import
- `src/lib/defect-cache.ts` — heavy 자동 로드 옵션 분리, partialReady 신호
- `src/App.tsx` — Defect Dashboard 라우트 `React.lazy`
- 새 파일: `src/components/defects/DefectScurveChart.tsx`, `src/components/defects/DefectDistributionPies.tsx`
- `src/test/defect-dashboard-utils.test.ts` — 동치성/회귀 테스트
- (보조) `src/pages/DefectRawDataPage.tsx` — `useDeferredValue` 적용

승인하시면 위 순서대로(A → B → C → D → E) 단계별 커밋으로 진행합니다.
