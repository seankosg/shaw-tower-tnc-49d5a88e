# Import Row Logs 표시 누락 수정

## 문제 진단

방금 import한 `Aconex Registration Defects_280426_830AM.xlsx` (batch `1dc32f31...`) 의 실제 DB 상태:

| action_taken | reason_code | count |
|---|---|---|
| skipped | no_changes | **1,721** |
| updated | planned_pct_not_started | 1,356 |
| updated | planned_pct_not_computable | 1,328 |
| updated | missing_planned_dates | 1,327 |
| updated | (null) | 1,013 |
| updated | unclassified_defect | 315 |
| updated | discipline_fallback | 109 |
| inserted | (null) | 207 |
| inserted | team_unresolved | 1 |
| **합계** | | **6,877 행** |

**즉, skipped 1,721건은 DB에 정확히 저장되어 있습니다.** Import History 카운트도 정확합니다.

화면에 안 보이는 이유는 단순합니다:
- `DefectImportLogsPage.tsx` line 185 의 쿼리가 `.limit(500)` 으로 잘려 있음
- 정렬이 `raw_row_no` 오름차순인데, 한 raw row가 여러 reason_code 로그를 만들어내므로 앞쪽 500건은 모두 inserted/updated로 채워지고 skipped는 잘려 나감

T&C `ImportLogsPage.tsx` (line 161) 도 동일한 500 limit 문제가 있어 같이 수정합니다.

## 수정 사항

### 1. Row Logs 쿼리에서 500 limit 제거 + 액션/사유 카운트 표시
- `DefectImportLogsPage.tsx`, `ImportLogsPage.tsx` 양쪽 모두
- limit을 제거하고, Supabase 1000 row 기본 한도를 넘는 큰 배치를 위해 1000건씩 페이징해서 모두 가져옴 (range 반복)
- 화면 상단에 action/reason별 요약 카운트(Inserted N · Updated N · Skipped N · Rejected N) 칩을 표시해 합계가 한눈에 일치하는지 확인 가능

### 2. Action 필터 + Reason 필터 + 행번호 검색 UI
Row Logs 탭에 작은 툴바 추가:
- Action 드롭다운: All / inserted / updated / skipped / rejected
- Reason 드롭다운: All / 해당 배치에 실제 등장한 reason_code 목록 (동적)
- Row No 검색 input (raw_row_no 일치)
- 클라이언트 사이드 필터링 (이미 모든 로그를 fetch했으므로 빠름)

### 3. 가상 스크롤 또는 청크 렌더 (성능)
- 6,877행을 그대로 DOM에 그리면 무거우므로 단순한 "Show more (다음 500건)" 버튼 방식으로 점진 렌더 — 현재 코드 스타일과 일관되고 추가 라이브러리 불필요. 필터가 적용되면 필터된 결과 전체를 렌더.

### 4. (선택) Schedule Changes 탭도 동일하게 limit 제거
- 같은 500 limit 문제가 있어 큰 배치에서 일부 row가 잘림. 동일한 페이징 로직 적용.

## 수정 파일
- `src/pages/DefectImportLogsPage.tsx`
- `src/pages/ImportLogsPage.tsx`

## 영향
- 카운트는 변동 없음 (history의 skipped 1721은 이미 정확)
- Row Logs 탭에서 skipped 1721건이 모두 보이게 됨
- 큰 배치도 잘리지 않고 전부 조회 가능
