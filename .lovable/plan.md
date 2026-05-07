# Document Executive Dashboard — 개정안

사용자 피드백 반영:
- ❌ Plan vs Actual 테이블 / S-Curve 제거
- ✅ Overdue 상세 항목 리스트가 핵심
- ✅ 각 stage별 "총 N건 중 M건 완료" 진도 표시

기존 `dashboard-utils.isOverdue` / `isAtRisk` / `useAtRiskThreshold`는 그대로 재사용 (계산 일관성 유지).

## 1. 라우팅
기존 `/docs/dashboard` 페이지를 신규 **Document Executive Dashboard**로 전면 교체. 사이드바 "Docs Management" 메뉴 구조 유지 (Dashboard / ABD / OMM / Spare Part / Warranty / Import / Export).

## 2. Stage Normalization
신규 헬퍼 `src/lib/docs-stage-records.ts`: 각 문서 행을 stage-record 배열로 펼쳐 모든 모듈에 공통 로직 적용.

```ts
interface DocsStageRecord {
  item_id: string;
  document_type: 'abd' | 'omm' | 'warranty';
  document_no: string;
  title: string;
  category / trade / team / subcontractor / hdec_pic / hdec_eng;
  current_stage: string;       // 행 단위 현재 stage
  stage_key: string;           // ex sub1_submission
  stage_label: string;
  planned_date / actual_date;
  is_done / is_overdue / is_at_risk / delay_days;
}
```

Stage 매핑:
- **ABD (7)**: sub1_sub, sub1_review, sub2_sub, sub2_review, sub3_sub, sub3_review, approval
- **OMM (5)**: draft_sub, draft_review, final_sub, final_review, completed
- **Warranty (5)**: acra, draft, subcon_sign, hdec_sign, final (`classifyWarrantyStageState` 재사용)

## 3. 페이지 구성

### 3-1. Header
- 타이틀 "Document Executive Dashboard"
- Data Date / MC D-Day
- 필터: Document Type / Trade / Team / Subcontractor / HDEC PIC / HDEC ENG / Current Stage / **Overdue Only** / **At-Risk Only**
- Export to Excel

### 3-2. Top KPI Cards (6개)
Total / Completed / Remaining / Progress % / **Overdue** / **At-Risk** — `DefectKpiCard` 재사용.

### 3-3. Document Type Summary Cards (3개)
ABD / OMM / Warranty 각각: Total · Completed · Remaining · Progress % · Overdue · At-Risk. 클릭 → Doc Type 필터 적용.

### 3-4. Stage Progress Strip ★ (사용자 핵심 요구)
**각 stage별 카드 — "총 N건 중 M건 완료" + 진도 바 + Overdue 배지**

- All Documents 뷰: 모듈별 grouped 카드 (ABD/OMM/Warranty)
- 모듈 선택 뷰: 해당 모듈 모든 stage 카드
  - 예) ABD 뷰 → 1st Sub `120/150 (80%)`, 1st Review `100/150 (67%)`, 2nd Sub `60/120 (50%)` … Approved `45/150 (30%)`
  - 각 카드: Total Applicable / Done / Remaining / Progress % / **Overdue stage count** (빨강 배지)
  - 카드 클릭 → 하단 Action List가 해당 stage로 필터

`DefectStageProgress` 패턴 재사용.

### 3-5. Large Alert Cards (4개)
1. **DOCUMENT OVERDUE** — overdue stage ≥1개 보유 unique 문서 수 (빨강)
2. **TOTAL STAGE OVERDUE** — overdue stage occurrence 합계 (빨강)
3. **DOCUMENT AT RISK** — at-risk stage 보유 문서 수 (앰버)
4. **TOTAL STAGE AT RISK** — at-risk occurrence 합계 (앰버)

각 카드 "View" → Action List 자동 필터.

### 3-6. ★ Overdue Detail List (핵심 신규 섹션)
대시보드의 메인 콘텐츠. T&C/Defect 대시보드에는 없는 SHAW Docs 전용 강조.

**컬럼**: Doc Type / Doc No / Title / Trade / Team / Subcontractor / HDEC PIC / HDEC ENG / **Current Stage** / **Overdue Stage(s)** / Planned / Actual(공란) / **Delay Days** (정렬 기본) / Risk / Remarks

**기본 정렬**: Delay Days desc → 가장 심각한 지연부터.
**서브 탭**:
1. Document-level Overdue (행 1개 = 문서 1개, 가장 심한 지연 stage 표시)
2. Stage-level Overdue (행 1개 = stage 1개, 모든 overdue stage 노출)
3. At-Risk (단계 ≤ atRiskDays threshold)

**기능**: Search / Sort / Stage 필터 / Doc Type 필터 / Excel Export / 행 클릭 → Detail 페이지(기존 라우트).

### 3-7. Charts (간소화 — 3개)
1. **Stage Progress by Module** — 모듈별 stage 진도 horizontal bar (각 stage별 % 표시)
2. **Overdue by Responsible Party** — horizontal bar, 토글 (HDEC PIC / Subcontractor / HDEC ENG / Team)
3. **Aging Analysis** — overdue stage의 Aging bucket (0–3 / 4–7 / 8–14 / 15–30 / 30+)

(트렌드/S-Curve는 별도 모듈 페이지로 미루고 Executive Dashboard에서는 제외)

### 3-8. Warranty Comments Spotlight (직전 요구 유지)
3분할 카드:
1. Recent Comments (7일)
2. Important / Pinned (`type IN ('issue','blocker')`)
3. Unanswered Threads (>3일)
→ 클릭 시 Detail 페이지 코멘트 탭 점프.

### 3-9. Data Quality Cards
컴팩트 경고 배지: Missing Planned / Actual on Completed / Subcontractor / HDEC PIC / HDEC ENG / Status / Transmittal No(ABD) / Warranty Years(Warranty).

## 4. 재사용 매핑

| 기능 | 재사용 |
|---|---|
| Overdue 판정 | `dashboard-utils.isOverdue` (stage-record 적용) |
| At-Risk 판정 | `dashboard-utils.isAtRisk` + `useAtRiskThreshold` |
| KPI Card | `DefectKpiCard` |
| Stage Progress 카드 | `DefectStageProgress` 패턴 |
| Aging | Defect Dashboard의 aging 계산 |
| Excel | `docs-excel-export` 확장 |
| Comments | `WarrantyComments` / `OmmComments` / `comment-threads` |

## 5. 작업 순서

1. `docs-stage-records.ts` (normalization + 단위 테스트)
2. `DocsExecutiveDashboardPage.tsx` 신규 — 위 섹션 조립
3. Stage Progress 카드, Overdue Detail Table 컴포넌트 추출
4. Charts (recharts 재사용)
5. Excel export 확장
6. `App.tsx` 라우트 교체
7. T&C/Defect Dashboard 회귀 점검

## 6. 확인 사항

1. **Spare Part 모듈 포함 여부?** — Lovable Prompt에는 ABD/OMM/Warranty 3종만 명시. 현 사이드바엔 Spare Part 있음. **3종만 포함(권장) vs 4종 모두?**
2. **Warranty stage**: 첨부 프롬프트는 4단계(Draft/Subcon/HDEC/Final). 실제 스키마는 ACRA 포함 5단계. **5단계 그대로 사용 OK?**
3. **Important Comment 플래그**: Phase 1 = `type IN ('issue','blocker')` 활용 vs 신규 `is_important boolean` 컬럼 추가?

승인 시 위 순서대로 구현합니다.