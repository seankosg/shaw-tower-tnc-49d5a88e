# DDN Input 자동 채움 (Auto-Fill from Raw Data)

`/ddn/input`에서 **Entry Date**만 선택하면, 기존 raw data 테이블(`subtests`, `defect_items`, `punch_items`, `docs_drawings` 등)에서 해당 일자에 해당하는 값을 자동으로 가져와 폼을 채웁니다. 사용자는 자동값을 확인/덮어쓸 수 있고, 매번 수동 입력해야 하는 항목은 그대로 둡니다.

## 핵심 원칙

- **결정성**: 같은 entry_date + 같은 raw data → 항상 같은 자동값.
- **비파괴**: 자동값은 사용자 입력을 덮어쓰지 않음. 빈 칸만 채우거나, "Auto-fill" 버튼을 명시적으로 눌렀을 때만 적용.
- **출처 표시**: 각 필드 옆에 "auto" 뱃지 + 마우스 오버 시 출처 쿼리 설명.
- **재계산 가능**: 새로 raw data가 import되면 "Refresh from data" 버튼으로 재반영.
- **fail-soft**: 쿼리 실패/데이터 없음 → 빈 값으로 두고 경고 패널에 표시. 폼 자체는 항상 사용 가능.

## 필드별 자동 채움 매핑 검토 결과

### 분류 기준
- A = **완전 자동** (raw data만으로 결정)
- B = **반자동** (raw에서 후보 도출, 사용자 확인 필요)
- M = **수동 전용** (raw에 없는 정성·인원·안전 사항)

### 섹션별 매핑표

```text
section          field_key                       구분  데이터 소스 + 산식
───────────────  ─────────────────────────────── ────  ──────────────────────────────────────────────────────────
planned_tests    pred_plan                       A     subtests where pred_planned_date = D, group count
planned_tests    pred_actual                     A     subtests where pred_actual_date = D, group count
planned_tests    pred_systems                    B     subtests pred-plan 그룹의 system_master.name 콤마 결합
planned_tests    pred_pct                        A     computed (이미 구현)
planned_tests    t1_plan                         A     subtests where t1_planned_date = D
planned_tests    t1_actual                       A     subtests where t1_actual_date = D AND t1_status='Done'
planned_tests    t1_systems                      B     동일 그룹 system name
planned_tests    t2_plan / t2_actual / t2_systems A     동일 (t2_*)
planned_tests    delayed_items (repeatable)      B     subtests where (t1_planned_date < D AND t1_status != 'Done')
                                                       또는 (t2_planned_date < D AND t2_status != 'Done')
                                                       → name = subtest_id, reasons = ['delay']
                                                       (사유는 사용자가 multi-select로 보완)

sec1  (인원·감독)                                M     PM 출근, 회의 참석, 인원 계획/실적 모두 raw 없음
sec1  pm_attended                                M     수동 (체크리스트)
sec1  hdec_substitution / target / other         M     수동
sec1  eng_planned / actual 등 인원 카운트        M     인원 마스터가 없으므로 수동
                                                       (향후: 인원 일일 출근 테이블 추가 시 자동화 가능 — Phase++)

sec2  delay_days                                 A     computed (settings.contract_completion_date − D)
sec2  ld_accumulated                             A     computed (delay_days × settings.ld_daily_rate_sgd)
sec2  facade_cum / today / defect                M     별도 façade 진척 raw 없음 (수동)
sec2  op_24h                                     M     수동

sec3  ncr_open                                   M*    NCR 테이블 없음. defect_items 중 priority='NCR'/특정 분류
                                                       가 있다면 추출 가능. 현재 스키마상 직접 매핑 어렵 → M
                                                       (필요 시 defect_classification_rules 활용한 필터 추가)
sec3  ncr_new_today / closed_today               M*    동일
sec3  def_open                                   A     defect_items where is_active AND status='Open' count
sec3  def_closed_today                           A     defect_items where actual_closure_date = D 또는
                                                       (status='Closed' AND updated_at::date = D)
                                                       — 우선 actual_closure_date 우선, 보조로 change_log 확인
sec3  def_new_today                              A     defect_items where created_at::date = D AND is_active
sec3  tc_reject                                  B     subtest_change_log changed_field='t1_status' OR 'r1_status'
                                                       new_value IN ('Returned') AND changed_at::date = D
                                                       → Y/N 결정 + system/level/reason 후보 표시
sec3  tc_reject_system / level / reason          B     위 후보 행의 subtest → system_master.name / level / remarks
sec3  archi_rework_plan                          M     수동

sec4  asbuilt_cum                                A     docs_drawings where sub_module='as_built' AND discipline ILIKE 'ELEC%'
                                                       AND approved_date <= D, count
sec4  asbuilt_today                              A     docs_drawings where approved_date = D AND discipline ILIKE 'ELEC%'
sec4  om_elec / om_elv                           B     docs_omm 테이블 기준 (sub_module/discipline) — 후보 제시
sec4  warranty                                   B     docs_warranty (signed/submitted 여부) — 후보 제시
sec4  gm_led_driver / gm_power_tab               M     수동

sec5  cctv_po / cctv_po_date / cctv_eta 등        M     구매·자재 상태 raw 별도 없음 → 수동
                                                       (향후: docs_spare_part 또는 별도 procurement 테이블 연동 검토)

sec6  pt_unaware / pt_dispute                    M     정성 평가 — 수동
sec6  t1_substitute                              A?    subtests where t1_actual_date = D AND
                                                       hdec_pic_name IS NOT NULL AND subcontractor_name = 'PT'
                                                       count (운영 합의 후 정의 fix)
sec6  mos_unlearned                              M     수동 (MOS 학습 정의 별도)
sec6  hubble_reject                              B     punch_items 또는 별도 외부 (Hubble) — 후보만
sec6  rto_cctv / fi / oi / smart / pa            A     punch_items where main_trade IN (...) AND completion_status != 'Closed'
                                                       (trade 매핑: cctv→'ELV'+keyword, fi→'FP', oi→?,
                                                        smart→'ELV'+keyword, pa→'PSG' 등 — 운영 정의 필요)
sec6  cross_damage / location / trade / cost     M     수동
sec6  pt_other_rework                            M     수동

sec7  safety_violations / env_violations         M     안전 raw 없음 — 수동
sec7  hse_penalty_count / amount                 M     수동
sec7  working_hour_violation / detail            M     수동

sec8  input_korean_md / input_hdec_md            M     사용자 일일 입력
sec8  cum_* / aggregate / delta_yesterday        A     computed (이미 구현)
```

