## 확인 결과

`/docs/omm?sub1_status=TBS`에서 보이는 Item No. **10, 11, 13, 32**는 모두 같은 패턴입니다 (DB 조회 결과):

| sn | sub1_actual_date | sub1_response_status | sub2_planned_date | sub2_actual_date |
|----|-------|------|------|------|
| 10 | (없음) | **C** | 2026-05-15 | 2026-05-12 |
| 11 | (없음) | **C** | 2026-05-15 | 2026-05-12 |
| 13 | (없음) | **C** | 2026-05-13 | 2026-05-13 |
| 32 | (없음) | **C** | 2026-05-15 | 2026-05-12 |

→ 1st Status가 'C'로 부여돼 있고 2nd 제출까지 완료됐는데, `sub1_actual_date` 값이 비어있다는 이유 하나만으로 **TBS(To Be Submitted)** 로 분류되고 있습니다. 사용자 지적이 맞습니다.

## 원인

`src/lib/docs-stage-records.ts`의 `classifyStatus` / `computeBuckets` 로직:

```ts
if (!r?.[actualKey]) { out.TBS++; continue; }   // sub1_actual_date 없으면 무조건 TBS
```

→ response_status(A/B/C)나 후속 단계(sub2 planned/actual) 신호를 무시하고 actual_date 단일 컬럼만 봄.

## 변경 계획

`src/lib/docs-stage-records.ts`의 1st/2nd Status 분류 함수를 보정합니다. **TBS로 분류하기 전에 "실제로는 제출이 일어났을 가능성"이 있는지 확인**하고, 그런 경우는 response_status로 분류합니다.

### 1. `classifyStatus` 시그니처 확장

각 단계별로 "다음 단계가 진행됐는지" 신호를 받도록 헬퍼를 분기합니다:

- **Sub1 status 분류 보정 조건** — `sub1_actual_date`가 비어 있어도 다음 중 하나라도 참이면 TBS로 보지 않음:
  - `sub1_response_status` ∈ {A, B, C}  (1st 응답이 부여됨 → 제출은 있었음)
  - `sub1_response_date`가 있음
  - `sub2_planned_date` 또는 `sub2_actual_date`가 있음 (다음 사이클로 진행됨 → 1st 제출은 묵시적으로 완료)

  → 이 경우 `sub1_response_status`(A/B/C)로 분류, 응답 상태도 비어 있으면 `UR`.

- **Sub2 status 분류 보정 조건** — `sub2_actual_date`가 비어 있어도 다음 중 하나라도 참이면 TBS로 보지 않음:
  - `sub2_response_status` ∈ {A, B, C}
  - `sub2_response_actual_date`가 있음
  - `sub3_planned_date` 또는 `sub3_actual_date`가 있음
  - `final_planned_date` / `final_actual_date`가 있음

  → 같은 방식으로 응답 상태가 비어 있으면 `UR`.

### 2. 영향 범위

수정 대상 함수:
- `computeBuckets` → `computeOmmSub1StatusBuckets`, `computeOmmSub2StatusBuckets` (Executive Dashboard 카드 카운트)
- `classifyStatus` → `classifyOmmSub1Status`, `classifyOmmSub2Status` (Raw Data Page 필터링용 행 분류)

두 곳 모두 같은 보정 규칙을 공유하도록 단일 헬퍼로 통합합니다.

### 3. 후속 영향

- `/docs/omm?sub1_status=TBS` 카운트와 행 목록에서 위 4건이 빠지고 각자 응답 상태(C)에 합산됩니다.
- Executive Dashboard의 Sub1 Status / Sub2 Status 카드 숫자도 같은 규칙으로 재계산됩니다.
- 데이터 입력 자체(예: `sub1_actual_date` 채우기)는 건드리지 않습니다 — 분류 로직만 보정.

### 4. 테스트

- 기존 `src/test/` 하위에 OMM status 관련 테스트가 있는지 확인 후, 신규 케이스 추가:
  - `sub1_actual_date` 없음 + `sub1_response_status='C'` → C
  - `sub1_actual_date` 없음 + `sub2_actual_date` 있음 + response 빈값 → UR
  - `sub1_actual_date` 없음 + 모든 후속 신호 없음 → TBS (기존 동작 유지)

## 작업 파일

- `src/lib/docs-stage-records.ts` (수정)
- 관련 단위 테스트 파일 (있다면 추가/수정)
