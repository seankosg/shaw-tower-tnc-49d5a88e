## 배경 / 문제

현재 OMM Executive Dashboard의 **1st Status** 카드와 **2nd Status** 카드는 각각 모든 row를 독립적으로 분류합니다.

예) Sub1 제출 완료 + Sub1 응답 미수신 + Sub2 미제출인 row는
- 1st Status → **UR** 로 카운트
- 2nd Status → **TBS** 로 카운트

→ 같은 row가 두 카드에 모두 잡혀 **두 카드의 합계가 전체 row 수의 2배**가 됩니다. 사용자가 원하는 정책은 "row 1개 = 집계 1회"입니다.

## 목표 정책

각 row는 **현재 활성 cycle**의 카드에만 1회 카운트되어야 합니다.

활성 cycle 정의 (기존 `computeOmmStatus` 파이프라인을 재사용):

| 데이터 상태 | 활성 단계 | 어디에 카운트 |
|---|---|---|
| 아무 데이터 없음 / sub1 제출 전 | **Sub1** | 1st Status (TBS) |
| sub1_actual 있음, response 미정 | **Sub1** | 1st Status (UR) |
| sub1 response = A/B/C 받음 → 다음 사이클로 진행 | **Sub2 이상** | 1st Status에서는 빠짐 |
| sub2 단계 진행 중 | **Sub2** | 2nd Status (TBS/UR) |
| sub2 response 받음 | **Sub3 / Final** | 2nd Status에서는 빠짐 |
| sub3 / final 단계 | **Sub3 / Final** | 해당 Stage 카드 |
| final response = A | **Closed** | Approved 카드 |
| final response = B/C | **Rejected** | (전체 카운트 외 별도 표시) |

핵심: "**A/B/C 응답을 받은 cycle은 종결되었으므로 다음 cycle로 넘어간 것**"으로 보고 이전 카드에서는 빼는 정책. 이렇게 하면 모든 카드의 합 = row 총수가 보장됩니다.

## 변경 범위

### 1. `src/lib/docs-stage-records.ts`

- **추가**: `currentOmmCycle(row): 'sub1' | 'sub2' | 'sub3' | 'final' | 'closed' | 'rejected'` 함수.
  - 로직은 `computeOmmStatus`와 동일 분기를 사용해 활성 cycle 1개를 반환.
- **수정**: `classifyOmmSub1Status(row)` — `currentOmmCycle(row) !== 'sub1'`이면 `null`(집계 제외) 반환.
- **수정**: `classifyOmmSub2Status(row)` — `currentOmmCycle(row) !== 'sub2'`이면 `null` 반환.
- **수정**: `computeOmmSub1StatusBuckets` / `computeOmmSub2StatusBuckets` — `null` 반환 시 카운트 스킵 (total에도 포함되지 않음). 결과적으로 카드의 `total`은 "현재 그 단계에 머물러 있는 row 수"가 됨.

### 2. `src/lib/docs-dashboard-filter.ts`

- `params.sub1_status` 필터: 활성 cycle이 sub1인 row만 매칭하도록 가드 추가.
- `params.sub2_status` 필터: 활성 cycle이 sub2인 row만 매칭하도록 가드 추가.
- 이렇게 해야 카드의 숫자와 클릭 후 Raw Data에 보이는 row 수가 일치함.

### 3. `src/pages/docs/DocsExecutiveDashboardPage.tsx`

- **카드 부제 / 툴팁 추가**: 두 Status 카드에 "Items currently in this cycle" 같은 한 줄 설명을 붙여 활성 단계 한정 의미를 명시.
- 기존 dev-mode warning(`bucket sum != total`)은 그대로 유지 (변경 후에도 sum==total이 보장됨).

### 4. 검증 — 합계 일관성

다음 등식이 모든 team 탭 / All 탭에서 성립해야 함:

```text
1st Status.total
+ 2nd Status.total
+ Sub3 단계 row 수 (Stage Progress의 Sub3 카드 total)
+ Final 단계 row 수 (Final Submission + Final Approval 중복 없는 합)
+ Approved row 수
+ Rejected row 수
= 전체 OMM row 수
```

수동 점검 + 기존 dev console warning으로 확인.

### 5. 영향 받지 않는 부분

- ABD / Warranty 카드: 변경 없음.
- OMM 상세 페이지(`computeOmmStatus`, `OmmCycleProgress`): 변경 없음. 각 row 자체의 cycle별 history는 그대로 표시됨.
- Raw Data 테이블의 컬럼 표시(`sub1_response_status` 등): 변경 없음. 분류는 카드 / 필터 레벨에만 적용.

## 변경되지 않는 점 (의도적)

- 1st Status 카드의 **A 버킷은 보통 0**이 됩니다. (A를 받은 순간 다음 cycle로 넘어가므로). 이는 정책의 자연스러운 결과이며, "1st cycle에 머물러 있는 항목 중 A인 것"이라는 의미가 보존됨.
- 만약 "history 기준 A/B/C 누적 통계"가 별도로 필요하면 추후 별도 카드로 추가하면 됨 (이번 작업 범위 외).

## 영향 파일

- `src/lib/docs-stage-records.ts` (수정 + 함수 추가)
- `src/lib/docs-dashboard-filter.ts` (수정)
- `src/pages/docs/DocsExecutiveDashboardPage.tsx` (카드 설명 문구만 소폭)