요약: **약 30~35개 필드(전체 ~90 중 1/3)** 가 raw에서 자동/반자동 채움이 가능합니다.

## 데이터 소스별 쿼리 청사진

모든 쿼리는 `entry_date = D` 한 개 입력으로 동작.

### 1. `subtests` (Pred/T1/T2 + Delayed Items)

```sql
-- Pred/T1/T2 plan/actual count
SELECT
  count(*) FILTER (WHERE pred_planned_date = $D) AS pred_plan,
  count(*) FILTER (WHERE pred_actual_date = $D)  AS pred_actual,
  count(*) FILTER (WHERE t1_planned_date = $D)   AS t1_plan,
  count(*) FILTER (WHERE t1_actual_date  = $D AND t1_status='Done') AS t1_actual,
  count(*) FILTER (WHERE t2_planned_date = $D)   AS t2_plan,
  count(*) FILTER (WHERE t2_actual_date  = $D AND t2_status='Done') AS t2_actual
FROM subtests WHERE is_active;

-- Systems list (Pred/T1/T2 각각)
SELECT DISTINCT sm.name FROM subtests s JOIN system_master sm ON sm.id = s.system_id
WHERE s.is_active AND s.t1_planned_date = $D;

-- Delayed items (today 기준 미완료된 과거 계획)
SELECT s.subtest_id AS name, s.item_no, sm.name AS system,
       s.t1_status, s.t2_status, s.t1_planned_date, s.t2_planned_date
FROM subtests s JOIN system_master sm ON sm.id = s.system_id
WHERE s.is_active AND (
   (s.t1_planned_date < $D AND s.t1_status IS DISTINCT FROM 'Done')
OR (s.t2_planned_date < $D AND s.t2_status IS DISTINCT FROM 'Done'))
ORDER BY COALESCE(s.t2_planned_date, s.t1_planned_date)
LIMIT 50;  -- 상위 N개만 후보로
```

### 2. `defect_items` (§3 Defects)

```sql
SELECT
  count(*) FILTER (WHERE is_active AND status='Open') AS def_open,
  count(*) FILTER (WHERE actual_closure_date = $D OR
                         (status='Closed' AND updated_at::date = $D)) AS def_closed_today,
  count(*) FILTER (WHERE created_at::date = $D AND is_active) AS def_new_today
FROM defect_items;
```

### 3. `subtest_change_log` (§3 T&C Reject)

```sql
SELECT scl.subtest_id, s.subtest_id AS subtest_code, sm.name AS system,
       s.level, scl.new_value, s.remarks
FROM subtest_change_log scl
JOIN subtests s ON s.id = scl.subtest_id
JOIN system_master sm ON sm.id = s.system_id
WHERE scl.changed_at::date = $D
  AND scl.changed_field IN ('t1_status','t2_status','r1_status','r2_status')
  AND scl.new_value IN ('Returned')
ORDER BY scl.changed_at DESC LIMIT 10;
```

### 4. `docs_drawings` (§4 As-Built)

