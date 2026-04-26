## Tier 2 Stage Card 클릭 동작 수정

대시보드 Tier 2의 5개 Stage 카드(Predecessor / T1 / T2 / R1S / R2A)를 클릭했을 때, 현재는 "해당 단계가 Done인 항목"으로 이동합니다. 이를 **"해당 단계의 Overdue 항목"** 으로 이동하도록 변경합니다.

각 카드의 `Overdue` 숫자(우상단 빨간 배지)와 클릭 후 보이는 행 수가 정확히 일치하게 됩니다.

## 변경 내용

**파일**: `src/pages/DashboardPage.tsx` (라인 336–340)

5개 `StageCard`의 `onClick` 핸들러를 각 단계의 delay-as-of 필터로 교체:

| 카드 | 현재 (Done으로 이동) | 변경 후 (Overdue로 이동) |
|---|---|---|
| Predecessor | `pred_status=Done` | `pred_delay_asof={dataDate}` |
| T1 | `t1_status=Done` | `t1_delay_asof={dataDate}` |
| T2 | `t2_status=Done` | `t2_delay_asof={dataDate}` |
| R1S | `r1_status=Submitted` | `r1_delay_asof={dataDate}` |
| R2A | `r2_status=Approved` | `r2_delay_asof={dataDate}` |

## 기술 노트

- Raw Data 페이지의 URL 필터 `pred_delay_asof / t1_delay_asof / t2_delay_asof / r1_delay_asof / r2_delay_asof` 는 이미 구현되어 있으며, 모두 동일한 `isStageDelayedAsOf(row, stage, asOf)` 로직을 사용합니다 (`SubtestList.tsx` 961–1002).
- 이 로직은 카드의 `Overdue` 카운트가 사용하는 `stageStat()` 의 판별식 `planned <= dataDate && !isStageDone(s, stage)` 와 동일하므로 숫자가 정확히 일치합니다.
- `dataDate`(최신 업로드 배치 날짜)를 `as_of` 기준으로 사용하므로 Tier 1 Overdue 카드와도 동일한 기준일을 공유합니다.
- 다른 카드(Tier 1 KPI, Tier 3 Alert Banner)와 표/차트 동작은 변경 없음.
