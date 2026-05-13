# Defect Simulation 종합 재검토 — 수정 계획

T&C와 동일한 깊이로 `DefectSimulationPage.tsx`, `defect-simulation.ts`, `defect-schedule-utils.ts`, `defect-utils.ts`, `DefectRawDataPage.tsx`와 **실제 DB 5,445행 분포**를 함께 검증했습니다. 동일·유사 버그 4건 + 신규 2건 + 개선 3건이 확인됐고, T&C에서 적용한 패턴을 그대로 가져옵니다.

---

## 0. 실제 데이터 분포 (검증 기준)

| 항목 | 값 |
|---|---|
| total active defects | 5,445 |
| planned_(start/comp/close) 있음 | 각 5,164 |
| actual_start | 2,918 |
| actual_completion | 3,374 |
| actual_closure | 178 |
| **completion 있음 + start 없음** | **487** (cascade로 자동 처리됨 — 정상) |
| **closure_status='Done' + actual_closure_date 없음** | **73** ← B1 발현 |
| **status='closed' + actual_closure_date 없음** | **74** ← B1 발현 |
| actual_progress_pct≥100 + actual_completion_date 없음 | 0 |

73~74개 행이 `closure` 단계의 `doneActual` 에서 조용히 누락되고 있습니다.

---

## 1. 버그 (수정)

### B1. closure_status/status로만 done 표시된 행이 doneActual 에서 누락 (실제 발생 중)
`isDefectStageDone(closure)` 는 `actual_closure_date` 가 없어도 `closure_status='Done'` 또는 `status='closed'` 면 true. 그러나 `simulateDefectStageAt` 분기:
```ts
if (done && actual && actual <= targetDate) doneActual++;
else if (!done) { ...forecast... }
```
→ `done=true, actual=null` 이면 두 분기 모두 안 타고 **사라짐**. DB에 73~74개 영향. T&C와 동일한 fallback 전략 적용:
```ts
if (done) { const eff = actual ?? opts.dataDate; if (eff <= targetDate) doneActual++; }
```
시계열 빌더(`buildDefectSimulationSeries`)에도 동일 처리.

### B2. "View remaining →" 링크가 의미 불일치
`goRawRemaining`:
```
/defects/raw-data?source=simulation&stage=<s>&asOf=<target>&overdue=true
```
- DefectRawDataPage 는 `overdue=true&stage=&asOf=` 를 인식해 `isStageDelayedAsOf(item, stage, asOf)` 로 필터.
- 의미: "plan ≤ asOf 인데 not-done" (overdue).
- 카드/테이블의 "Remaining" 정의: `total − predicted` (target 까지 예측 완료 안 된 모든 항목, no-plan·delayed·미래 plan 등 모두 포함).
- 두 집합이 **다름** → 표 숫자 ≠ 링크가 보여주는 행 수.

→ 수정: T&C와 동일하게 신규 파라미터 도입.
- `remaining_stage=<start|completion|closure>` + `remaining_asof=<iso>`
- DefectRawDataPage 필터: `getDefectStageActualDate(item, stage)` 가 없거나 `> asof` 인 행만 통과.

### B3. Subcontractor 필터가 remaining 링크에 누락
Page 는 team/subcontractor 두 필터를 시뮬레이션에 적용하지만 `goRawRemaining` 은 **team 만** 전달. 결과적으로 Subcontractor=Finebuild 로 좁힌 화면에서 `View remaining` 클릭 시 raw-data는 전체 Subcontractor 노출. URL 키도 `sub` (페이지 내부) vs `subcontractor` (raw-data 표준) 로 다름. → `subcontractor` 키로 함께 전달.

### B4. "Forecast new" sub-label 이 모드와 불일치 (T&C와 동일)
표시: `not-done · planned ≤ target`. 실제 `r.forecast` 는 모드별 effective forecast date 기준 (penalty 에선 지연 항목 null, learned 에선 +lag). → 모드별 분기 문구.

---

## 2. 의심스러운 동작 (정책 결정)

