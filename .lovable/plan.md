# Cat A Defect 자동 검증 (Priority Verification + Reason of Assessment)

## 목적
Import 시 `priority == "Cat A - Major Defect (Before SC)"` 인 결함의 `description`을 키워드 규칙으로 자동 평가하여 두 개의 신규 필드를 채운다.

- **Priority Verification**: `Confirmed Major` / `Review Needed` / `Should be Minor`
- **Reason of Assessment**: `"[Category] | [Explanation]"` 형식 단일 문자열

Cat A 가 아닌 레코드는 두 필드 모두 빈 값.

---

## 1. 데이터 모델

`defect_items` 테이블에 컬럼 2개 추가 (NULL 허용):

- `priority_verification text`
- `reason_of_assessment text`

인덱스: `priority_verification` 단일 인덱스(대시보드 필터/집계용).

기존 `defect_classification_rules` 와는 별개 영역(작업분류 vs 우선순위 검증)이므로 신규 테이블을 둔다:

`defect_priority_verification_rules`
- `id uuid pk`
- `verdict text` — `confirmed_major` / `review_needed` / `should_be_minor`
- `step int` — 평가 순서(1=Major, 2=Review, 3=Minor)
- `order_no int` — 같은 verdict 내 평가 순서 (first match wins)
- `match_type text` — `contains` / `contains_all` / `contains_any` / `regex`
- `keywords jsonb` — 매칭 키워드 배열 (소문자)
- `exclude_keywords jsonb` — 제외 키워드 배열 (옵션, AND NOT 처리)
- `category text` — Reason의 `[Category]` 부분
- `explanation text` — Reason의 `[Explanation]` 부분
- `is_active boolean`
- 표준 timestamps

RLS: 누구나 read, admin/superuser만 write (기존 classification_rules 패턴 동일).

초기 데이터는 프롬프트의 규칙을 그대로 seed migration으로 INSERT (Step1 Major 키워드 약 35개, Step2 Review 약 27개, Step3 Minor 카테고리 규칙 약 45개 + Major/Review 카테고리별 Reason 매핑).

---

## 2. 분류 엔진

신규 파일: `src/lib/defect-priority-verifier.ts`

```ts
export type PriorityVerdict = 'Confirmed Major' | 'Review Needed' | 'Should be Minor';
export interface PriorityVerificationResult {
  verdict: PriorityVerdict | null;     // Cat A 아니면 null
  reason: string | null;               // "Category | Explanation" or null
  category: string | null;             // dashboard용 분리값
}

export function verifyDefectPriority(
  priority: string | null,
  description: string | null,
  rules: PriorityVerificationRule[],
): PriorityVerificationResult
```

알고리즘:
1. `priority` 정규화 후 `cat a - major defect (before sc)` 아니면 `{null,null,null}` 반환.
2. `description` 소문자/공백 정규화.
3. Step 1 규칙(verdict=confirmed_major) 순회 → 첫 매칭 시 `Confirmed Major` 확정.
4. 미매칭 시 Step 2 규칙(review_needed) → 첫 매칭 시 `Review Needed`.
5. 미매칭 시 Step 3 규칙(should_be_minor) → 순서대로 첫 매칭, 모두 미스면 Default Minor.
6. 매칭된 규칙의 `category | explanation` 으로 reason 조립.

Confirmed Major / Review Needed 의 reason 매핑은 동일 테이블에서 verdict별 규칙 행이 곧 reason 보유. Step 1·2에서 "검출 키워드"와 "Reason 매핑 키워드"가 다른 경우(예: `broken glass` 검출 → reason은 `Safety Hazard` 카테고리)는 한 규칙 행이 둘을 모두 표현하므로, seed 작성 시 프롬프트의 Reason 표를 기준으로 키워드 그룹을 분리해 행을 만든다(키워드 1행에 여러 alias). 매칭/Reason이 동일 규칙으로 일치하도록 설계.

Default fallback 3개도 규칙 행으로 저장: `order_no` 가장 뒤, `keywords=[]` + 특수 플래그 또는 코드에서 fallback 처리.

Rules 캐시: `src/lib/defect-priority-verifier-cache.ts` (기존 `defect-classifier-context.ts` 패턴 따라 메모리 캐시 + invalidation).