```sql
SELECT
  count(*) FILTER (WHERE sub_module='as_built' AND discipline ILIKE 'ELEC%'
                     AND approved_date IS NOT NULL AND approved_date <= $D) AS asbuilt_cum,
  count(*) FILTER (WHERE sub_module='as_built' AND discipline ILIKE 'ELEC%'
                     AND approved_date = $D) AS asbuilt_today
FROM docs_drawings WHERE is_active;
```

### 5. `punch_items` (§6 RTO outstanding)

trade 매핑 테이블(코드 내 상수 또는 신규 `ddn_punch_trade_map` 룩업)로 카테고리 → trade/keyword 변환.

```sql
-- 예: rto_fi = main_trade='FP' AND completion_status != 'Closed'
SELECT count(*) FROM punch_items
WHERE is_active AND main_trade = $TRADE AND completion_status IS DISTINCT FROM 'Closed';
```

trade 매핑 초안(운영 확인 필요):
- `rto_cctv` → main_trade='ELV' AND description/sub_trade ILIKE '%CCTV%'
- `rto_fi`   → main_trade='FP'
- `rto_oi`   → main_trade='ICN' (운영 정의 필요)
- `rto_smart` → main_trade='ELV' AND description ILIKE '%smart%'
- `rto_pa`   → main_trade='PSG'

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
- `src/components/ddn/AutoFillBanner.tsx` — 상단 배너 (몇 개 필드 자동, 데이터 새로고침 시각, Apply 버튼)
- `src/components/ddn/AutoFillBadge.tsx` — 필드 옆 작은 뱃지 (재사용)

### 변경 파일

- `src/pages/ddn/DdnInputPage.tsx`
  - 헤더에 Auto-fill 배너 추가 (자동 가능 필드 N개 / 빈 필드만 채우기 / 덮어쓰기).
  - `useDdnAutoFill(entryDate)` 사용해 autoMap 생성.
  - DynamicForm에 `autoMap` prop 전달.
- `src/components/ddn/DynamicForm.tsx`
  - field 렌더 시 `autoMap[field_key]`가 있으면:
    - 값이 비었으면 input `placeholder`에 자동값 표시 (회색)
    - label 우측에 `<AutoFillBadge source={...} />` 추가
    - field 우측에 "↻" 버튼 (해당 필드만 적용)
  - `repeatable_group` 의 경우 자동 후보를 별도 expandable 목록으로 표시 (사용자가 "Add"로 가져오기).

### 신규 SQL 보조 (선택)

성능을 위해 view 1개:
```sql
CREATE OR REPLACE VIEW ddn_subtest_daily AS
SELECT
  COALESCE(t1_actual_date, t1_planned_date, t2_actual_date, t2_planned_date, pred_actual_date, pred_planned_date) AS d,
  id, project_id, system_id, item_no, subtest_id,
  pred_planned_date, pred_actual_date,
  t1_planned_date, t1_actual_date, t1_status,
  t2_planned_date, t2_actual_date, t2_status
FROM subtests WHERE is_active;
```
(필요 없다고 판단되면 클라이언트에서 직접 집계.)

## UI 변경 미리보기 (Input 페이지)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Entry date [2026-05-20]   Day N [120]   [draft]   ⓘ Auto-fill   │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ Auto-fill available for 28 fields  •  Source: subtests,      ││
│ │ defect_items, docs_drawings, punch_items                     ││
│ │ [Refresh data]  [Apply to empty fields]  [Overwrite all ▾]   ││
│ └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘

 §Planned Tests
   Pred — Systems/Level  [auto]                   ↻
   ┌──────────────────────────────┐
   │ Substation A, B, ... (auto)  │  ← placeholder가 자동값
   └──────────────────────────────┘
   Pred — Planned [auto]    Pred — Actual [auto]   Pred — Achievement
   [  12  ]                 [   9  ]                 75%
```

## 작업 순서

1. `auto-fill-types.ts` + `auto-fill.ts` — fetcher 5종, AutoMap 빌더, react-query 훅.
2. `AutoFillBadge.tsx` + `AutoFillBanner.tsx`.
3. `DynamicForm.tsx` 수정 — autoMap prop 수용, placeholder/뱃지/↻ 버튼.
4. `DdnInputPage.tsx` 수정 — useDdnAutoFill 연결, 배너 삽입.
5. trade 매핑 상수 `src/lib/ddn/auto-fill-trade-map.ts` — RTO 카테고리 ↔ punch trade.
6. 검증: 실제 D 입력 → fetch → 자동값 표시 → "Apply to empty" → 저장 확인.

## 향후 확장 (참고)

- 인원 출근/회의 참석을 별도 raw로 받기 시작하면 §1 인원·회의 항목도 자동화 가능.
- NCR 별도 테이블 도입 시 §3 NCR 카운트 자동화.
- 자재 procurement / Hubble RTO API 연동 시 §5·§6 자재·RTO 추가 자동화.
- 자동값 vs 사용자값 diff 로그 → 신뢰도/정확도 검증.
