# Closure Status 자동 변경 문제 수정 — 옵션 2

## 문제 요약
`DefectDetailPage`에서 어떤 필드(예: Description, Remarks, Trade 등)를 수정해 저장해도 `closure_status`가 **Planned**로 바뀌는 현상.

원인: 저장 시점에 사용자가 `closure_status`/`completion_status` 입력을 직접 건드리지 않았다면, 자동 재계산 결과로 **무조건 덮어쓰기** 하고 있기 때문. 날짜/진행률이 그대로여도 재계산 함수가 기본값 `Planned`를 반환하면 그 값이 DB에 저장됨.

## 해결 방향 (옵션 2)
자동 재계산은 **상태 산정에 영향을 주는 입력값이 실제로 변경된 경우에만** 수행. 그렇지 않으면 기존 DB 값을 그대로 유지.

상태 산정에 영향을 주는 필드:
- `planned_start_date`, `planned_completion_date`, `planned_closure_date`
- `actual_start_date`, `actual_completion_date`, `actual_closure_date`
- `actual_progress_pct`
- (`planned_progress_pct`는 위 필드에서 파생되므로 별도 체크 불필요)

## 변경 파일

### 1) `src/pages/DefectDetailPage.tsx` (243~259 라인 근처)
- "상태 영향 필드 중 하나라도 변경되었는가?"를 계산하는 `statusInputsChanged` 플래그 도입.
- `statusInputsChanged === false`이면 자동 재계산 블록 자체를 건너뜀 → 기존 `record.completion_status`, `record.closure_status` 유지 (사용자가 폼에서 직접 바꾼 경우는 `payload.*_status = form.*_status`로 이미 반영됨).
- 사용자가 상태 필드를 직접 변경한 경우(`userChangedCompletion`/`userChangedClosure`)에는 그 값이 우선.

의사 로직:
```text
statusInputsChanged =
   record.planned_start_date     !== payload.planned_start_date     ||
   record.planned_completion_date!== payload.planned_completion_date||
   record.planned_closure_date   !== payload.planned_closure_date   ||
   record.actual_start_date      !== payload.actual_start_date      ||
   record.actual_completion_date !== payload.actual_completion_date ||
   record.actual_closure_date    !== payload.actual_closure_date    ||
   (record.actual_progress_pct ?? null) !== (payload.actual_progress_pct ?? null)

if (statusInputsChanged) {
   const auto = computeDefectStatuses(...)
   if (!userChangedCompletion) payload.completion_status = auto.completion_status
   if (!userChangedClosure)    payload.closure_status    = auto.closure_status
}
// statusInputsChanged === false 이면 record.* 값을 그대로 보존
```

### 2) `src/pages/DefectQuickUpdatePage.tsx` (32~48 라인)
동일한 정책 적용. `patch`에 위 7개 필드 중 하나라도 들어있을 때만 `computeDefectStatuses` 결과를 `finalPatch`에 합쳐 저장. 아니면 자동 재계산 없이 변경된 필드만 저장.

### 3) 테스트 보강 (선택 — 현재 모드 통과 후)
`src/test/defect-status.test.ts`에 다음 회귀 테스트 추가:
- "Description만 변경된 경우, save payload에 closure_status가 포함되지 않는다" (단위/시뮬레이션 테스트)

## 영향 범위 / 위험
- 영향: Defect 저장 경로 2곳(상세, Quick Update)만 변경. Import/벌크 경로는 원래 자동 재계산을 거치지 않으므로 영향 없음.
- 사용자가 날짜/진행률을 바꾸면 기존처럼 자동 재계산 동작(상태 필드를 직접 손대지 않은 경우만 덮어쓰기).
- 기존 DB row는 변경 없음. 잘못 덮어써져 이미 Planned가 된 데이터는 사용자가 다시 올바른 값으로 저장하거나, 필요 시 별도 일괄 보정 스크립트를 추가로 요청 주시면 됩니다.

승인 주시면 위 두 파일을 수정하겠습니다.
