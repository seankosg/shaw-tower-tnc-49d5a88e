## OMM Stage Progress 카드 UI 개선

### 변경 결과 (5개 카드)

| # | 카드 | 표시 내용 |
|---|------|-----------|
| 1 | **1st Status** | A / B / C / UR / Planned 5개 버킷 카운트 (합 = 전체) |
| 2 | **2nd Submission** | total / done / overdue (기존 형식) |
| 3 | **2nd Response** | total / done / overdue (기존 2nd Review 카드를 Response로 라벨 변경) |
| 4 | **Final Submission** | total / done / overdue |
| 5 | **Final Approval** | total / done / overdue |

삭제: 1st Submission, 3rd Submission, 3rd Review

### 1st Status 버킷 정의

`omm` 행 1건당 1번만 카운트하여 합 = 전체 OMM 행수가 되도록 함:

- **A** — `sub1_response_status === 'A'`
- **B** — `sub1_response_status === 'B'`
- **C** — `sub1_response_status === 'C'`
- **UR** (Under Review) — `sub1_actual_date` 있음 & `sub1_response_status` 비어있음
- **Planned** — `sub1_actual_date` 없음 (아직 제출 전)

### 변경 파일

**1. `src/lib/docs-stage-records.ts`**
- `OMM_STAGE_DEFS`에서 `omm.sub1_submission`, `omm.sub3_submission`, `omm.sub3_review` 제거
- `omm.sub1_review` 라벨을 `1st Status`로 변경 (또는 새 키 `omm.sub1_status` 도입)
- `omm.sub2_review` 라벨을 `2nd Response`로 변경
- `buildOmmStageRecords` 내 stage 배열에서 삭제된 stage 항목 제거 (sub1_submission, sub3_submission, sub3_review)
- 새 헬퍼 `computeOmmSub1StatusBuckets(rows)` 추가 → `{A, B, C, UR, Planned, total}` 반환

**2. `src/pages/docs/DocsExecutiveDashboardPage.tsx`**
- OMM 모듈일 때 Stage Progress 그리드를 분기 처리: 첫 번째 슬롯에 새 `Sub1StatusCard` 컴포넌트(5개 버킷 표시), 나머지는 기존 `StageCard`로 2nd Sub / 2nd Response / Final Sub / Final Approval 4개 렌더
- 그리드 컬럼: 5개로 고정 (`lg:grid-cols-5`)
- 각 버킷 클릭 시 Raw Data로 이동: A/B/C는 `sub1_response_status` 필터, UR은 `status=Sub1 Under Review`, Planned는 `status=Pending Sub1`

**3. 새 컴포넌트 `src/components/docs/OmmSub1StatusCard.tsx`**
- 카드 헤더 "1st Status"
- 5개 미니 칩(A/B/C/UR/Planned) — 각각 카운트 + 클릭 가능
- 색상: A=emerald, B=rose, C=amber, UR=blue, Planned=muted
- 합계가 total과 일치하는지 검증 (불일치 시 dev 모드 console.warn)

### 영향 범위

- ABD/Warranty 모듈은 영향 없음 (OMM 분기 처리)
- `summariseByItem`의 `lastKey` 로직은 OMM_STAGE_DEFS 마지막(`final_approval`) 그대로 유지 → 완료 판정 변동 없음
- OmmCycleProgress 컴포넌트는 별개(행 단위 pip)로 변경 없음
