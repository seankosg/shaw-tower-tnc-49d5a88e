# DDN Input 자동 채움 (Auto-Fill from Raw Data)

`/ddn/input`에서 **Entry Date**만 선택하면, 기존 raw data 테이블(`subtests`, `defect_items`, `punch_items`, `docs_drawings` 등)에서 해당 일자에 해당하는 값을 자동으로 가져와 폼을 채웁니다. 사용자는 자동값을 확인/덮어쓸 수 있고, 매번 수동 입력해야 하는 항목은 그대로 둡니다.

## 핵심 원칙

- **범위 = Puretech 업무 한정**: 모든 raw 쿼리는 `subcontractor_name = 'Puretech'` (필요 시 `subsub_name` 포함 = Puretech의 sub-sub 22개)로 필터. defect/punch/subtest 전부 동일. 비-Puretech 행은 자동 채움 집계에서 제외.
- **레터 친화 요약**: 자동값은 통보문에 그대로 인용되므로 **짧고 읽기 쉽게**. Subtest ID 나열 ✗, **System 단위로 압축**하고, 같은 시스템의 여러 층은 한 줄로 묶음 (예: `Substation 1 (L5, L6, L7)`, 동일 시스템 동일 그룹이 ≥ 4개면 `(L5–L9, +2)` 식으로 축약).
- **결정성**: 같은 entry_date + 같은 raw data → 항상 같은 자동값.
- **비파괴**: 자동값은 사용자 입력을 덮어쓰지 않음. 빈 칸만 채우거나, "Auto-fill" 버튼을 명시적으로 눌렀을 때만 적용.
- **출처 표시**: 각 필드 옆에 "auto" 뱃지 + 마우스 오버 시 출처 쿼리 설명 + 필터(Puretech) 명시.
- **재계산 가능**: 새로 raw data가 import되면 "Refresh from data" 버튼으로 재반영.
- **fail-soft**: 쿼리 실패/데이터 없음 → 빈 값으로 두고 경고 패널에 표시. 폼 자체는 항상 사용 가능.

## 스키마 변경 — planned_tests 섹션 확장

현재 Pred / T1 / T2 3개 행만 있음. 운영 요구에 따라 **R1S, R2S 2개 행을 추가**합니다.

| 행 | 의미 | plan 소스 | actual 소스 | done 판정 |
|----|------|-----------|-------------|----------|
| Pred | Predecessor | `pred_planned_date` | `pred_actual_date` | `pred_status='Done'` |
| T1 | Test 1 | `t1_planned_date` | `t1_actual_date` | `t1_status='Done'` |
| T2 | Test 2 | `t2_planned_date` | `t2_actual_date` | `t2_status='Done'` |
| **R1S** | Report 1 Submission | `r1_target_submission_date` | `r1_actual_submission_date` | `r1_status` ∈ ('Submitted','Approved') |
| **R2S** | Report 2 Submission | `r2_target_submission_date` | `r2_actual_submission_date` | `r2_status` ∈ ('Submitted','Approved') |

각 행마다 동일 5필드(`systems`, `plan`, `actual`, `pct`, 선택적으로 짧은 코멘트)를 추가합니다.

마이그레이션 1건: `ddn_sections.planned_tests` 아래 R1S(field_keys `planned_tests.r1s_*`), R2S(`planned_tests.r2s_*`) 필드 시드 + 영문 매핑 룰 추가(`planned_tests.r1s_line`, `planned_tests.r2s_line`).

## System 표현 규칙 (자동 채움 산출물 공통)

```text
입력 행(Puretech 필터링된 subtests):
  (system='Substation 1', level='L5')
  (system='Substation 1', level='L6')
  (system='Substation 1', level='L7')
  (system='Genset',       level='L1')

출력 1줄 문자열:
  "Substation 1 (L5–L7); Genset (L1)"

규칙:
  1. system_master.name 기준으로 그룹.
  2. 같은 system에 속한 level은 정렬 후
     - 1~3개: "(L5, L6, L7)"
     - 연속 4개 이상: "(L5–L9)"  (Range로 압축)
     - 비연속/혼합: "(L5–L7, L10)" 형태
  3. system 간 구분자 "; "
  4. 전체 길이가 80자 초과 시 "… +N more" 로 잘라냄 (마우스 오버 시 전체 표시).
  5. level이 비어있으면 system 이름만, level만 있고 system이 없으면 "(L5)" 형태.

위 로직은 src/lib/ddn/system-summary.ts 헬퍼 1개로 통일 (재사용 + 테스트).
```

