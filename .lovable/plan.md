
## 구현 계획: Defect Detail 카드 UI 재구성

`Defect Detail` 화면의 첫 번째 카드 구성을 요청하신 layout으로 변경하겠습니다. 화면의 UI label은 기존 정책대로 영어로 유지합니다.

## 1. 카드 제목 변경

현재 제목:

```text
Defect Detail · {issue_no}
```

변경 후:

```text
ITEM DETAIL - NO.[Issue No]    Closure Status: [closure_status]
```

예시:

```text
ITEM DETAIL - NO.DF-000123    Closure Status: Open
```

`Status` 표시는 별도 `status` 컬럼이 아니라, 요청하신 대로 `closure_status` 값을 사용합니다.

## 2. 카드 필드 배열 변경

첫 번째 Detail 카드의 field 배치를 아래 순서로 재구성합니다.

```text
Row 1:
Issue No | Subcon Issue No | Subcon Issue Source

Row 2:
Type | Level | Location

Row 3:
Main Trade | Sub Trade | Work Type

Row 4:
Subcontractor | Sub-Sub | HDEC PIC

Row 5:
Captured on | Start Date | Finish Date

Row 6:
Actual Start Date | Actual Finish Date | Closed Date

Row 7:
Planned Progress | Actual Progress | Difference
```

기본 grid는 desktop 기준 3 columns로 유지하고, mobile에서는 1 column로 자연스럽게 접히도록 구성합니다.

## 3. 필드 데이터 매핑

현재 `defect_items` 테이블에 직접 존재하는 필드는 기존 값을 사용합니다.

```text
Issue No                  → issue_no
Subcon Issue No           → subcontractor_issue_no
Subcon Issue Source       → subcontractor_issue_source
Type                      → area_type
Level                     → area_level
Location                  → area_location
Main Trade                → main_trade
Sub Trade                 → sub_trade
Subcontractor             → subcontractor_name
Sub-Sub                   → subsub_name
HDEC PIC                  → hdec_pic_name
Closed Date               → closed_date
Actual Progress           → actual_progress_pct
Closure Status            → closure_status
```

현재 전용 DB 컬럼이 없는 항목은 우선 import 원본 `raw_payload`에서 alias 기반으로 표시합니다.

```text
Work Type                 → raw_payload의 Work Type 계열 header, 없으면 trade_detail 또는 defect_type fallback
Captured on               → raw_payload의 Captured on 계열 header, 없으면 created_at fallback
Start Date                → raw_payload의 Start 계열 header
Finish Date               → raw_payload의 Finish 계열 header
Actual Start Date         → raw_payload의 Actual Start 계열 header
Actual Finish Date        → raw_payload의 Actual Finish 계열 header
Planned Progress          → raw_payload의 Planned Progress 계열 header
```

`Difference`는 다음 기준으로 표시합니다.

```text
Difference = Actual Progress - Planned Progress
```

`Planned Progress`가 없으면 `Difference`는 `—`로 표시합니다.

## 4. raw_payload alias helper 추가

`DefectDetailPage.tsx` 안에 표시 전용 helper를 추가합니다.

```text
getRawValue(record.raw_payload, aliases)
```

예시 alias:

```text
Captured on:
- Captured on
- Captured On
- Captured Date
- Capture Date

Start Date:
- Start
- Start Date
- Planned Start
- Plan Start

Finish Date:
- Finish
- Finish Date
- Planned Finish
- Plan Finish

Actual Start Date:
- Actual Start
- Actual Start Date

Actual Finish Date:
- Actual Finish
- Actual Finish Date

Planned Progress:
- Planned Progress
- Planned Progress %
- Plan Progress
- Plan %
```

대소문자, 공백, `(H)` suffix 차이는 무시해서 찾도록 합니다.

## 5. 입력 가능 / 읽기 전용 처리

기존에 DB 컬럼으로 관리되는 필드는 현재 권한 로직을 유지합니다.

```text
canEdit = true:
- Subcon Issue No
- Subcon Issue Source
- Type
- Level
- Location
- Main Trade
- Sub Trade
- Closed Date
- Actual Progress
- Closure Status

canEditResponsibility = true:
- Subcontractor
- Sub-Sub
- HDEC PIC
```

`raw_payload`에서만 가져오는 표시 전용 항목은 우선 read-only로 표시합니다.

```text
Work Type
Captured on
Start Date
Finish Date
Actual Start Date
Actual Finish Date
Planned Progress
Difference
```

단, `Work Type`은 기존 `trade_detail` 또는 `defect_type` fallback을 사용하므로, 현재 저장 가능한 필드가 확인되는 범위에서는 `trade_detail` 중심으로 관리 가능하게 연결할 수 있습니다.

## 6. 기존 Description / Remarks 유지

요청하신 카드 구성 아래에 기존 `Description`, `Remarks` textarea는 유지하되, 새 field grid 아래쪽에 full-width로 배치합니다.

```text
Description
Remarks
```

Raw Payload 카드와 Change History 카드는 기존처럼 아래에 유지합니다.

## 7. 수정 대상 파일

```text
src/pages/DefectDetailPage.tsx
src/lib/defect-utils.ts
```

필요 시 `DefectItem` type에 표시용 optional field를 보강합니다. DB schema 변경은 이번 UI 재구성만으로는 필요 없습니다.

## 8. 검증 항목

```text
1. Detail 카드 제목이 ITEM DETAIL - NO.[issue_no] 형식으로 표시됨
2. 같은 제목 줄에 Closure Status 값이 표시됨
3. Status 표시는 defect_items.status가 아니라 closure_status 값을 사용함
4. 요청한 7개 row 순서대로 3-column layout이 적용됨
5. Subcon Issue No / Source가 첫 줄에 표시됨
6. Work Type이 raw_payload 또는 trade_detail/defect_type fallback으로 표시됨
7. Start / Finish 계열 값이 import raw_payload에서 alias 기반으로 표시됨
8. Actual Start / Actual Finish 계열 값이 raw_payload에서 alias 기반으로 표시됨
9. Planned Progress / Actual Progress / Difference가 표시됨
10. 기존 edit 권한, Save, change log, schedule audit 동작이 유지됨
11. Raw Payload와 Change History 카드가 기존처럼 유지됨
12. 모바일에서는 1-column으로 깨지지 않고 표시됨
```
