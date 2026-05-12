## 목적

Defect Simulation에서 후행 단계(completion/closure)가 done인데 선행 단계(start/completion)의 `actual_<stage>_date`가 비어 있어 doneActual에서 누락되는 회계적 허점을 제거합니다. 단계 간 단조성(Start ≥ Comp ≥ Close)이 자연스럽게 회복됩니다.

## 변경 범위

`src/lib/defect-simulation.ts` 한 파일과 그 단위 테스트만 수정합니다. UI/페이지/차트 컴포넌트는 입력 시그니처가 동일하므로 변경 없음.

## 핵심 로직

각 stage에 대해 사용할 "유효 actual 날짜(effectiveActual)"를 캐스케이드 fallback으로 정의:

```text
effectiveActual(start)      = actual_start_date
                              ?? actual_completion_date
                              ?? actual_closure_date
effectiveActual(completion) = actual_completion_date
                              ?? actual_closure_date
effectiveActual(closure)    = actual_closure_date
```

조건은 그대로 유지하되 비교 대상만 effectiveActual로 교체:

```text
done   = isDefectStageDone(it, stage)               // 기존 그대로 (cascade-aware)
ea     = effectiveActual(it, stage)
doneActual++   if  done && ea && ea <= targetDate
forecast++     if  !done && planned && planned <= targetDate
noPlan++       if  !done && !planned
planOnly++     if  planned && planned <= targetDate  // 변경 없음
```

근거: completion이 done인 항목은 정의상 start도 done이며, 실제 시작은 늦어도 completion 시점에 일어났습니다. 따라서 actual_start_date가 비어 있을 때 actual_completion_date를 start의 effective actual로 대체하는 것이 안전한 하한 추정입니다.

## 영향

- Start의 doneActual ↑ (누락분 회복) → predicted_pct(start) 약간 ↑
- Comp의 doneActual ↑ (closure done인데 actual_completion_date 없는 항목 회복) → predicted_pct(comp) 약간 ↑
- Close는 영향 없음 (fallback 자체가 closure 단일)
- 단조성: doneActual(start) ≥ doneActual(comp) ≥ doneActual(closure)가 항상 성립
- planPct는 영향 없음 (planned 일자만 사용)

## 파일 변경

1. **`src/lib/defect-simulation.ts`**
   - `getEffectiveActualDate(item, stage)` 헬퍼 신설 (파일 내부 함수)
   - `simulateDefectStageAt`의 actual 비교를 effectiveActual로 교체
   - `buildDefectSimulationSeries`의 pre-extract 단계에서 `actualDone`을 effectiveActual 기반으로 산출
   - `simulateByTeam`은 `simulateDefectStageAt`를 그대로 호출하므로 자동 반영

2. **`src/test/defect-simulation.test.ts`**
   - 신규 케이스 1: `actual_completion_date`만 있고 `actual_start_date` null → start.doneActual에 포함되는지
   - 신규 케이스 2: `actual_closure_date`만 있고 start/completion null → 두 단계 모두 doneActual에 포함되는지
   - 신규 케이스 3: completion이 `actual_progress_pct ≥ 100`로 done이지만 actual 일자 전혀 없음 → done이지만 effectiveActual=null이므로 여전히 doneActual에 미포함 (의도된 동작)
   - 기존 케이스: 결과 변하지 않음을 확인

## 명시적 비범위

- `isDefectStageDone` 자체는 변경하지 않음 (cascade 의미가 이미 정의되어 있고 다른 페이지에서도 사용됨)
- `actual_progress_pct ≥ 100`만으로 done이고 actual 일자가 전혀 없는 항목은 effectiveActual이 null → 여전히 doneActual에서 제외 (날짜가 없으면 시계열 위치를 알 수 없으므로 안전)
- DefectProgressPage / 다른 페이지 로직은 변경 없음

## 검증

- `vitest run src/test/defect-simulation.test.ts`
- /defects/simulation에서 Start vs Comp의 DONE NOW 차이가 줄어들고, "GAP VS PLAN"이 음수에서 0에 더 가깝게 변하는지 육안 확인