이 헬퍼는 Pred/T1/T2/R1S/R2S systems 필드 5종, delayed_items 그룹화, T&C reject system 표시에 모두 동일하게 사용합니다.

## 필드별 자동 채움 매핑 검토 결과

### 분류 기준
- A = **완전 자동** (raw data만으로 결정)
- B = **반자동** (raw에서 후보 도출, 사용자 확인 필요)
- M = **수동 전용** (raw에 없는 정성·인원·안전 사항)

### 섹션별 매핑표

> **공통 필터**: 아래 모든 A/B 항목 쿼리는 `subcontractor_name = 'Puretech'` 적용. defect/punch는 동일 컬럼, subtests도 동일. sub-sub 22개는 자동 포함(부모가 Puretech).

```text
section          field_key                          구분  데이터 소스 + 산식
───────────────  ────────────────────────────────── ────  ─────────────────────────────────────────────────────────
planned_tests    pred_plan / actual                 A     subtests(PT) where pred_planned_date / pred_actual_date = D
planned_tests    pred_systems                       A     pred-plan 행을 system-summary 헬퍼로 압축
planned_tests    pred_pct                           A     computed (이미 구현)
planned_tests    t1_plan / actual / systems         A     subtests(PT) t1_planned_date=D / t1_actual_date=D AND t1_status='Done'
planned_tests    t2_plan / actual / systems         A     subtests(PT) t2_*
planned_tests    r1s_plan / actual / systems  [신규] A     subtests(PT) r1_target_submission_date / r1_actual_submission_date,
                                                          done = r1_status IN ('Submitted','Approved')
planned_tests    r2s_plan / actual / systems  [신규] A     subtests(PT) r2_target_submission_date / r2_actual_submission_date,
                                                          done = r2_status IN ('Submitted','Approved')
planned_tests    delayed_items (repeatable)         B     subtests(PT) where 과거 계획 미완료 → system-summary로 그룹
                                                          → name = system 1줄, reasons = ['delay'] (사용자 보완)

sec1  (인원·감독·회의)                              M     모두 수동 (raw 없음)

sec2  delay_days / ld_accumulated                   A     computed
sec2  facade_* / op_24h                             M     수동

sec3  ncr_*                                         M*    별도 NCR 테이블 없음 → 수동 (향후 defect priority 매핑 시 자동화)
sec3  def_open                                      A     defect_items(PT) is_active AND status='Open' count
sec3  def_closed_today                              A     defect_items(PT) actual_closure_date=D 또는
                                                          (status='Closed' AND updated_at::date=D)
sec3  def_new_today                                 A     defect_items(PT) created_at::date=D AND is_active
sec3  tc_reject (Y/N)                               B     subtest_change_log JOIN subtests(PT)
                                                          changed_field IN (t1/t2/r1/r2_status)
                                                          AND new_value='Returned' AND changed_at::date=D
sec3  tc_reject_system / level / reason             B     위 후보 행을 system-summary로 압축 + remarks 상위 1건
sec3  archi_rework_plan                             M     수동

sec4  asbuilt_cum / today                           A     docs_drawings(Puretech org) sub_module='as_built'
                                                          AND discipline ILIKE 'ELEC%'
                                                          cum: approved_date <= D / today: approved_date = D
sec4  om_elec / om_elv                              B     docs_omm (Puretech) sub_module/discipline 후보 제시
sec4  warranty                                      B     docs_warranty (Puretech) 후보 제시
sec4  gm_*                                          M     수동

sec5  cctv_* / strobe / pole / special / x15 / temp M     procurement raw 없음 → 수동
                                                          (향후 docs_spare_part 연동 검토)

sec6  pt_unaware / pt_dispute                       M     정성 평가 — 수동
sec6  t1_substitute                                 B     subtests(PT) t1_actual_date=D AND hdec_pic_name IS NOT NULL
                                                          → 운영 정의 fix 후 A 승격
sec6  mos_unlearned                                 M     수동
sec6  hubble_reject                                 B     punch_items(PT) 외부 Hubble 식별자 컬럼 정의 후
sec6  rto_cctv / fi / oi / smart / pa               A     punch_items(PT) trade 매핑 + completion_status != 'Closed' count
                                                          (매핑 상수는 src/lib/ddn/auto-fill-trade-map.ts)
sec6  cross_damage / pt_other_rework                M     수동

sec7  safety_* / env_* / hse_* / working_hour_*     M     수동

sec8  input_korean_md / input_hdec_md               M     사용자 일일 입력
sec8  cum_* / aggregate / delta_yesterday           A     computed (이미 구현)
```

