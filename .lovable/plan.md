
## 목적

T&C Re-import는 현재 **행 1개당 3~5회의 Supabase 왕복**을 실행합니다. 1,000행이면 3,000~5,000회 네트워크 호출이 직렬로 발생해, 대형 파일에서는 분 단위로 늘어집니다. 이를 **파일 시작 시 1회 prefetch + 행 처리는 메모리 연산 + 끝에서 배치 쓰기**로 재구성해 **5~20배** 빠르게 만듭니다.

## 현재 병목 (`src/contexts/ImportContext.tsx`, `processFile` 루프)

행당 발생하는 await:
1. `subtests select` — 본 레코드 조회 (line 407)
2. `subtests select` — t1/t2/pred status·actual_date 재조회 (line 489) ← **(1)과 동일 행**
3. `subtests select` — r1/r2 target/status 재조회 (line 523) ← **(1)과 동일 행**
4. `subtests update` 또는 `insert` (line 556 / 675)
5. `ensureSubcontractor / ensureSubsub / ensureHdecPic` — 캐시 미스 시 insert + edge function 호출

추가로 `system_master`/`alias`/`subcontractor_master`/`hdec_pic_master`는 파일당 1회만 prefetch하지만, **upload_row_logs / change_log / field_logs는 끝에서 100~200건씩 직렬 chunk insert**라 수천 행에서 누적 지연이 큽니다.

## 효율화 전략

### 1. 행당 select 3회 → 0회 (가장 큰 이득)

`existing`, `existingDates`, `existingR`은 사실상 **같은 row의 다른 컬럼**입니다. 다음으로 통합:

- 파일 시작 시 `(item_no, mos_code)` 쌍 전체를 모아서 **단일 쿼리**로 prefetch:
  ```ts
  // chunk by 500쌍씩 .or() 또는 IN tuple
  supabase.from('subtests')
    .select('id, project_id, system_id, item_no, mos_code, subtest_id, row_version, is_active,
             pred_planned_date, t1_planned_date, t2_planned_date,
             r1_target_submission_date, r2_target_submission_date, r2_target_approval_date,
             t1_status, t1_actual_date, t2_status, t2_actual_date,
             pred_status, pred_actual_date, r1_status, r2_status, custom_payload')
    .eq('project_id', projectId)
    .in('item_no', uniqueItemNos)   // 1차 좁히기
  ```
  결과를 `Map<\`${item_no}|${mos_code}\`, ExistingRow>`로 메모리에 보관.
- 행 루프에서는 `existingMap.get(key)` 단일 조회 — **DB 왕복 0회**.
- 효과: 1,000행 기준 **3,000회 → ~2회** select.

### 2. update/insert 배치화

행 단위 `await update/insert`를 두 개의 버킷에 적재:
- `pendingInserts: SubtestInsert[]`
- `pendingUpdates: { id, patch }[]`

루프 종료 후:
- **Insert**: `supabase.from('subtests').insert(pendingInserts, { defaultToNull: false })`를 **500건 chunk**로.
- **Update**: 동일한 컬럼 셋을 갖는 행은 `upsert(rows, { onConflict: 'id' })`로 한 번에 보냄. 컬럼 셋이 다양하면 100건 chunk의 `upsert` 호출로도 충분 (행당 단일 update 1,000회 → 10회).
- 단, `row_version` 낙관적 잠금이 필요한 경우 update만 별도 처리. 현재 코드는 `existing.row_version + 1`을 단순 증가만 하므로 conflict 검사 없이 upsert 가능.

효과: 1,000행 기준 **1,000회 update → 10~20회 upsert**.

### 3. 마스터 자동 생성(ensureXxx) 비동기 직렬 → 사전 일괄

루프 전에 `parsed` 전체를 스캔해 **새로 생성해야 할 subcontractor/subsub/hdec_pic 이름 집합**을 구함. 그 다음:
- `subcontractor_master`에 일괄 insert (chunk 100).
- `auto-create-master-user` edge function 호출은 **`Promise.all`로 병렬화** (현재는 행 처리 중간에 직렬 await).
- 캐시를 다시 한번 채운 뒤 행 루프 진입.

효과: 신규 마스터 N건일 때 **N회 직렬 await → 1~2회 batch + 병렬 edge call**.

### 4. 로그 insert 병렬화

현재 `rowLogs / scheduleChangeAudits / changeLogs / fieldLogs`를 100~200건씩 **순차** chunk insert. 이들은 서로 무관하므로:
- 각 테이블별로 chunk 배열을 만든 뒤 `Promise.all(chunks.map(c => supabase.from(t).insert(c)))`.
- chunk 크기를 500으로 상향 (PostgREST 기본 한계 내).

효과: 로그 쓰기 시간 **N배 (병렬도)** 단축.

### 5. progress 업데이트 throttle

`updateFile(item.id, { progress })`를 **행마다** 호출 → React 전체 리렌더가 1,000회. 50행마다 또는 100ms마다 업데이트하도록 변경.

### 6. 기타 마이크로 최적화
- `fields` 배열의 `JSON.stringify` 비교는 그대로 두되, custom_payload 비교만 별도 헬퍼로 분리.
- `formatPgError`는 그대로 유지.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/contexts/ImportContext.tsx` | `processFile` 재구성: prefetch → 메모리 처리 → 배치 쓰기 → 병렬 로그 insert |
| (신규 헬퍼 권장) `src/lib/import-prefetch.ts` | `prefetchExistingSubtests`, `prefetchMasters`, `bulkEnsureMasters` 추출 |

기능적 동작(자동채움 규칙, schedule audit, field log, row log, T1/T2 보정 등)은 **완전히 동일**하게 유지합니다 — 단지 실행 형태만 변경.

## 예상 성능 (1,000행 파일 기준, 가정: 50ms RTT)

```text
                       현재          개선 후
select per row         3 × 1000      0
master ensure await    ~50           ~5 (병렬)
update/insert          1 × 1000      ~10 (chunk)
log inserts (직렬)     ~30           ~5 (병렬)
─────────────────────────────────
총 await (대략)        ~3,080        ~25
예상 소요              ~150s         ~5~10s
```

## 리스크 & 검증

- **메모리**: 1,000행 × 컬럼 30개 = 무시 가능 (~수 MB).
- **트랜잭션 원자성**: 현재도 트랜잭션 없음 (행별 commit). 배치 upsert로 바뀌어도 동일한 의미.
- **row_version 동시성**: 다중 사용자가 같은 subtest를 동시에 import할 가능성이 낮으므로 단순 +1 유지. 향후 RPC로 옮기는 옵션은 별도 작업.
- **검증**: 동일 파일을 (a) 첫 import (b) 변경 없이 재import (c) 일부 셀 변경 후 재import 세 시나리오로 row_logs / field_logs 결과가 변경 전과 동일한지 비교.

승인하시면 이 변경을 그대로 구현합니다.
