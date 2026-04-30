## 문제 진단

Item 1051을 비롯해 **815건**의 defect 데이터가 `planned_start_date = 2001-04-XX ~ 2001-05-XX`로 잘못 저장되어 있습니다. 이 때문에:

- "Planned Progress %" 가 100%로 계산됨 (계획 종료일이 25년 전으로 보이므로)
- "시작 지연 / 종료 지연" 으로 잘못 분류됨
- S-Curve, Stage Progress, KPI 등 모든 파생 지표가 왜곡됨

### 근본 원인 (DB 검증 완료)

Excel 원본 셀이 **연도 없는 dd-MMM 포맷** (`04-May`, `27-Apr`, `13-May` 등) 으로 들어왔습니다.

`src/lib/defect-parser.ts` 의 `normalizeDate()` (157~168행) 는 이 포맷을 처리하는 분기가 없어서 그대로 `new Date("04-May")` 로 fallback 합니다. V8/Chrome 은 연도가 없는 이 문자열을 **1901→2001 (Y2K 휴리스틱)** 로 해석해 결과적으로 `2001-05-04` 가 됩니다. 게다가 `new Date()` + `toISOString()` 조합 때문에 한국 시간대(UTC+9) 에서는 하루씩 더 당겨져 `2001-05-03` 으로 저장됩니다.

이미 같은 프로젝트의 `src/lib/import-parser.ts` (다른 모듈) 에는 dd-MMM 정규식 분기가 존재하지만 (161행), defect 파서에는 빠져 있습니다.

### 영향 범위 (정확한 수치)

- `planned_start_date < 2020-01-01` 인 활성 행: **815건**
- 다른 4개 날짜 컬럼 중 하나 이상이 2001 인 활성 행: **775건**
- 모두 **2026-04-27 단일 업로드**에서 발생 → 의도한 연도는 **2026**

---

## 수정 계획

### 1. 파서 버그 수정 (`src/lib/defect-parser.ts`)

`normalizeDate()` 를 다음 순서로 재작성:

1. Excel 시리얼 숫자 → 기존 그대로
2. ISO `YYYY-MM-DD` → 앞 10자만 사용
3. **신규**: `dd-MMM` 또는 `dd-MMM-YYYY` 정규식 매칭 → 연도가 없으면 **현재 연도** 로 채움
4. **신규**: `YYYY/MM/DD`, `MM/DD/YYYY` 등 일반 슬래시 포맷 명시 처리
5. Fallback `new Date()` 사용 시 `.toISOString()` 대신 **로컬 연/월/일** 추출 (TZ 시프트 방지)
6. 결과가 `< 2000-01-01` 또는 `> 2100-01-01` 이면 `null` 반환 (방어선)

같은 모듈에 단위 테스트 추가 (`src/test/defect-parser-date.test.ts`):
- `'04-May'` → `'2026-05-04'` (현재 연도 가정)
- `'04-May-2025'` → `'2025-05-04'`
- `'2025-05-04'` → `'2025-05-04'`
- Excel serial 45000 → 정확한 날짜
- TZ 영향 검증 (UTC+9 환경에서 하루 시프트 없음)

### 2. 기존 잘못된 데이터 일괄 보정 (DB 마이그레이션)

5개 날짜 컬럼 (`planned_start_date`, `planned_completion_date`, `planned_closure_date`, `actual_start_date`, `actual_completion_date`, `actual_closure_date`) 에 대해:

```sql
UPDATE defect_items
SET planned_start_date = (planned_start_date + INTERVAL '25 years')::date
WHERE planned_start_date BETWEEN '2001-01-01' AND '2001-12-31'
  AND is_active = true;
-- 나머지 5개 컬럼 동일 처리
```

→ 2001 → 2026 으로 시프트 (정확히 25년).

각 업데이트 후 `defect_change_log` 에 `change_source = 'data_fix_2026_dd_mmm_year'` 로 기록하여 감사 추적.

보정 직후 `recompute-defect-status` Edge Function 을 한 번 호출하거나, 동일 로직으로 `completion_status` / `closure_status` / `planned_progress_pct` 를 재계산해 모든 파생 지표를 갱신.

### 3. 검증

- Item 1051 이 `planned_start_date=2026-05-04`, `planned_completion_date=2026-05-06` 로 보정되는지 SQL 로 확인
- Raw Data 화면에서 1051 상태가 "Planned" 로 바뀌는지 확인 (오늘=2026-04-30 < 2026-05-04)
- S-Curve 의 Planned 누적선이 정상화되는지 확인
- 활성 행 중 `< 2020` 날짜가 0 건임을 SQL 로 재확인

---

## 변경 파일 요약

- `src/lib/defect-parser.ts` — `normalizeDate()` 재작성
- `src/test/defect-parser-date.test.ts` — 신규 테스트
- `supabase/migrations/<ts>_fix_dd_mmm_year_2001_to_2026.sql` — 815건 데이터 보정 + change_log 기록 + 파생 상태 재계산 트리거

## 위험 / 가정

- **가정**: 2001 연도 데이터는 100% dd-MMM 파싱 버그의 결과이며, 실제로 2001년 데이터가 의도된 행은 없음 (시공/T&C 시스템 특성상 합리적). DB 확인 결과 모든 815건이 2026-04-27 단일 업로드에서 발생하여 이 가정과 일치.
- 향후 Excel 에 `dd-MMM` (연도 없음) 이 들어오면 **import 시점의 연도** 로 채워집니다. 12월/1월 경계에서 의도와 다를 수 있으나, 기존 `import-parser.ts` 와 동일한 정책이라 일관성 유지.