요약: **자동(A) ~25개 + 반자동(B) ~10개 = 약 35개 필드**가 채워집니다 (전체 ~100개 중 35%). planned_tests 5행 × 3필드(systems/plan/actual) = 15개 + computed 2 + defect 3 + as-built 2 + RTO 5 = 핵심 27개가 1클릭 채움.

## 데이터 소스별 쿼리 청사진

모든 쿼리는 `entry_date = D` 한 개 입력으로 동작.

**모든 쿼리 공통 WHERE**: `is_active AND subcontractor_name = 'Puretech'` (subtests/defect/punch 동일. sub-sub는 부모 필터로 자동 포함). 향후 운영에서 다른 PT(예: `'Puretech-2'`)가 추가되면 상수 `PT_NAMES = ['Puretech']` 한곳만 수정.

### 1. `subtests` (Pred / T1 / T2 / R1S / R2S + Delayed)

```sql
-- 5행 한 번에 (Pred, T1, T2, R1S, R2S)
SELECT
  -- Pred
  count(*) FILTER (WHERE pred_planned_date = $D)                                AS pred_plan,
  count(*) FILTER (WHERE pred_actual_date  = $D AND pred_status='Done')         AS pred_actual,
  -- T1
  count(*) FILTER (WHERE t1_planned_date = $D)                                  AS t1_plan,
  count(*) FILTER (WHERE t1_actual_date  = $D AND t1_status='Done')             AS t1_actual,
  -- T2
  count(*) FILTER (WHERE t2_planned_date = $D)                                  AS t2_plan,
  count(*) FILTER (WHERE t2_actual_date  = $D AND t2_status='Done')             AS t2_actual,
  -- R1S
  count(*) FILTER (WHERE r1_target_submission_date = $D)                        AS r1s_plan,
  count(*) FILTER (WHERE r1_actual_submission_date = $D
                     AND r1_status IN ('Submitted','Approved'))                  AS r1s_actual,
  -- R2S
  count(*) FILTER (WHERE r2_target_submission_date = $D)                        AS r2s_plan,
  count(*) FILTER (WHERE r2_actual_submission_date = $D
                     AND r2_status IN ('Submitted','Approved'))                  AS r2s_actual
FROM subtests
WHERE is_active AND subcontractor_name = 'Puretech';

-- Systems 압축용 raw (Pred/T1/T2/R1S/R2S 각각 fetch, system+level 행 단위)
SELECT sm.name AS system, s.level
FROM subtests s JOIN system_master sm ON sm.id = s.system_id
WHERE s.is_active AND s.subcontractor_name = 'Puretech'
  AND s.t1_planned_date = $D;
-- → 클라이언트 system-summary 헬퍼로 "Substation 1 (L5–L7); Genset (L1)" 형식 변환

-- Delayed items (system 단위로 그룹 — 레터 가독성 우선)
SELECT sm.name AS system, s.level, s.t1_status, s.t2_status,
       s.t1_planned_date, s.t2_planned_date
FROM subtests s JOIN system_master sm ON sm.id = s.system_id
WHERE s.is_active AND s.subcontractor_name = 'Puretech' AND (
   (s.t1_planned_date < $D AND s.t1_status IS DISTINCT FROM 'Done')
OR (s.t2_planned_date < $D AND s.t2_status IS DISTINCT FROM 'Done'))
ORDER BY COALESCE(s.t2_planned_date, s.t1_planned_date);
-- → 클라이언트에서 system 단위 group + level 압축 →
--    repeatable rows: { name: "Substation 1 (L5–L7)", reasons: ['delay'] }
```

### 2. `defect_items` (§3 Defects)

```sql
SELECT
  count(*) FILTER (WHERE is_active AND status='Open')                   AS def_open,
  count(*) FILTER (WHERE actual_closure_date = $D
                      OR (status='Closed' AND updated_at::date = $D))   AS def_closed_today,
  count(*) FILTER (WHERE created_at::date = $D AND is_active)           AS def_new_today
FROM defect_items
WHERE subcontractor_name = 'Puretech';
```

