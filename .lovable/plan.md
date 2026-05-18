## 가능 여부: 가능합니다

ABD/OMM의 스테이지 키가 이미 `*_submission`(우리 제출)과 `*_review` / `*_response` / `*_approval`(상대 응답) 두 그룹으로 명확히 나뉘어 있어 분리 집계가 가능합니다.

`src/lib/docs-stage-records.ts` line 57-75:
- ABD: `sub1_submission`, `sub1_review`, `sub2_submission`, `sub2_review`, `sub3_submission`, `sub3_review`, `approved`
- OMM: `sub1_submission`, `sub1_review(Status)`, `sub2_submission`, `sub2_response`, … , `final_submission`, `final_approval`

`summariseByItem()`(line 564)에서 각 stage record를 순회하며 `is_overdue`를 합산할 때 stage_key suffix로 둘을 분리할 수 있습니다.

---

## 변경 계획

### 1. 데이터 모델 확장
`src/lib/docs-stage-records.ts`
- `ItemSummary`에 필드 2개 추가:
  - `is_overdue_submission: boolean` — 우리 제출 지연 (`*_submission` 스테이지 overdue)
  - `is_overdue_response: boolean` — 상대 응답 지연 (`*_review` / `*_response` / `*_approval` / `approved` 스테이지 overdue)
- `summariseByItem()` 내부 line 588-592: stage_key 끝이 `_submission`이면 submission 버킷, 그 외(`_review`, `_response`, `_approval`, `approved`)는 response 버킷으로 분기 합산.
- 기존 `is_overdue`(전체 합)는 호환을 위해 그대로 유지.

(Warranty / Spare Part는 제출-응답 개념이 없으므로 전체를 submission 측으로 보거나 분리 없이 기존 `is_overdue`만 사용 — UI에서도 ABD/OMM에서만 분리 표시.)

### 2. UI 변경 (ABD / OMM 한정)
`src/pages/docs/DocsExecutiveDashboardPage.tsx`
- 기존 단일 `Overdue` SummaryTile(line ~407 부근)을 **Overdue — Submission** / **Overdue — Response** 두 개의 타일로 교체.
  - 값: `filteredItems.filter(i => i.is_overdue_submission).length` / `i.is_overdue_response`
  - 아이콘/톤은 기존 Overdue 톤(red) 동일, 두 번째는 amber로 차등 가능.
- Warranty / Spare Part 모듈은 기존 단일 Overdue 카드 유지.
- KPI 그리드 컬럼 수 영향 검토 — 카드가 1→2개 늘어나므로 그리드 `grid-cols-*` 조정 필요(예: 6열 → 7열 또는 줄바꿈 허용).

### 3. 영향 범위
- 라우팅: Overdue 타일 클릭 시 Raw Data 이동 쿼리에 `overdueType=submission|response` 추가 가능 (선택 — 별도 요청 시 진행)
- DB / Edge Function / PPT 리포트 / 다른 페이지 변경 없음

### 기술 메모
- 분기 기준 함수 예:
  ```ts
  const isResponseStage = (k: string) =>
    /_review$|_response$|_approval$|\.approved$/.test(k);
  ```
- `summariseByItem`만 수정하면 다른 곳(필터/리포트)에서 추가 정보 자동 활용 가능.
