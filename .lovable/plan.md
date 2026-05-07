## Document Executive Dashboard — 개정안

### 1. 제거 / 변경 사항
- **At-Risk 로직 전면 제거**: KPI 카드, Alert 카드, 탭, `is_at_risk` 분류 로직, `useAtRiskThreshold` 의존 모두 삭제. `DocsStageRecord`에서도 `is_at_risk` 필드 제거.
- **상단 전체 합산 KPI 스트립 제거**: Total / Completed / Remaining / Progress% / Overdue / At-Risk 6장 카드 모두 삭제. (전체 합산은 의미 없음)
- **Warranty Comments Spotlight 등 미구현 섹션은 이번 개정에 포함하지 않음** — 추후 별도 단계.
- **OMM 표기 통일**: 모든 라벨/제목/탭/툴팁에서 "OMM Manuals" → **"Operation & Maintenance Manual"**. 내부 키(`omm`, `MODULE_LABEL.omm`)만 노출 라벨 변경, 라우트는 유지.

### 2. 새로운 페이지 구조

```text
[Header]  Title · Data Date · Export

[Section: As-Built Drawings]
  ┌─ Module Card (Total / Done / Overdue + Progress Bar)
  │     · Total → /docs/abd
  │     · Done  → /docs/abd?status=approved
  │     · Overdue → /docs/abd?overdue=1
  └─ Stage Progress Strip (탭: All Teams | Team A | Team B …)
        7 stage cards (1st Submission … Approved) — 풀 네임
        각 카드: 큰 진도율, M/N, 진도바, Overdue 배지
        클릭 → /docs/abd?stage=<key>(&team=…)

[Section: Operation & Maintenance Manual]
  └─ 동일 패턴 (5 stages) → /docs/omm 연동

[Section: Warranty Deeds]
  └─ 동일 패턴 (5 stages) → /docs/warranty 연동
```

### 3. 섹션(모듈) 카드 사양
각 섹션 최상단에 **하나의 큰 모듈 카드**를 배치. 내부적으로 3개의 클릭 가능한 sub-tile + 진도 바:

| Tile | 값 | 클릭 시 |
|---|---|---|
| Total | 해당 모듈 총 문서 수 | Raw Data (모듈) — 필터 없음 |
| Done | 최종 단계 완료 문서 수 | Raw Data — `status=completed` 쿼리 |
| Overdue | 1개 이상 stage가 overdue인 문서 수 | Raw Data — `overdue=1` 쿼리 |

진도 바 = Done / Total. **Stage Progress Strip과 카드는 연동되지 않음** — 카드는 자기 숫자에 해당하는 Raw Data로만 이동.

### 4. Stage Progress Strip 사양 (핵심 신규)

탭 구성:
- **All Teams** (기본) + DB의 해당 모듈 row에 존재하는 distinct `team` 목록 동적 생성
- 탭 전환 시 해당 섹션의 stage 카드만 재집계 (다른 섹션에 영향 없음)

각 stage 카드:
- 풀 네임 라벨 (예: "1st Submission", "Draft Submission", "Subcontractor Signing", "HDEC Signing" — `*_STAGE_DEFS`의 label 풀어서 사용)
- 큰 진도율 % (대형 폰트)
- M / N (완료/총)
- 가는 진도 바
- Overdue 건수 배지(있을 때만)
- Hover 시 미세한 elevation, 카드 좌측 컬러 액센트(모듈별 hue)
- 클릭 → Raw Data로 이동, 쿼리: `?stage=<stage_key>&team=<탭값>`

UI 톤: 카드 그림자 약하게, rounded-xl, 일관 spacing, 숫자 tabular-nums, 진도바는 모듈 액센트 컬러 사용. Defect 대시보드의 카드 패턴(`DefectKpiCard` / `DefectStageProgress`) 참고하되 더 컴팩트하고 정렬감 있게.

### 5. Raw Data 페이지 연동
ABD/OMM/Warranty Raw Data 페이지(`DocsRawDataPage`, `DocsOMMRawDataPage`, `DocsWarrantyRawDataPage`)에 **URL 쿼리 파라미터 처리**를 추가:
- `?status=completed` → 최종 단계 완료 행만
- `?overdue=1` → 1개 이상 overdue stage가 있는 행만
- `?stage=<key>&team=<team>` → 해당 stage가 미완료(또는 overdue)인 행 + team 필터

Raw Data의 기존 필터 UI에는 칩으로 표시되어 사용자가 해제 가능. (필터 적용 로직은 클라이언트 측, 기존 행 분류 함수 재사용)

### 6. 기술 변경 요약
- `src/lib/docs-stage-records.ts`: `is_at_risk` 필드 + `classifyStage`의 at-risk 분기 제거. 모듈 라벨에서 OMM 풀 네임 사용.
- `src/lib/docs-executive-dashboard-data.ts`: `atRiskDays` 인자 제거.
- `src/pages/docs/DocsExecutiveDashboardPage.tsx`: 전면 재구성 — 상단 KPI/Alert 제거, 섹션 단위 레이아웃(모듈 카드 + 팀 탭 + Stage Strip × 3).
- 신규 컴포넌트:
  - `src/components/docs/DocsModuleSummaryCard.tsx` (Total/Done/Overdue + 진도바, 클릭 시 Raw Data 이동)
  - `src/components/docs/DocsStageProgressStrip.tsx` (팀 탭 + stage 카드 그리드, 클릭 시 Raw Data 이동)
- Raw Data 페이지 3종에 `useSearchParams` 기반 초기 필터 적용 + 칩 표시.

### 7. 보존
- 라우팅 (`/docs/dashboard`), 데이터 fetch 함수, ABD/OMM/Warranty 분류 로직(overdue 판정), 디자인 시스템 토큰 모두 유지.
- Overdue Detail List(3-탭 테이블)는 유지할지 여부 — **이번 개정에서는 카드의 Overdue → Raw Data 연동으로 충분하므로 제거 권장**. (확인 필요 시 구현 중 결정 가능, 기본은 제거)
