## 목표

ABD 대시보드 Stage Progress를 **`computeOverallStatus`(SSOT)** 기반의 **상호배타 3대 버킷 + Submission Required 내 3개 서브카드**로 재구성. 합계 = `is_active=true` 도면 총수(3,791)와 일치.

## 버킷 구조

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ABD Stage Distribution                              Total: 3,791     │
├──────────────┬───────────────┬───────────────────────────────────────┤
│  Approved    │ Under Review  │ Submission Required                   │
│    258       │    1,630      │    1,903                              │
│   6.8%       │   43.0%       │   50.2%                               │
│              │               │ ┌─────────┬─────────┬─────────┐       │
│              │               │ │ 1st     │ 2nd     │ 3rd     │       │
│              │               │ │ 1,889   │   14    │    0    │       │
│              │               │ └─────────┴─────────┴─────────┘       │
└──────────────┴───────────────┴───────────────────────────────────────┘
```

## 버킷 정의 (Raw Data Current Status SSOT)

| 카드 | 정의 | 데이터 |
|---|---|---|
| **Approved** | sub1/2/3 어느 cycle이든 approval_status='A' | 258 |
| **Under Review** | (Approved 아님) 가장 최근 제출 후 응답 대기 — 1차+2차+3차 합산 | 1,630 |
| **Submission Required (총)** | (Approved/UR 아님) 제출 필요한 상태 합산 | 1,903 |
| └ 1st | sub1 미제출 | 1,889 |
| └ 2nd | sub1=B/C, sub2 미제출 | 14 |
| └ 3rd | sub2=B/C, sub3 미제출 | 0 |

검증: 258 + 1,630 + 1,903 = **3,791** ✓ / 1,889 + 14 + 0 = 1,903 ✓

## 변경 사항

### 1. `src/lib/docs-stage-records.ts`
- 새 함수 `computeAbdBucketDistribution(rows, dataDate)` 추가
  - `is_active=true` 도면만 대상
  - `computeOverallStatus` + `computeNextActiveCycle` (`docs-status.ts`) 사용 → SSOT
  - 반환:
    ```ts
    {
      total: number,
      approved: number,
      under_review: number,
      submission_required: { total: number, sub1: number, sub2: number, sub3: number }
    }
    ```
- 기존 `computeStageProgress`(7-stage milestone)는 유지

### 2. `src/components/docs/DocsModuleFocusCard.tsx` (또는 신규 컴포넌트)
- ABD 모듈 카드의 Stage Progress 섹션을 위 3-버킷 + 3-서브카드 레이아웃으로 교체
- 메인 카드 3개: Approved / Under Review / Submission Required(합산)
- Submission Required 카드 내부 우측/하단에 작은 1st·2nd·3rd 서브카드
- 각 카드/서브카드 클릭 시 Raw Data로 이동:
  - Approved → `?status=A`
  - Under Review → `?status=Under Review`
  - Submission Required (총) → `?stage=submission_required`
  - 1st/2nd/3rd → `?stage=1st_submission` / `2nd_submission` / `3rd_submission`

### 3. `src/pages/docs/DocsRawDataPage.tsx`
- URL `stage` 파라미터 매핑 확장:
  - `submission_required` → overall_status ∈ {Planned, S.Delayed, WIP, B, C} & 다음 미제출 cycle 존재
  - `1st_submission` → sub1 미제출
  - `2nd_submission` → sub1=B/C & sub2 미제출
  - `3rd_submission` → sub2=B/C & sub3 미제출
- `DOCS_DRILLDOWN_PARAMS`에 `stage` 이미 포함 (변경 없음)

## 범위 외
- OMM, Warranty, Spare Part 카드 (별도 작업)
- KPI strip / Attention / Submission Trend 섹션 변경 없음
