# Warranty Deeds Stage Card → Raw Data 필터 정합성 수정

## 문제 진단
대시보드 Stage Progress 카드에서 (예: Subcon Sign 카드 클릭) → `/docs/warranty?stage=warranty.subcon_sign[&overdue=1]` URL로 이동하지만 Raw Data 테이블이 비어 보임.

데이터 확인 (`warranty_items`, is_active=true, 152행):
- Subcon Sign 스테이지가 overdue인 row: **53건**
- 대시보드 OD 칩 카운트와 일치

즉 카드 카운트는 53인데 Raw Data가 0건으로 보이는 정합성 깨짐. 원인은 `computeDashboardFilteredIds`의 stage / overdue 필터 의미가 카드 카운트 의미와 다르기 때문.

## 근본 원인

`src/lib/docs-dashboard-filter.ts`의 현재 로직:

```ts
if (params.overdue === '1') {
  // any-stage overdue (어떤 스테이지든 overdue면 통과)
  if (!recs.some(r => r.is_overdue)) continue;
}
if (params.stage) {
  const stageRec = recs.find(r => r.stage_key === params.stage);
  if (!stageRec || stageRec.is_done) continue;  // 해당 스테이지가 미완료
}
```

- 대시보드 OD 칩 카운트의 의미: **해당 스테이지가 overdue인 item 수** (= `computeStageProgress`의 `s.overdue`, stage-specific)
- 현재 raw 페이지 필터 의미: **(아무 스테이지나 overdue) AND (해당 스테이지가 미완료)** — stage-specific overdue가 아님

또한 두 조건이 ‘과거 actual_date가 없고 planned가 지났으나 status가 'A'/`Done`인 경우’ 등 enum 처리 분기가 어긋나 결과 row 수가 카드와 다르게 0이 되는 케이스 발생.

## 변경 사항

### `src/lib/docs-dashboard-filter.ts`

`stage`와 `overdue=1`이 동시에 지정된 경우 의미를 **‘해당 stage가 overdue인 item’**으로 통일.

```ts
if (params.stage) {
  const stageRec = recs.find(r => r.stage_key === params.stage);
  if (!stageRec) continue;

  if (params.overdue === '1') {
    // stage-specific overdue (대시보드 OD 칩과 동일 의미)
    if (!stageRec.is_overdue) continue;
  } else {
    // stage-specific pending (카드 본문 클릭 = 모든 미완료 item)
    if (stageRec.is_done) continue;
  }
}

// stage가 없고 overdue=1만 있을 때: 기존 any-stage overdue 의미 유지
if (!params.stage && params.overdue === '1') {
  if (module === 'spare_part') { /* 기존 spare_part 로직 그대로 */ }
  else if (!recs.some(r => r.is_overdue)) continue;
}
```

### 영향 범위
- 파일: `src/lib/docs-dashboard-filter.ts` (1개 파일)
- 영향 모듈: ABD / OMM / Warranty / Spare Part 모두 — 모든 모듈의 Stage Card 클릭 일관성 향상
- 기존 “overdue 단독” 필터(`?overdue=1`)는 그대로 any-stage overdue 의미 유지 → Portfolio 레벨 KPI 동작 무손상
- Spare Part는 stage 파라미터를 거의 안 쓰므로 사실상 변화 없음

### 검증
- `/docs/warranty?stage=warranty.subcon_sign&overdue=1` → 53행 표시되어야 함
- `/docs/warranty?stage=warranty.subcon_sign` (카드 본문) → 미완료 109행 표시
- 다른 모듈 stage 카드 OD 칩 동작 동일하게 stage-specific overdue로 표시