### S1. `computeStageLagDays` 가 filtered items 기준 (T&C와 동일)
team/subcontractor 필터로 좁힌 표본만 사용 → n<5 이면 learned 모드가 조용히 optimistic 으로 강등. → 전체 `items` 기준으로 변경.

### S2. 기본 target 하드코딩 `'2026-05-22'` (T&C와 동일)
data date 가 그 이후로 가면 `days=0` 가 되며 무의미. → `addDays(dataDate, 30)` 로.

### S3. delayedCount 안내 vs cascade actual 일관성
`delayedCount` 는 `planned < dataDate && !done` 으로 계산하지만 `done` 은 cascade 적용된 값. closure 단계에서 `actual_closure_date` 만 보고 done 판정하는 게 아니라 `closure_status='Done'` 도 done 으로 간주 → B1 fix 후엔 이 행들이 doneActual 로 들어가서 일관성 회복. (별도 수정 불필요)

---

## 3. 사소한 개선

- **C1.** `simulateByTeam` (defect-simulation.ts) 정렬에서 `(None)` 그룹 후미 배치.
- **C2.** ToAchieveBand `days===0` 가드는 공유 컴포넌트라 이미 적용됨 (T&C 작업에서 처리).
- **C3.** Subcontractor 필터가 `(None)` 옵션을 빠뜨리는지 확인 — `subcontractorOptions` 만 노출.

---

## 4. 통과한 정상 동작 (참고)

- Cascade Done 시맨틱 (`closure done ⇒ completion·start done`) 정확.
- `getEffectiveActualDate` 의 cascade fallback (start ← completion ← closure) 정확.
- Delay mode 4종 분기 정확.
- 시계열 past/future 분기 정확.
- ToAchieveBand 산출식 정확.

---

## 5. 변경 파일 & 작업

### 단계 A — 핵심 로직
- **`src/lib/defect-simulation.ts`**
  - `simulateDefectStageAt`: B1 fix — `done && !actual` 시 `eff = opts.dataDate` 로 가산.
  - `buildDefectSimulationSeries`: 동일 fallback.
  - `simulateByTeam`: `(None)` 후미 정렬.

### 단계 B — Page UI
- **`src/pages/DefectSimulationPage.tsx`**
  - 기본 target → `useMemo(() => addDays(dataDate, 30), [dataDate])`.
  - `lagDays` 입력 → `items` (전체).
  - `goRawRemaining` 재작성: `remaining_stage` + `remaining_asof` 사용, `team`/`subcontractor` 모두 전달.
  - "Forecast new" sub-label 모드별 분기 (T&C 와 동일 helper).

### 단계 C — Raw Data 필터
- **`src/pages/DefectRawDataPage.tsx`**
  - 신규 파라미터 처리: `remaining_stage`, `remaining_asof`. 적용 시
    `actual = getDefectStageActualDate(row, stage); if (actual && actual <= asof) drop`.
  - `subcontractor` 파라미터가 이미 처리되는지 확인 — 안 되면 추가 (단순 equality 매칭).
  - 활성 필터 chip 에 노출.

### 단계 D — 테스트
- **`src/test/defect-simulation.test.ts`**
  - 기존 'done by progress_pct alone … stays out of doneActual' 테스트는 **반전** (이제 doneActual 에 포함되어야 함).
  - 신규: `closure_status='Done', actual_closure_date=null` 행이 closure.doneActual=1 이 되는지.
  - 신규: `(None)` 정렬 후미.

---

## 6. 사용자 확인 사항

다음 한 가지만 확인 부탁드립니다.

**B1 fix 의 effective date 처리 방식**:
- (i) `actual ?? dataDate` — done 상태인 행은 dataDate 에 완료된 것으로 간주 (T&C 와 동일, 권장)
- (ii) `actual ?? planned ?? dataDate` — planned 가 있으면 그걸 우선 사용
- (iii) doneActual 가산하지 않고 별도 카운터(`doneNoDate`) 로 분리해서 카드에 표시

기본은 (i) 로 진행할 예정입니다. 다른 옵션을 원하시면 알려주세요. 그 외 항목(B2/B3/B4 + S1/S2 + C1)은 이의 없으면 그대로 진행합니다.
