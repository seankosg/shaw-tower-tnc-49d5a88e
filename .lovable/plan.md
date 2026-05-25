## 목표
2번 슬라이드(Dashboard)의 Close Out Document 카드에 있는 OMM 바차트를 기존 'OMM Draft Submitted(sub2_actual_date)'에서 'OMM Final Submission(final_actual_date)' 기준으로 변경합니다.

## 변경 대상 파일
`src/lib/ppt-builder.ts` — `buildDashboard` 함수 내 Close Out Document 카드 영역 (L435~456)

## 변경 내용
1. **L438** — 데이터 소스 변경
   - 기존: `const ommSubPct = docsKPI.omm.pcts['sub2_actual_date'] ?? 0;`
   - 변경: `const ommSubPct = docsKPI.omm.pcts['final_actual_date'] ?? 0;`

2. **L452** — 라벨 변경
   - 기존: `{ label: 'OMM Draft Submitted', pct: ommSubPct, color: C.stageOfficialLight }`
   - 변경: `{ label: 'OMM Final Submission', pct: ommSubPct, color: C.stageOfficialLight }`

## 영향 범위
- `report-builder.ts`는 이미 `final_actual_date`에 대한 데이터(`currentPcts['final_actual_date']`)를 계산하고 있으므로 추가 변경이 필요 없습니다.
- 11번 슬라이드(OMM 진도율)는 영향받지 않습니다.
- 기존 변수명 `ommSubPct`은 유지하되, 실제 의미는 Final Submission 기준으로 변경됩니다.

## 기술적 세부사항
- `void ommUrPct;` (L456)는 기존처럼 그대로 유지됩니다.
- 색상 `C.stageOfficialLight`은 유지됩니다.
- 카드 헤더의 총 개수 표시(OMM ${docsKPI.omm.total})는 그대로 유지됩니다.