# Cat A Defect 자동 검증 (HDEC's Verification + HDEC's Reason)

## 목적
Import 시 `Defect Prioritisation == "Cat A - Major Defect (Before SC)"` 이고 아직 종결되지 않은 결함의 `description`을 키워드 규칙으로 자동 평가하여 신규 필드 2개를 채운다.

- **HDEC's Verification** (verdict): 다음 3개 값 중 하나
  - `Cat A - Major Defect (Before SC)` — Major로 확정 (= "Confirmed Major")
  - `Cat B - Minor Defect` — Minor로 재분류 권고 (= "Should be Minor")
  - `Review Needed` — 현장 확인 필요
- **HDEC's Reason**: `"[Category] | [Explanation]"` 형식 단일 문자열

## 실행 조건 (모두 만족해야 분류 수행)

분류는 다음을 **모두** 만족할 때만 실행:

1. Import row의 `priority` (Defect Prioritisation 컬럼) == `Cat A - Major Defect (Before SC)`
2. Import row의 `status` (Status 컬럼) ≠ `Closed` (대소문자 무관)
3. 기존 Raw Data 동일 issue의 `closure_status` ≠ `Done` (재import/업데이트 시 DB 조회로 확인)

위 조건 중 하나라도 미충족이면 두 필드는 **빈 값으로 둠** (기존 값이 있어도 import 흐름에서는 덮어쓰지 않음 — 기존 값 유지).

---

## 1. 데이터 모델

`defect_items` 테이블 신규 컬럼 (NULL 허용):

- `hdec_verification text` — 위 3개 값 중 하나
- `hdec_reason text` — `"Category | Explanation"`

인덱스: `hdec_verification` 단일 인덱스(대시보드 필터/집계용).

신규 규칙 테이블 `defect_priority_verification_rules`:
- `id uuid pk`
- `verdict text` — `cat_a_major` / `cat_b_minor` / `review_needed`
- `step int` — 평가 순서(1=Major, 2=Review, 3=Minor)
- `order_no int` — 같은 verdict 내 평가 순서 (first match wins)
- `match_type text` — `contains` / `contains_all` / `regex`
- `keywords jsonb` — 매칭 키워드 배열 (소문자)
- `exclude_keywords jsonb` — 제외 키워드 (AND NOT)
- `category text` — Reason의 `[Category]`
- `explanation text` — Reason의 `[Explanation]`
- `is_active boolean`, 표준 timestamps

RLS: 누구나 read, admin/superuser write (기존 `defect_classification_rules` 패턴).

초기 데이터: Seed migration으로 프롬프트의 규칙을 일괄 INSERT.
- Step1 (Major) 약 35개 키워드 행
- Step2 (Review) 약 27개
- Step3 (Minor) 카테고리 규칙 약 45개 + Default Minor fallback

---

## 2. 분류 엔진

신규 파일: `src/lib/defect-priority-verifier.ts`

```ts
export type HdecVerdict =
  | 'Cat A - Major Defect (Before SC)'
  | 'Cat B - Minor Defect'
  | 'Review Needed';

export interface HdecVerificationResult {
  verdict: HdecVerdict | null;   // 조건 미충족 시 null
  reason: string | null;          // "Category | Explanation"
  category: string | null;        // dashboard 집계용 분리값
}

export function verifyDefectPriority(args: {
  priority: string | null;
  status: string | null;
  existingClosureStatus?: string | null;
  description: string | null;
  rules: PriorityVerificationRule[];
}): HdecVerificationResult
```

알고리즘:
1. 게이트 체크 — `priority != "Cat A..."` → `{null,null,null}`.
2. `status?.toLowerCase() === 'closed'` → `{null,null,null}`.
3. `existingClosureStatus?.toLowerCase() === 'done'` → `{null,null,null}`.
4. `description` 소문자/공백 정규화.
5. Step 1 (cat_a_major) 순회 → 첫 매칭 시 verdict = `Cat A - Major Defect (Before SC)`.
6. 미매칭 시 Step 2 (review_needed) → `Review Needed`.
7. 미매칭 시 Step 3 (cat_b_minor) 순서대로 → 첫 매칭, 모두 미스면 Default Minor.
8. 매칭 규칙의 `category | explanation`로 reason 조립.

