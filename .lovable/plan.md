## 변경 대상
리포트 PPT 11번 슬라이드(`buildDocsSnapshot`, `src/lib/ppt-builder.ts`)의 **OMM 카드**.

## 현재 상태
OMM 카드는 2개 바차트만 표시:
- Submitted (Sub2) — `sub2_actual_date` 보유 비율
- Under Review — `under_review` 상태 비율

## 목표
기존 2개 바를 제거하고, 다음 3개의 바차트로 교체. 표현(라벨 + 값 + 가로 바)은 다른 모듈(ABD/Warranty/Spare Parts) 카드와 동일한 `kpiRow` + `barRow` 방식 그대로 유지.

| # | 라벨 | 분자 | 분모 | 컬럼 |
|---|------|------|------|------|
| 1 | Final Submission | `final_actual_date` 값 있는 행 수 | 전체 OMM 행 수 | `final_actual_date` |
| 2 | Final Response | `final_response_actual_date` 값 있는 행 수 | 전체 OMM 행 수 | `final_response_actual_date` |
| 3 | Final Status A | `final_response_status === 'A'` 행 수 | 전체 OMM 행 수 | `final_response_status` |

> 참고: `docs_omm` 테이블에는 `final_status` 컬럼이 없고 OMM의 최종 승인 상태는 `final_response_status`에 들어있어 그것을 'Final Status'로 사용합니다. 만약 다른 컬럼을 의도하셨다면 알려주세요.

## 구현 변경

### 1) `src/lib/report-builder.ts`
- `OmmRow` 인터페이스에 `final_response_status: string | null` 추가.
- `fetchAll<OmmRow>('docs_omm', ...)`의 select 컬럼에 `final_response_status` 추가.
- 일반 `mk()` 로직(존재 여부 기준 %)을 그대로 사용하되, OMM 한정으로 `final_response_status === 'A'` 카운트를 별도 계산해 `currentPcts['final_response_status_a']`와 `currentCounts['final_response_status_a']`에 주입.
  - 기존 `currentPcts['final_actual_date']`, `currentPcts['final_response_actual_date']`는 이미 계산되어 있으므로 그대로 사용.

### 2) `src/lib/ppt-builder.ts` (SLIDE 11, OMM 모듈)
- 기존 `ommUr`, `ommSub`, `ommUrPct` 산출 제거.
- 새 변수:
  ```ts
  const ommFinalSub = docsKPI.omm.pcts['final_actual_date']           ?? 0;
  const ommFinalRes = docsKPI.omm.pcts['final_response_actual_date']  ?? 0;
  const ommFinalA   = docsKPI.omm.pcts['final_response_status_a']     ?? 0;
  ```
- `modules` 배열의 OMM 항목 `rows`를 다음 3행으로 교체:
  ```ts
  { label: 'Final Submission', val: ommFinalSub.toFixed(1), unit: '%', color: C.cyan,          isPct: true, pct: ommFinalSub },
  { label: 'Final Response',   val: ommFinalRes.toFixed(1), unit: '%', color: C.stageOfficial, isPct: true, pct: ommFinalRes },
  { label: 'Final Status A',   val: ommFinalA.toFixed(1),   unit: '%', color: ommFinalA < 50 ? C.amber : C.green, isPct: true, pct: ommFinalA },
  ```
- `headlineDefault`가 `abdUr > 500` 조건이라 OMM 변경과 무관 → 그대로 유지.

## 영향 범위
- 다른 모듈 카드(ABD/Warranty/Spare Parts), 다른 슬라이드, 대시보드 화면은 변경 없음.
- 리포트 본문(`renderDocsMd`)도 변경 없음(기존 출력 그대로).
