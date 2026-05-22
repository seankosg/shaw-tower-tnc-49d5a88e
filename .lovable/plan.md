## 목표

`Defect Raw Data` 화면, Dashboard의 "Dispute in Category" 배너, Excel Export 모두에서 `HDEC's Verification` / `HDEC's Reason` 값이 정상 표시되도록 한다.

## 근본 원인

`src/lib/defect-cache.ts`의 `SLIM_COLUMNS` 배열(26~72행)이 `defect_items` 테이블에서 select할 컬럼을 명시적으로 나열하는데, **`hdec_verification`과 `hdec_reason` 두 컬럼이 누락**되어 있다. 결과적으로 클라이언트 캐시에는 두 필드가 항상 `undefined`로 들어가고, 이 캐시를 소비하는 모든 화면/배너/export가 빈 값으로 보인다.

DB 자체와 Import 시 판별 로직은 정상이며, 실제로 Cat A 1,370행 중 1,284행에 verification이 채워져 있음을 확인했다.

## 변경 사항

### `src/lib/defect-cache.ts`

`SLIM_COLUMNS` 배열에 두 항목을 추가한다. 위치는 `closure_status` 다음, `work_type` 앞이 의미상 자연스럽다.

```ts
'closure_status',
'hdec_verification',   // ← 추가
'hdec_reason',         // ← 추가
'work_type',
```

이 한 줄 변경으로:
- 캐시 초기 로드 시점부터 두 컬럼이 포함되어 Raw Data 테이블에 즉시 표시됨
- Dashboard의 `Dispute in Category` 카운트(`HDEC's CAT A`, `Difference`)가 올바르게 계산됨
- Excel Export도 캐시를 그대로 사용하므로 자동으로 채워짐
- Realtime 패치 경로(같은 SLIM 컬럼 셋 사용)도 자동 적용됨

## 검증

1. Defect Raw Data 페이지 새로고침 → `HDEC's Verification` / `HDEC's Reason` 컬럼에 값이 보이는지 확인
2. Defect Dashboard 새로고침 → `Dispute in Category` 카드의 `HDEC's CAT A` 가 1,284 근처, `Difference`가 0 근처로 표시되는지 확인
3. Export Excel 다시 받아 두 컬럼 값이 채워지는지 확인

## 범위 외

- Import 판별 로직(`defect-priority-verifier.ts`), DB 스키마, Edge Function은 손대지 않는다.
- DB에는 이미 정확한 값이 있으므로 backfill이나 재분류는 불필요하다.