---

## 3. Import 통합

`src/contexts/DefectImportContext.tsx` 의 매핑 직후 단계(약 878~930 라인, `classifyDefectV2` 호출부 인근)에서 각 row에 대해:

```ts
const v = verifyDefectPriority(row.priority, row.description, verifierRules);
row.priority_verification = v.verdict;
row.reason_of_assessment = v.reason;
```

이후 upsert 시 두 컬럼 함께 저장. Upsert 대상에 컬럼 추가.

Backfill: Import 페이지에 영향 없음. 기존 데이터는 별도 Admin 액션(아래 6번)에서 일괄 처리.

---

## 4. 화면 표시

### Defect Raw Data 페이지
- 컬럼 2개 추가: `Priority Verification`, `Reason of Assessment`.
- `priority_verification` 셀 배경색:
  - `Confirmed Major` → `#FFCCCC`
  - `Review Needed` → `#FFEB99`
  - `Should be Minor` → `#CCFFCC`
- Reason 컬럼은 `|` 기준 굵게 카테고리 + 일반 텍스트 설명.
- 필터: Verdict 선택 + Category(파싱) 선택.

### Defect Detail 페이지
- Priority 필드 하단에 Verification 뱃지 + Reason 표시.

### Defect Dashboard 페이지
- 신규 카드/표: Cat A 분포(Confirmed Major / Review Needed / Should be Minor 건수).
- Category별 집계 막대(상위 N).
- 카드 클릭 시 Raw Data로 verdict 필터 drill-down.

(이번 작업 범위: Raw Data 컬럼·색상 + Detail 표시 우선. Dashboard 카드는 동일 PR에 작은 카드 1개만 추가. 별도 확장은 후속.)

### Defect Field Config
- 신규 두 필드를 `defect_field_config`에 등록해 visibility/order 관리 가능하도록 한다.

---

## 5. Admin 관리 UI

`AdminClassificationPage` 또는 신규 탭 "Priority Verification Rules":
- Verdict / Step / Order / Keywords / Category / Explanation / Active 편집.
- 변경 후 캐시 invalidate.
- (1차 범위에선 read-only + seed 데이터로 시작, 편집 UI는 후속 PR로 분리해도 무방 — 사용자 결정 필요).

---

## 6. 기존 데이터 Backfill

신규 edge function: `supabase/functions/recompute-defect-priority-verification/index.ts`
- admin/superuser JWT 검증.
- 모든 `defect_items WHERE priority = 'Cat A - Major Defect (Before SC)'` 조회 → 클라이언트 분류 로직과 동일 규칙으로 계산 → batch UPDATE.
- Admin 페이지에 "Recompute Priority Verification" 버튼 추가.

---

## 7. 테스트

`src/test/defect-priority-verifier.test.ts`:
- Cat A 외 priority → null/null/null.
- 각 Step 1 키워드 샘플 → 정확한 verdict + reason.
- Step 2 키워드 샘플.
- Step 3 우선순위 의존 케이스(예: "fire stop" 단독 vs "seal up fire stop" 우선순위 검증).
- Default Minor fallback.
- 대소문자/공백 정규화.

---

## 기술 메모

- 키워드 매칭은 `description.toLowerCase()` 후 `includes`. `regex` 타입 규칙은 `RegExp(pattern, 'i')`로 처리.
- `contains_all` (AND): 모든 키워드 포함.
- `exclude_keywords` : 하나라도 포함 시 매칭 실패(AND NOT 표현).
- Step 3 의 "ceiling (catch-all)" 같은 broad 규칙은 세부 규칙보다 뒤에 `order_no`로 배치.
- Reason 문자열은 항상 `"Category | Explanation"` 단일 컬럼 저장. UI에서 `split('|', 2)` 로 분해.
- `priority_verification` 값은 enum 문자열 그대로(공백 포함). 인덱싱·필터에 그대로 사용.

---

## 확인 필요 (1가지)

Admin UI에서 **규칙 편집 기능**까지 1차 PR에 포함할지, 아니면 seed만 넣고 코드 상수로 시작해서 후속 PR로 미룰지? (편집 UI 포함 시 작업량 약 2배)
