# OMM: Field Config를 단일 기준(SoT)으로 정렬

## 원칙

**Field Config (`docs_field_config` where `sub_module='omm'`)가 단일 진실(Source of Truth)** 입니다.
- 누락 필드 없음 — Raw Data에 표시되는 모든 데이터 컬럼이 Field Config에 등록됨
- Raw Data의 **컬럼 순서**는 Field Config의 `sort_order`를 따름
- Raw Data의 **노출/숨김**은 Field Config의 `is_enabled`를 따름 (시스템 anchor 제외)
- Raw Data의 **헤더 라벨**은 Field Config의 `display_name`을 따름
- (참고: ABD `DocsRawDataPage.tsx` 가 이미 동일 패턴으로 동작 중 — OMM만 미적용)

## 현재 불일치 (재정리)

Raw Data에는 있으나 Field Config에 누락 → **누락 보충 필요**
- `cycle_progress` (Cycle 진행률 표시 컬럼)
- `team` (분류 컬럼, 멀티선택 필터, 벌크 액션, 검색, 컬럼 메뉴 모두에서 사용 중)

Field Config에는 있으나 Raw Data 컬럼 정의에서 누락 → **Raw Data에 컬럼 추가**
- `current_stage` (Stage) — 현재 `OMMRow` 인터페이스/필터 옵션엔 있지만 컬럼으로는 미정의

## 작업

### 1) DB 마이그레이션 — `docs_field_config` (sub_module='omm') 보강

A. 누락 필드 INSERT
- `cycle_progress` — display "Progress", `is_enabled=true`, `is_required=false`, `source_origin='system'`, `sort_order=5`
- `team` — display "Team", `is_enabled=true`, `is_required=false`, `source_origin='system'`, `sort_order=25`

B. 기존 행 sort_order 재정렬 (Raw Data 의도 순서에 맞춰 5/10/20/25/30/...)
- 5 cycle_progress · 10 sn · 20 category_group · 25 team · 30 category · 40 section · 50 work_trade_material · 60 subcontractor_name · 70 hdec_pic_name · 80 hdec_eng_name · 90 training_required · 100 instruction_date · 110 pdf_required_qty · 120 pdf_actual_qty · 130 hardcopy_required_qty · 140 hardcopy_actual_qty · 150 draft_planned_date · 160 draft_actual_date · 170 draft_response_date · 180 draft_response_status · 190 final_planned_date · 200 final_actual_date · 210 final_response_planned_date · 220 final_response_actual_date · 230 final_response_status · 240 current_stage · 250 current_status · 260 remarks
- (※ 사용자가 Field Config UI에서 자유롭게 재정렬할 수 있고 — 이는 초기값일 뿐)

C. `current_stage` 행은 유지하되 기본 `is_enabled=false` 로 설정 (현재 OMM Status가 `current_status` 단일 컬럼으로 표시되고 있어 기본 숨김이 적절). 사용자가 원하면 Field Config에서 켤 수 있음.

### 2) 코드 — `src/pages/docs/DocsOMMRawDataPage.tsx`

**변경 핵심: 하드코딩된 `COLUMN_ORDER` 제거 → ABD와 동일하게 Field Config 기반으로 동적 생성**

a. `useDocsFieldConfig('omm')` 호출 시 `sortFieldNames` 도 함께 구조분해 (이미 hook에서 export 중)

b. **데이터 필드 목록을 상수로 분리** (시스템/anchor 제외 — 데이터 컬럼만):
   ```ts
   const OMM_DATA_FIELDS = [
     'sn','category_group','category','team','section','work_trade_material',
     'subcontractor_name','hdec_pic_name','hdec_eng_name','training_required',
     'instruction_date','pdf_required_qty','pdf_actual_qty',
     'hardcopy_required_qty','hardcopy_actual_qty',
     'draft_planned_date','draft_actual_date','draft_response_date','draft_response_status',
     'final_planned_date','final_actual_date',
     'final_response_planned_date','final_response_actual_date','final_response_status',
     'current_stage','remarks',
   ] as const;
   ```

c. `columnOrder` 를 ABD 패턴으로 교체:
   ```ts
   const columnOrder = useMemo(() => {
     const PINNED = ['__select', 'cycle_progress', 'sn'];
     const TRAILING = ['current_status', '__open']; // status badge & open button 항상 끝
     const remaining = OMM_DATA_FIELDS.filter(f => !PINNED.includes(f) && !TRAILING.includes(f));
     return [...PINNED, ...sortFieldNames(remaining), ...TRAILING];
   }, [sortFieldNames]);
   ```

d. `columnVisibility` 단순화 — `ALWAYS_VISIBLE`(`__select`,`__open`,`sn`,`cycle_progress`,`current_status`,`pdf_actual_qty`,`hardcopy_actual_qty`) 외 모든 데이터 필드는 `isFieldVisible(field)` 따름. (기존 `COLUMN_ORDER` 순회 → `OMM_DATA_FIELDS` 순회로 대체)

e. **하드코딩 `COLUMN_ORDER` 배열 삭제**.

f. `current_stage` 컬럼 정의 추가 — `dataColumns` 생성 루프가 `OMM_DATA_FIELDS` 를 돌면 자동 생성됨. 셀은 `<span>{value ?? '—'}</span>` 단순 표시 (필터: multi-select, 옵션은 기존 `optionFields.current_stage` 사용).

g. `MULTI_SELECT_FIELDS` / `TEXT_FIELDS` / `DATE_FIELDS` / `NUMBER_FIELDS` 세트는 그대로 유지 (필터 타입 결정용 — 컬럼 순서/노출과 무관).

### 3) 검증

- Admin → Field Config → Docs / OMM 화면에서 행 수가 **27개**가 됨 (이전 26 + `cycle_progress` + `team` − `current_stage 제외아님,재정렬만`).
- Field Config에서 임의 행을 비활성(`is_enabled=false`)으로 토글 → Raw Data에서 즉시 숨김 (anchor 제외).
- Field Config에서 `sort_order` 변경 → Raw Data 컬럼 순서가 즉시 바뀜.
- Field Config에서 `display_name` 변경 → Raw Data 헤더가 즉시 바뀜.
- 실시간 채널(`docs-field-config-omm`) 이미 구독 중 → 새로고침 불필요.
- ABD/Raw Data와의 동작 일관성 확보.

## 영향/리스크

- **데이터 손실 없음** — INSERT 2건 + UPDATE(sort_order) 만.
- **사용자 시각적 변화 거의 없음** — 초기 sort_order를 현재 Raw Data 화면 순서와 동일하게 설정.
- 추가로 노출되는 신규 컬럼: `current_stage` (단, `is_enabled=false`로 기본 숨김 → 실제 화면 변화 없음).
- ABD와 동일 패턴이라 유지보수성 향상.

## 변경 파일

- 신규 마이그레이션 1건 (`docs_field_config` OMM 행 추가/정렬/`current_stage` 기본 disabled)
- `src/pages/docs/DocsOMMRawDataPage.tsx` (`COLUMN_ORDER` 제거, Field Config 기반 동적 ordering, `current_stage` 컬럼 정의 추가)
- `src/hooks/useDocsFieldConfig.ts` 의 `DOCS_DEFAULT_FIELD_LABELS` 에 `team` 라벨 보강 (이미 `cycle_progress`/`current_stage` 는 있는지 확인 후 보충)
