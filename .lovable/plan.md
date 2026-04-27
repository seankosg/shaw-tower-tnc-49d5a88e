## 목표

**Total Stage Overdue / Total Stage At Risk** 배너의 합계가 Tier 2 카드 5개(Pred / T1 / T2 / R1S / R2A)의 OD 배지 합과 정확히 일치하도록 수정합니다.

현재 6개 스테이지(Pred/T1/T2/R1/**R2S**/R2A)를 합산해 Tier 2 합보다 R2 Submission 지연 건수만큼 많이 표시되고 있어, **R2S(R2 Submission)를 occurrence 합계에서 제외**합니다.

| 스테이지 | Tier 2 카드 | 현재 occurrence 합계 | 수정 후 |
|---|---|---|---|
| Pred | ✅ | 포함 | 포함 |
| T1 | ✅ | 포함 | 포함 |
| T2 | ✅ | 포함 | 포함 |
| R1 (Submission) | ✅ | 포함 | 포함 |
| R2 (Submission) | ❌ | 포함 | **제외** |
| R2 (Approval) | ✅ | 포함 | 포함 |

예시(사용자 케이스): 2 + 11 + 2 + 74 + 45 = **134** ← 이 값과 일치하게 됨.

## 변경 파일

### `src/lib/dashboard-utils.ts`
- 신규 상수 추가:
  ```ts
  const OCCURRENCE_STAGES: StageKey[] = ['pred', 't1', 't2', 'r1', 'r2a'];
  ```
- `countOverdueStageOccurrences`와 `countAtRiskStageOccurrences` 내부 루프에서 기존 `ALL_STAGES` 대신 `OCCURRENCE_STAGES` 사용.
- 다른 함수(`isOverdueAllStages`, `isAtRiskAllStages` 등)가 사용하는 `ALL_STAGES`는 **변경하지 않음** — 고유 Subtest 판정은 R2S 지연도 "지연 상태"로 인정해야 하므로 6 스테이지 유지.

## 비고

- `Subtest Overdue` / `Subtest At Risk` 카운트는 변경되지 않습니다(고유 Subtest 단위 판정 유지).
- 영향 범위: Tier 3 배너 2개(Total Stage Overdue, Total Stage At Risk)의 표시 숫자만 변경.
