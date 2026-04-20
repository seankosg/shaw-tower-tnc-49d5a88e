

## 셀 색상 의미 정리 + 녹색 추가 검토

현재 ScheduleCell의 막대 색상 체계는 다음과 같습니다 (tailwind config의 `schedule.*` 토큰):

| 토큰 | 현재 용도 | 색 계열 |
|---|---|---|
| `schedule-plan` | Plan 막대 (계획 수량) | 회색 |
| `schedule-actual` | Actual 막대 (실적, plan 이내) | 파랑 |
| `schedule-over` | 초과 실적 (actual > plan) | 주황 |
| `schedule-short` | 부족 (actual < plan, Diff 음수 텍스트) | 빨강 |

→ **현재 schedule 색상 팔레트에 녹색은 정의되어 있지 않습니다.**

질문하신 "녹색"이 어디에서 보이는지에 따라 두 가지 가능성이 있어 확인이 필요합니다:

### 가능성 A — 직전 plan 메시지의 표현 오류
직전 plan에서 제가 "파란/주황 영역(actual)" 을 "파란 혹은 초록"으로 적었는데, 실제 코드상 actual은 **파랑(schedule-actual)** + 초과분은 **주황(schedule-over)** 입니다. 초록은 사용되지 않습니다. → 이 경우 분리 클릭 plan은 그대로 유효하며, "actual 막대 클릭 = 파랑+주황 영역" 으로 정정하면 됩니다.

### 가능성 B — 다른 화면의 녹색
SubtestList의 `StageProgress` / `StatusBadge` 등 다른 컴포넌트에서 Done 상태를 녹색으로 표시할 수 있습니다. 이건 ScheduleCell의 막대 색과는 별개입니다.

### 확인 요청

녹색이 보이는 위치를 알려주시면 정확히 정리해 드리겠습니다:
- Schedule Matrix의 시간축 셀 막대 안 → **현재 코드엔 녹색 없음** (제 직전 표현이 잘못됨)
- Subtest List / Status Badge → 별도 색상 체계 (Done = 녹색 가능)
- 또는 사용자가 의도한 "녹색을 새로 도입"하고 싶은 케이스 (예: actual=plan 정확 일치 시 녹색)