### 3. `subtest_change_log` (§3 T&C Reject)

```sql
SELECT sm.name AS system, s.level, scl.changed_field, scl.new_value, s.remarks
FROM subtest_change_log scl
JOIN subtests s ON s.id = scl.subtest_id
JOIN system_master sm ON sm.id = s.system_id
WHERE s.subcontractor_name = 'Puretech'
  AND scl.changed_at::date = $D
  AND scl.changed_field IN ('t1_status','t2_status','r1_status','r2_status')
  AND scl.new_value = 'Returned'
ORDER BY scl.changed_at DESC;
-- → tc_reject = Y if 행 있음
-- → tc_reject_system = system-summary 헬퍼 적용
-- → tc_reject_reason = 첫 행의 s.remarks (fallback "Returned")
```

### 4. `docs_drawings` (§4 As-Built — Puretech 작성분만)

```sql
SELECT
  count(*) FILTER (WHERE sub_module='as_built' AND discipline ILIKE 'ELEC%'
                     AND approved_date IS NOT NULL AND approved_date <= $D) AS asbuilt_cum,
  count(*) FILTER (WHERE sub_module='as_built' AND discipline ILIKE 'ELEC%'
                     AND approved_date = $D)                                AS asbuilt_today
FROM docs_drawings
WHERE is_active AND organisation_raw ILIKE '%Puretech%';
-- organisation_raw 외 subcontractor_id 매핑이 있으면 그쪽 우선 사용
```

### 5. `punch_items` (§6 RTO outstanding)

```sql
-- 카테고리별 별도 쿼리 (또는 group by trade 1쿼리 후 클라이언트 분배)
SELECT count(*) FROM punch_items
WHERE is_active
  AND subcontractor_name = 'Puretech'
  AND main_trade = $TRADE
  AND ($KEYWORD IS NULL OR description ILIKE '%' || $KEYWORD || '%' OR sub_trade ILIKE '%' || $KEYWORD || '%')
  AND completion_status IS DISTINCT FROM 'Closed';
```

trade 매핑 초안 (`src/lib/ddn/auto-fill-trade-map.ts`, 운영 확인 후 확정):

| field        | main_trade | keyword |
|--------------|------------|---------|
| `rto_cctv`   | ELV        | CCTV    |
| `rto_fi`     | FP         | —       |
| `rto_oi`     | ICN        | —       |
| `rto_smart`  | ELV        | smart   |
| `rto_pa`     | PSG        | —       |

## 구현 흐름

```text
사용자가 Entry Date 선택
        │
        ▼
 useDdnAutoFill(D) 호출 (react-query, key=['ddn-auto', D])
        │
        ▼
 src/lib/ddn/auto-fill.ts: 5개 fetcher 병렬 실행
   - fetchPlannedTests(D)
   - fetchDefects(D)
   - fetchTcReject(D)
   - fetchAsBuilt(D)
   - fetchRtoOutstanding(D)
        │
        ▼
 결과를 { [field_key]: { value, source, query, ts } } 형태의 AutoMap으로 정규화
        │
        ▼
 DynamicForm에 autoMap 전달
   - 사용자 입력값이 비어있고 autoMap에 있으면 'placeholder' 표시 (회색)
   - "Apply auto-fill" 버튼: 빈 필드만 채움
   - "Apply auto-fill (overwrite)" 버튼: 모든 자동 가능 필드 덮어쓰기 (확인 다이얼로그)
   - 필드별 "↻" 아이콘: 해당 한 필드만 자동값으로 갱신
   - 필드 옆 "auto" 뱃지 + tooltip(쿼리 요약, 마지막 fetch 시각)
```

### 신규 파일

- `src/lib/ddn/auto-fill.ts` — fetcher 5종 + `useDdnAutoFill(D)` react-query 훅
- `src/lib/ddn/auto-fill-types.ts` — `AutoEntry`, `AutoMap`, `AutoSource` 타입
- `src/lib/ddn/system-summary.ts` — `summarizeSystems(rows)` 헬퍼 (system+level → 압축 문자열, 단위 테스트 포함)
- `src/lib/ddn/auto-fill-trade-map.ts` — RTO 카테고리 ↔ punch trade/keyword 상수
- `src/lib/ddn/pt-filter.ts` — `PT_NAMES = ['Puretech']` 상수 (한곳 관리)
- `src/components/ddn/AutoFillBanner.tsx` — 상단 배너 (Puretech-only 표기, 자동 N개, fetch 시각, Apply 버튼)
- `src/components/ddn/AutoFillBadge.tsx` — 필드 옆 작은 뱃지 (재사용)

