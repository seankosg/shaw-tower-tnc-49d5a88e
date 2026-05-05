## OMM Cycle 도넛 5단계 라벨 변경

### 변경 대상
- `src/components/docs/OmmCycleProgress.tsx` 만 수정
- 상태 계산 로직 (`src/lib/docs-omm-status.ts`)은 변경 없음 — 표시 라벨만 매핑

### 5단계 매핑

| 단계 | 현재 글리프 | 새 라벨 (툴팁) | 새 글리프 (도넛 안) | 내부 상태 매핑 |
|---|---|---|---|---|
| 1 | PD | Draft Submission | DS | Pending Draft |
| 2 | DUR | Draft Review | DR | Draft Under Review |
| 3 | PF | Final Submission | FS | Pending Final Submission |
| 4 | FUR | Final Review | FR | Final Under Review |
| 5 | A | Final Status | **S** | Approved |

### 수정 내용 (OmmCycleProgress.tsx)
1. `STAGES` 배열을 새 약어로 변경: `['DS', 'DR', 'FS', 'FR', 'S']`
2. `STAGE_TITLES` 매핑을 새 풀네임으로 교체:
   - DS → "Draft Submission"
   - DR → "Draft Review"
   - FS → "Final Submission"
   - FR → "Final Review"
   - S → "Final Status"
3. `statusToIndex()` 함수는 그대로 (내부 status 값은 변경되지 않음)
4. 도넛 pip 색상/상태 로직(`done`/`active`/`rejected`/`closed`/`pending`) 그대로 유지
5. Rejected 케이스: 현재 활성 단계가 빨간색(✕)으로 표시되는 동작 유지
6. Legend의 "Approved" 글리프도 `A` → `S`로 통일

### 영향 범위
- `OmmCycleProgress`를 사용하는 모든 곳 자동 적용:
  - `DocsOMMRawDataPage` (OMM Raw Data 테이블)
  - `DocsOMMDetailPage` (OMM 상세 페이지)
- `OmmStatusBadge`, `computeOmmStatus`, `OMM_STATUS_COLOR` 등 다른 곳의 상태 표기는 변경 없음 (내부 상태 문자열 유지)

### 범위 외
- ABD `DocsCycleProgress` (Cycle 1/2/3 방식 — 다른 워크플로우)
- Warranty / Spare Part 모듈
- DB 스키마 / 상태 계산 로직 / 가져오기 파서
