# Captured By 표 — Cat 합계 불일치 해결

## 문제

상단 Cat. A 카드는 **1,370** 인데, Captured By 표의 Cat. A 컬럼 합계는 **23** 으로 크게 다름.

DB 확인 결과:

| priority | captured_by_name 있음 | captured_by_name 없음 | 합계 |
|---|---:|---:|---:|
| Cat A | 23 | 1,347 | 1,370 |
| Cat B | 28 | 197 | 225 |
| No Cat (priority NULL/기타) | 4,183 + 2 | 446 | 4,631 |
| **합계** | **4,236** | **1,990** | **6,226** |

즉, 표는 `captured_by_name` 이 있는 4,236 건만 사람별 행으로 보여주고, 1,990 건(Unknown)은 숨겨진 `unknown` 버킷에 모이고 있음. 헤더의 "Unknown 1990" 문구가 이를 의미.

By Quantity 컬럼은 하단 녹색 배너에서 *"Unknown excluded: 1990"* 로 카드와 일치를 설명하지만, **By Priority 컬럼에는 같은 설명이 없어 사용자 입장에서 23 vs 1,370 의 모순으로 보임.**

## 해결 방안

상단 Cat 카드 숫자와 표 컬럼 합계가 **직접 일치**하도록, Captured By 표에 `Unknown` 행을 한 줄 추가.

### 변경 사항 (`src/pages/DefectDashboardPage.tsx`)

1. **Unknown 행을 stats 에 포함**
   - `unknown.total > 0` 이면 `name: 'Unknown'` 인 가상 행을 만들어 `rowsWithGroup` 에 합류.
   - 그룹 분류는 `'Other'` 가 아닌 별도 표시(혹은 모든 탭에서 항상 표시되도록 처리).
   - 정렬에 흔들리지 않도록 항상 TOTAL 바로 아래 또는 맨 마지막에 고정 배치.

2. **Unknown 행은 클릭 불가 + 회색 톤**
   - 사람별 행과 시각적으로 구분(이탤릭, muted-foreground).
   - 숫자 셀은 버튼이 아닌 정적 텍스트로 렌더(드릴다운 대상 captured_by 가 없으므로).

3. **검증 배너 갱신**
   - "All totals reconcile with summary cards" 메시지에서 *Unknown excluded* 문구 제거(이제 포함되므로).
   - By Priority 도 동일하게 `priTotal/priCatA/priCatB/priNoCat` 합계가 `kpis.byPriority.*` 와 일치하는지 검증 라인 추가.

4. **헤더 카운트**
   - "16 persons · Unknown 1990" 은 그대로 유지(분류 정보 제공용).

### 영향 범위

- `DefectDashboardPage.tsx` 내 `CapturedByTable` 컴포넌트만 수정.
- 데이터 모델, RLS, Raw Data, 카드 KPI 로직은 변경 없음.

### 결과

표 TOTAL 행이 다음과 같이 카드와 정확히 일치하게 됨:

```text
TOTAL (n=17, incl. Unknown)   6,226   ...   1,370   225   4,631
└─ Unknown                    1,990   ...   1,347   197     446
└─ Penn Theen                 2,334   ...      2     0   2,330
   ...
```
