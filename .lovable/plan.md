## OMM Cycle 아이콘 4핍 재설계 (1R / 2R / 3R / FR)

`src/components/docs/OmmCycleProgress.tsx` 단일 파일 수정. 비즈니스 로직(`docs-omm-status.ts`)은 변경하지 않습니다.

### 1. 핍 구조 — 8개 → 4개

```
[1R] — [2R] — [3R] — [FR]
```

각 핍은 해당 cycle의 **전체 진행 상태**를 하나로 표현. Submission 진행 중이든 Response 대기 중이든 active.

### 2. 핍 상태 산출 (cycle별)

`computeOmmStatus(row)` 결과로 active cycle 인덱스 결정:
- `Pending Sub1` / `Sub1 Under Review` → active = 0 (1R)
- `Pending Sub2` / `Sub2 Under Review` → active = 1 (2R)
- `Pending Sub3` / `Sub3 Under Review` → active = 2 (3R)
- `Pending Final` / `Final Under Review` → active = 3 (FR)
- `Approved` → 모두 closed
- `Rejected` → 모두 rejected (4핍 전부 빨강)

핍별 state 결정:
- `closed` (Approved): 모든 핍 녹색 ✓
- `rejected` (Rejected): 모든 핍 빨강 ✕
- `done`: i < activeIdx **AND** 해당 cycle response_status === 'A' 또는 활성 cycle에 도달했음
- `skipped`: i < activeIdx 이고 해당 cycle을 건너뛴 경우 (예: Sub1 = A → Pending Final이면 1R는 done(녹색 ✓), 2R/3R은 skipped(회색 점선 –))
- `active`: i === activeIdx (amber)
- `pending`: i > activeIdx (연한 회색)

Skipped 판정 로직:
- Sub1 response = 'A' 이고 activeIdx === 3 → 1R = done, 2R/3R = skipped
- Sub2 response = 'A' 이고 activeIdx === 3 → 1R/2R = done, 3R = skipped
- Sub3 response = 'A' 이고 activeIdx === 3 → 1R/2R/3R = done

Done 마킹: i < activeIdx 인 cycle 중 response_status === 'A' 인 것만 done. 그 외(B/C로 다음 cycle 진입)는 done이지만 시각적으론 동일 녹색 ✓ 유지 (단계 통과 자체는 완료).

### 3. 핍 글리프 / 색상

| State    | Glyph | 색상                                    |
|----------|-------|-----------------------------------------|
| done     | ✓     | bg-emerald-500 / 흰글씨                 |
| active   | •     | bg-amber-500 / 흰글씨                   |
| skipped  | –     | bg-muted/40 점선 테두리 / muted-foreground |
| pending  | ·     | bg-muted / muted-foreground             |
| closed   | ✓     | bg-emerald-600                          |
| rejected | ✕     | bg-rose-500 / 흰글씨                    |

핍 라벨(글리프)에서 단계 식별 글자(1R/2R 등)는 제거 — 4개로 줄었으므로 위치만으로 식별 가능. (필요 시 sr-only 라벨로 접근성 확보)

### 4. Tooltip 상세화

각 핍 hover 시 (또는 컨테이너 hover) 4개 cycle 모두 표시:

```
Status: Pending Sub2

Cycle 1 (Sub1)         [✓ A]
  Submit: 12-Mar / 12-Mar
  Review: 15-Mar / 14-Mar
Cycle 2 (Sub2)         [• active]
  Submit: 20-Mar / 20-Mar
  Review: 25-Mar / —
Cycle 3 (Sub3)         [· pending]
  Submit: — / —
  Review: — / —
Final                  [· pending]
  Submit: — / —
  Review: — / —
```

Submission: `subN_planned_date` / `subN_actual_date`
Review: `subN_response_planned_date` (sub1은 없음 → omit) / `subN_response_actual_date` + status 뱃지
Final: `final_planned_date` / `final_actual_date`, `final_response_planned_date` / `final_response_actual_date` + status

값 없으면 `—`. Tooltip width `min-w-[280px]`.

### 5. Legend 업데이트

`OmmCycleProgressLegend`에 5개 항목: Done(✓) / Active(•) / Skipped(–) / Pending(·) / Rejected(✕). Approved는 Done 색상과 동일하므로 별도 표시 생략.

### 적용 범위

- 컴포넌트가 사용되는 모든 곳에 자동 반영 (Raw Data Cycle 컬럼, Detail 페이지 등)
- 컴포넌트 props 시그니처는 유지 (`row: OMMStatusInput`)

### 비포함

- `computeOmmStatus` / `computeOmmStage` 등 status 엔진 로직 변경 없음
- DB 스키마, import 파서, 대시보드 카운터, status 뱃지 변경 없음
