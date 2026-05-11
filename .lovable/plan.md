## 1. ACRA 카드 제거

현재 위치: **Document Executive Dashboard** (`/docs/executive-dashboard`) → Warranty 섹션 → "Stage Progress" 영역.
(참고: 사용자가 본 `/docs/dashboard`의 Warranty KPI 카드는 placeholder라 stage 카드 자체가 없습니다. ACRA/Draft/Subcon/HDEC/Final 5개 카드가 표시되는 곳은 Executive Dashboard 입니다.)

### 변경 파일
**`src/lib/docs-stage-records.ts`**

- `WARRANTY_STAGE_DEFS` 배열(라인 73~79)에서 `'warranty.acra' / ACRA` 항목 1줄 삭제 → 4개 stage(Draft / Subcon Sign / HDEC Sign / Final)만 남김. `order`는 1~4로 재번호.
- `buildWarrantyStageRecords()`의 `items` 배열(라인 266~272)에서 `acra` 줄 1줄 삭제. 나머지 4줄은 `WARRANTY_STAGE_DEFS[0..3]` 인덱스로 자동 정렬되도록 그대로 유지(순서만 일치하게).

### 영향 범위
- Executive Dashboard Warranty Stage Progress 카드: 5개 → 4개
- ABD/OMM 모듈은 영향 없음
- `r_subcontract_date` 자체는 DB/타 화면에서 계속 사용됨(워런티 전체 status 계산용 `computeWarrantyOverallStatus`에서 'Pending ACRA' 판정에 그대로 사용). 단지 Executive Dashboard의 시각 카드에서만 빠지는 것.

---

## 2. Draft 카드 계산 로직 (현재 코드 기준)

**Draft 카드는 단순히 `draft_status` 값의 갯수를 세지 않습니다.** 워런티 레코드 1행마다 Draft stage 레코드 1건이 생성되고, 4가지 상태(Done/WIP/Planned/Delayed)로 분류됩니다.

분류 규칙 (`classifyWarrantyStageState`, `src/lib/docs-warranty-status.ts`):

| 상태 | 조건 |
|---|---|
| **Done** | `draft_status` ∈ {A, COMPLETE, OK} (대소문자 무관) |
| **WIP** | `draft_actual_date`는 있는데 `draft_status`가 비어있거나, `draft_status` ∈ {WIP, UR} |
| **Delayed (Overdue)** | `draft_planned_date < asOf` 이고 `draft_actual_date` 없음 |
| **Planned** | 그 외 (planned 일정만 있고 미래 / 둘 다 없음 등) |

카드에 표시되는 4개 숫자 (`StageProgress`):
- **Total** = 활성 워런티 행 수 (모든 행이 Draft stage 1건씩 기여)
- **Done** = 위의 Done 분류 행 수
- **Overdue** = Delayed(=계획일 지났는데 actual 없음) 행 수
- **Remaining** = Total − Done

즉 "Draft Status가 'A'인 갯수 = Done", 그리고 별도로 "지연된 행 수 = Overdue"가 함께 표시되는 구조입니다.

### 참고: 현재 동작에 대한 의문점
사용자가 "Draft Status의 갯수냐"고 물으신 의도가 다음 중 어느 것인지에 따라 후속 조치가 달라질 수 있습니다(이번 plan에는 미포함):

1. 지금 로직이 맞다 → ACRA 제거만 진행 (이 plan).
2. Draft = "draft_status A/B/C/UR 등 status 값별 분포"로 보고 싶다 → StageCard를 status-distribution 형태로 별도 변경 필요.
3. Draft = "draft_actual_date가 입력된 행 수"(=제출된 draft 수)로 정의하고 싶다 → `is_done` 판정 기준 변경 필요.

ACRA 제거 후, Draft 정의를 바꾸고 싶으시면 별도 요청 주세요.