### 변경 파일

- `src/pages/ddn/DdnInputPage.tsx`
  - 헤더에 Auto-fill 배너 추가 ("Scope: Puretech only" 부제 + 자동 가능 필드 N개 / 빈 필드만 채우기 / 덮어쓰기).
  - `useDdnAutoFill(entryDate)` 사용해 autoMap 생성.
  - DynamicForm에 `autoMap` prop 전달.
- `src/components/ddn/DynamicForm.tsx`
  - field 렌더 시 `autoMap[field_key]`가 있으면:
    - 값이 비었으면 input `placeholder`에 자동값 표시 (회색)
    - label 우측에 `<AutoFillBadge source={...} />` 추가
    - field 우측에 "↻" 버튼 (해당 필드만 적용)
  - `repeatable_group` (delayed_items) 의 경우 자동 후보를 별도 expandable 목록으로 표시 (사용자가 "Add"로 가져오기).

### 마이그레이션 (1건)

R1S, R2S 시드 + 매핑 룰:

```sql
-- ddn_fields: planned_tests.r1s_systems / r1s_plan / r1s_actual / r1s_pct
--             planned_tests.r2s_systems / r2s_plan / r2s_actual / r2s_pct
--             (Pred/T1/T2와 동일한 구조)
-- ddn_mapping_rules: planned_tests.r1s_line / r2s_line
--   condition: gt planned_tests.r1s_plan 0
--   template:  "R1S — {{planned_tests.r1s_actual}}/{{planned_tests.r1s_plan}}
--               ({{planned_tests.r1s_pct}}) — {{planned_tests.r1s_systems}}."
```

## UI 변경 미리보기 (Input 페이지)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Entry date [2026-05-20]   Day N [120]   [draft]                 │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ Auto-fill available for 27 fields  •  Scope: Puretech only   ││
│ │ Sources: subtests, defect_items, docs_drawings, punch_items  ││
│ │ [Refresh data]  [Apply to empty]  [Overwrite all ▾]          ││
│ └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘

 §Planned Tests (Puretech)
   T1 — Systems/Level [auto]                       ↻
   ┌────────────────────────────────────────────┐
   │ Substation 1 (L5–L7); Genset (L1)  (auto)  │  ← system-summary 결과
   └────────────────────────────────────────────┘
   T1 — Planned [auto]   T1 — Actual [auto]    T1 — Achievement
   [    12   ]           [     9    ]           75%

   R1S — Systems/Level [auto]   R1S — Planned [auto]  R1S — Actual [auto]
   [ ... ]                       [   5   ]              [   3   ]
```

## 작업 순서

1. 마이그레이션: planned_tests 섹션에 R1S/R2S 필드 + 매핑 룰 시드.
2. `system-summary.ts` + 단위 테스트.
3. `auto-fill-types.ts` + `pt-filter.ts` + `auto-fill-trade-map.ts`.
4. `auto-fill.ts` — fetcher 5종 (모두 Puretech 필터 적용), AutoMap 빌더, react-query 훅.
5. `AutoFillBadge.tsx` + `AutoFillBanner.tsx`.
6. `DynamicForm.tsx` 수정 — autoMap prop 수용, placeholder/뱃지/↻ 버튼.
7. `DdnInputPage.tsx` 수정 — useDdnAutoFill 연결, 배너 삽입.
8. 검증: 실제 D 입력 → fetch → 자동값 표시 → "Apply to empty" → 저장 → Preview에서 R1S/R2S 문장 확인.

## 향후 확장 (참고)

- 인원 출근/회의 참석을 별도 raw로 받기 시작하면 §1 인원·회의 항목도 자동화 가능.
- NCR 별도 테이블 도입 시 §3 NCR 카운트 자동화.
- 자재 procurement / Hubble RTO API 연동 시 §5·§6 자재·RTO 추가 자동화.
- 자동값 vs 사용자값 diff 로그 → 신뢰도/정확도 검증.