규칙 캐시: `src/lib/defect-priority-verifier-cache.ts` (기존 `defect-classifier-context.ts` 패턴).

---

## 3. Import 통합

`src/contexts/DefectImportContext.tsx` 매핑 직후 단계(`classifyDefectV2` 호출부 인근, 약 878~930 라인)에 분류 호출 삽입.

추가 처리:
- Import 시작 전 한 번, 대상 issue들의 기존 `closure_status` 를 batch select 하여 map으로 보유 (이미 fetch하고 있다면 재사용, 아니면 `defect_items.select('issue_no, closure_status')` 1회 추가).
- 각 row 처리 시:
  ```ts
  const v = verifyDefectPriority({
    priority: row.priority,
    status: row.status,
    existingClosureStatus: existingClosureMap.get(row.issue_no),
    description: row.description,
    rules,
  });
  // null 이면 기존 DB 값 유지(payload에 포함하지 않음)
  if (v.verdict !== null) {
    row.hdec_verification = v.verdict;
    row.hdec_reason = v.reason;
  }
  ```
- Upsert payload에 두 컬럼 조건부 포함.

Backfill: Import 흐름과 무관. 별도 Admin 액션(6번)에서 처리.

---

## 4. 화면 표시

### Defect Raw Data 페이지
- 컬럼 2개 추가: `HDEC's Verification`, `HDEC's Reason`.
- `hdec_verification` 셀 배경색:
  - `Cat A - Major Defect (Before SC)` → `#FFCCCC` (light red)
  - `Review Needed` → `#FFEB99` (light amber)
  - `Cat B - Minor Defect` → `#CCFFCC` (light green)
  - 빈 값 → 색상 없음
- Reason 컬럼: `|` 기준 카테고리 굵게 + 설명.
- 필터: Verdict 선택 + Category 선택.

### Defect Detail 페이지
- Defect Prioritisation 필드 하단에 HDEC's Verification 뱃지 + HDEC's Reason 표시.

### Defect Dashboard 페이지
- Cat A 검증 분포 카드 1개 추가 (Major / Review / Minor 건수). Drill-down → Raw Data 필터.

### Defect Field Config
- 신규 두 필드를 `defect_field_config`에 등록.

---

## 5. Admin 관리 UI

`AdminClassificationPage`에 "Priority Verification Rules" 탭 추가 (1차에선 read-only 목록 + Seed 사용, 편집 UI는 후속 PR).

---

## 6. 기존 데이터 Backfill

신규 edge function `supabase/functions/recompute-hdec-verification/index.ts`:
- admin/superuser JWT 검증.
- 조건: `priority = 'Cat A - Major Defect (Before SC)' AND (closure_status IS DISTINCT FROM 'Done') AND (status IS DISTINCT FROM 'Closed')`.
- 규칙 적용 후 batch UPDATE.
- Admin 페이지에 "Recompute HDEC's Verification" 버튼.

---

## 7. 테스트

`src/test/defect-priority-verifier.test.ts`:
- Cat A 외 priority → null/null/null.
- Status = Closed → null.
- 기존 closure_status = Done → null.
- 각 Step 키워드 샘플별 verdict + reason 정확성.
- Step3 우선순위 의존 케이스 (예: `seal up fire stop` vs `fire stop ... clean`).
- Default Minor fallback.
- 대소문자/공백 정규화.

---

## 기술 메모

- 매칭은 `description.toLowerCase()` 후 `includes`. `regex` 타입은 `RegExp(pattern, 'i')`.
- `contains_all`: 모든 키워드 포함, `exclude_keywords`: 하나라도 포함 시 매칭 실패.
- Step3 의 broad catch-all (예: "ceiling" 단독)은 세부 규칙보다 뒤에 `order_no` 배치.
- Reason은 단일 컬럼 저장, UI에서 `split('|', 2)`로 분해.
- `hdec_verification` enum 값은 정확히 위 3개 문자열만 허용. 컬럼은 text지만 CHECK 제약 또는 트리거로 enforce.

---

## 확인 필요

1. Admin 규칙 편집 UI를 1차 PR에 포함할지, 아니면 seed만 넣고 후속 PR로 미룰지?
2. `hdec_verification` 값 enforce를 DB CHECK 제약으로 둘지(권장) 아니면 애플리케이션 검증만으로 충분한지?
