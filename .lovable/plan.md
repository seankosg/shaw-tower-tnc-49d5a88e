## HDEC's Basis of Cat B — Excel 다운로드 버튼 추가

### 목표
`HDEC's Basis of Cat B` 카드의 가로 막대 차트(우측 패널) 데이터를 한 번의 클릭으로 Excel(.xlsx)로 내려받을 수 있도록 버튼 추가.

### 위치 & UI
- 대상: `src/pages/DefectDashboardPage.tsx`의 Distribution 패널 헤더(라인 633~640).
- 헤더 우측의 `{n} reasons · {total} items` 텍스트 옆에 작은 아이콘 버튼(`Download` 아이콘, `variant="ghost"`, `size="sm"`/`h-7 px-2`) 배치.
- 버튼 tooltip: `Export to Excel`.
- 데이터가 비어있으면 (`sorted.length === 0`) 버튼 미노출 — 기존 "No disputes recorded." 분기에서 이미 처리됨.

### 내보낼 데이터
정렬된 `sorted` 배열(Top N 제한 없이 전체) 기준:

| 열 | 값 |
|---|---|
| Rank | 1부터 순번 |
| Reason | `__EMPTY__` → `Unspecified`, 그 외 원문 |
| Count | 숫자 (number, 천단위 구분은 number-format으로) |
| Percentage | `count/total` (소수, 셀 number-format `0.0%`) |

상단 메타 행: 제목 `HDEC's Basis of Cat B — Distribution`, Exported timestamp + user, Total items, Reasons count. (기존 `docs-excel-export.ts`의 메타 헤더 스타일과 동일 패턴.)

### 기술 구현
- 새 파일: `src/lib/defect-cat-b-reason-export.ts`
  - export function `exportHdecCatBReasons(reasons: Array<[string, number]>, meta: { userName: string; userType: string })`
  - `xlsx-js-style` + `src/lib/excel-export.ts`의 공유 스타일(`STYLE_TITLE`, `STYLE_HEADER`, `STYLE_DATA`, `setCell`) 재사용.
  - 파일명: `SHAW_HDEC_CatB_Reasons_YYYYMMDD_HHMM.xlsx`.
  - Percentage 셀은 number(0~1) + numFmt `0.0%`.
  - Count 셀은 number + numFmt `#,##0`.
  - 컬럼 너비: Rank 6, Reason 60, Count 12, Percentage 14.
  - Freeze: 헤더 행 아래.
- `DefectDashboardPage.tsx`:
  - `Download` 아이콘 import 추가(이미 lucide 사용 중).
  - `useAuth()` 등에서 현재 user 정보 획득 — 기존 다른 export 호출부와 동일 방식 확인 후 사용. (없으면 빈 문자열 fallback.)
  - 헤더 라인 ~633에 버튼 추가, `onClick`에서 위 함수 호출.

### 범위 외
- 좌측 칩, "Others" 행 그룹화 로직: Excel에는 그룹화 없이 전체 reason을 그대로 행으로 출력 (Excel에서는 정렬/필터가 가능하므로 Top N 제한 불필요).
- Banner 1, Category Classification & Dispute, 다른 섹션 변경 없음.
- 집계 로직 변경 없음.
