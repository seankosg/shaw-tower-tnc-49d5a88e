# Closure → Completion 자동 일관성 보정

## 결정 요약 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 1. `actual_completion_date` 보정 방식 | **(c) 권장안**: `actual_closure_date` 복사 + `actual_progress_pct=100` 보정 |
| 2. LL Status="Closed"인데 closure date 없을 때 | **동일하게 보정** (`data_date` 사용해서 completion_date 설정) |
| 3. 엑셀 명시값과 충돌 시 | **엑셀값 우선** (경고만 import log에 기록, 자동 보정 안 함) |
| 4. 기존 데이터 backfill | **신규 import부터만 적용** (과거 데이터는 그대로 유지) |

## 핵심 로직

```text
[Closure 판정 결과]
   ├─ Done이 아님 → 보정 없음 (기존 로직)
   └─ Done
       ├─ Completion도 이미 Done → 보정 없음
       └─ Completion ≠ Done
           ├─ 엑셀에 actual_progress_pct가 명시(100 미만)됨 → 보정 안 함, log 경고
           └─ 그 외
               ├─ actual_completion_date ← actual_closure_date ?? data_date
               ├─ actual_progress_pct  ← 100
               └─ completion_status    ← 'Done'
```

**"엑셀 명시값 우선"의 정의:**
- 엑셀의 해당 row에서 `actual_completion_date` 또는 `actual_progress_pct` 컬럼에 **non-null 값이 들어 있고**, 그 값이 Done 조건을 충족하지 않으면 (예: pct=50) → 보정하지 않고 `defect_upload_row_logs`에 `closure_completion_conflict` reason으로 경고 기록.
- 엑셀에서 그 컬럼이 비어 있으면 (parser가 null로 읽음) → 자동 보정 진행.

## 변경 대상 파일

### 1. `src/lib/defect-status.ts` (핵심 로직 추가)
- 새 함수 `reconcileClosureCompletion(input, asOf): { completion_status, closure_status, patch?: { actual_completion_date, actual_progress_pct }, conflict?: boolean }` 추가.
- 기존 `computeDefectStatuses`는 순수 status 계산만 유지하고, 신규 함수는 import path에서만 호출하여 신/구 동작 분리.

### 2. `src/contexts/DefectImportContext.tsx` (신규 import 시점 적용)
- 각 row의 status 계산 직후 `reconcileClosureCompletion` 호출:
  - `patch`가 있으면 DB upsert payload에 `actual_completion_date`, `actual_progress_pct=100`, `completion_status='Done'` 반영.
  - `conflict=true`인 경우 `defect_upload_row_logs`에 `reason_code='closure_completion_conflict'`, detail에 엑셀 값 기록.
  - import 결과 summary에 `autoReconciled` 카운터 추가 (선택적).

### 3. `supabase/functions/recompute-defect-status/index.ts` (cron은 status만, 데이터 수정 안 함)
- 결정 #4(신규 import만 적용)에 따라 cron에서는 **데이터 보정 없이 기존 동작 유지**. 단, status 계산 시 `closure='Done' && completion!='Done'` 모순이 감지되면 `completion_status='Done'`으로만 보정 (data 컬럼은 건드리지 않음). → 이는 향후 일관성 유지를 위한 최소한의 status-level 보정.
  - 만약 이것도 원치 않으시면 알려주세요. cron은 완전히 손대지 않을 수도 있습니다.

### 4. `src/test/defect-status.test.ts` (테스트 추가)
- `reconcileClosureCompletion` 케이스:
  - closure_date 있음 → completion_date 복사 + pct=100
  - LL status="Closed", closure_date 없음 → data_date 사용
  - 엑셀 pct=50 명시 → 보정 안 함, conflict 플래그
  - 엑셀 completion_date 명시(과거) → 보정 안 함
  - closure≠Done → 변경 없음

## 영향 분석 / 주의사항

- **Re-import 모드**: 기존 row 업데이트 시에도 동일 로직 적용 (신규 import 범주에 포함).
- **change_log**: 자동 보정으로 변경된 `actual_completion_date`, `actual_progress_pct`, `completion_status`는 `change_source='auto_reconcile'`로 `defect_change_log`에 기록.
- **과거 데이터**: backfill 안 함. 기존 모순 row는 화면에서 그대로 보임. 추후 필요 시 별도 마이그레이션 작업 요청 가능.
- **Conflict 경고 가시화**: import 결과 dialog/summary에 conflict 카운트는 표시하지만, 사용자 확인 없이 진행 (엑셀값 우선 결정에 따름).

## 구현 후 동작 예시

| 케이스 | 엑셀 입력 | DB 저장 결과 |
|---|---|---|
| closure_date=2026-04-20, completion_date=비어있음, pct=비어있음 | 정상 | completion_date=2026-04-20, pct=100, completion_status=Done |
| LL status="Closed", 모든 actual 비어있음, data_date=2026-04-25 | 정상 | completion_date=2026-04-25, pct=100, completion_status=Done |
| closure_date=2026-04-20, 엑셀 pct=50 명시 | 모순 | pct=50 유지, completion_status=Delay/WIP, **log 경고 기록** |
| closure 미완료 | 정상 | 기존 로직 그대로 |

승인하시면 구현하겠습니다.
