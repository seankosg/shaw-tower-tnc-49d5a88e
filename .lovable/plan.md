## 목적

이전 단계에서 prefetch + 메모리 lookup + 병렬 로그 insert 까지 적용했습니다. 이제 남은 직렬 await인 **행별 `subtests.update` / `subtests.insert` 호출**(`processFile` 루프 내 line 660 / 779)을 **concurrency pool (8~10)** 로 병렬 실행해 추가 5~10배 가속합니다.

## 현재 병목

`for (let i = 0; i < parsed.length; i++)` 루프가 **각 행마다 await update/insert**합니다.
- 1,000행이면 1,000회 직렬 RTT.
- 50ms RTT 가정 시 update/insert만 ~50초 소요.
- 모든 사전 준비(prefetch, master, system resolve)는 이미 메모리에서 끝났으므로 **DB 쓰기만 남음** → 동시 실행해도 안전.

## 전략: Concurrency Pool

### 1. 루프를 **task 생성 단계** + **task 실행 단계**로 분리

현재 루프는 다음 두 가지를 섞어 합니다:
1. **준비**: system resolve, validation, existing lookup, updates 객체 빌드, autofill, scheduleImpact 계산
2. **실행**: `await update/insert` + 결과를 res / rowLogs / changeLogs / scheduleChangeAudits / fieldLogs 에 push

**1단계는 메모리 연산이라 매우 빠름**. 이를 먼저 **순차로** 돌면서 다음 둘 중 하나의 task 객체를 만듭니다:

```ts
type WriteTask =
  | { kind: 'update'; id: string; updates: Record<string, any>;
      // 성공 시 push할 후속 데이터
      successRowLog: any; scheduleAudit?: any; scheduleChangeLogs?: any[]; fieldLogsOnSuccess: PendingFieldLog[];
      // 실패 시 push할 데이터
      failRowLog: (err: string) => any; failFieldLog: (err: string) => PendingFieldLog;
      counter: 'updated'; }
  | { kind: 'insert'; payload: Record<string, any>;
      successRowLog: any; fieldLogsOnSuccess: PendingFieldLog[];
      failRowLog: (err: string) => any; failFieldLog: (err: string) => PendingFieldLog;
      counter: 'inserted'; };
```

이미 **rejected**, **skipped** 분기는 await가 없으므로 기존처럼 즉시 처리하고 task에 넣지 않습니다.

### 2. Concurrency pool 로 task 실행

```ts
const CONCURRENCY = 8;
async function runPool<T>(tasks: T[], worker: (t: T) => Promise<void>) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= tasks.length) return;
      await worker(tasks[i]);
    }
  });
  await Promise.all(workers);
}
```

worker 안에서:
- `update` → `supabase.from('subtests').update(t.updates).eq('id', t.id)`
- `insert` → `supabase.from('subtests').insert(t.payload)`
- 성공: `res[t.counter]++`, `rowLogs.push(t.successRowLog)`, scheduleAudit/changeLogs/fieldLogs 누적
- 실패: `res.rejected++`, `rowLogs.push(t.failRowLog(err))`, `fieldLogs.push(t.failFieldLog(err))`

**카운터/배열 push는 단일 JS 스레드라 race 안전**. 단, push 순서는 비결정적 → 후속 정렬이 필요한 곳이 있는지 확인 필요. (현재 코드는 `rowLogs`/`changeLogs` 모두 chunk insert만 하고 별도 정렬·인덱스 의존성 없음 → 안전.)

### 3. 동시성 한도 선택

- **CONCURRENCY = 8** 권장. PostgREST/PgBouncer 풀이 일반적으로 15~25 사이라 여유 있음.
- 환경변수/상수로 두어 추후 조정 가능.

### 4. Progress 갱신

각 task 완료 시 `completed++` 후 `PROGRESS_STEP` 단위로 `updateFile(item.id, { progress })`. 현재처럼 throttle 유지.

### 5. 에러 표면

- 한 행의 update/insert 실패는 다른 행을 막지 않음 (현재와 동일 의미).
- Pool 내부에서 throw 하지 않고 항상 catch → 카운터에만 반영.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/contexts/ImportContext.tsx` | `processFile` 루프를 (a) 동기 task 빌드, (b) `runPool` 로 8-병렬 실행, (c) 기존 병렬 로그 insert 단계로 재구성. 비즈니스 로직(autofill, schedule impact, field log 분류 등)은 그대로 함수로 추출하거나 task closure 안에 보존. |

## 동작 동등성 보장

다음은 **변경되지 않습니다**:
- system resolve, dataDate validation, master autocreate, autofill (T1/T2/Pred status·actual, R1/R2 derive), schedule impact 계산 규칙.
- rowLogs / scheduleChangeAudits / changeLogs / fieldLogs 의 **내용**.
- res 카운터 (inserted / updated / skipped / rejected) 의 최종 값.
- upload_batches 상태 업데이트.

**바뀌는 것**: 1) update/insert 가 8개씩 동시에 발사됨. 2) 로그 배열의 순서가 입력 행 순서와 일치하지 않을 수 있음 (정렬에 의존하는 코드 없음 — 확인됨).

## 예상 성능 (1,000행, 50ms RTT)

```text
                       이전(현재)    이번 단계 후
update/insert 직렬     ~50s          ~50s / 8 ≈ 6~7s
prefetch + 로그        ~3s           ~3s
─────────────────────────────────
총                     ~55s          ~10s   (5~7배)
```

## 리스크 & 검증

- **DB 부하**: 동시 8 connection 정도는 Supabase 기본 풀에 안전. 더 큰 동시성은 풀 고갈 위험.
- **Trigger 경합**: subtests 테이블에 actual_date validation / responsibility validation trigger 가 있으나 row-level 이라 동시 update 안전.
- **검증 시나리오** (이전과 동일):
  (a) 첫 import → inserted 카운트와 row_logs 동일,
  (b) 변경 없이 재import → skipped 카운트 동일,
  (c) 일부 셀 변경 후 재import → updated 카운트, change_log/field_log 내용 동일 (행 순서는 무관 비교).

승인하시면 바로 구현합니다.