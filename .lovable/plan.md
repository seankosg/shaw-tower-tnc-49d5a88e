
# Shaw Tower Defect 분류 통합 — 최종 계획 v3

## 1. 핵심 결정 사항 (사용자 확정)

### 필드 매핑
| 프롬프트 개념 | 시스템 컬럼 | 비고 |
|---|---|---|
| Tier 1 (Major) | **사용 안 함** | 불필요 |
| Tier 2 (Sub) | `defect_items.main_trade` | 기존 컬럼 재사용 |
| Tier 3 (Minor) | `defect_items.sub_trade` | 기존 컬럼 재사용 |
| Work Type 이름 | `defect_items.work_type` | **핵심** |
| Subcontractor 라벨 | `defect_items.subcontractor_name` | 기존 master 매칭 |
| Work Type ID, Auto Priority, Rationale, Confidence | **사용 안 함** | |

→ **`defect_items` 스키마 변경 0건.** 신규 컬럼 없음.

### 기존 값 처리 정책 (유지)
```text
Import 시 각 필드(main_trade/sub_trade/work_type)별로:
  1순위: Excel 셀에 값 있음   → Excel 값 사용
  2순위: DB에 값 있음          → DB 값 보존 (분류기 호출 안 함)
  3순위: 둘 다 비었을 때만     → V2 분류기 실행
```
- 사용자 수동 편집값 절대 덮어쓰지 않음
- 과거에 채워진 잘못된 값도 보존 (재분류는 별도 admin 액션 없음 — 이번 범위 외)

### 사이드 픽스
- `DefectDetailPage` Auto-classify 버튼: `work_type`이 무조건 분류기 결과로 덮이는 현 동작을 **빈 값일 때만 채우도록** 수정 (main_trade/sub_trade와 일관)

## 2. DB 변경

### A. 신규 룰 테이블 3개 (마이그레이션)

**1) `defect_subcontractor_workscope`** — 협력사 라벨 + 키워드 사전
```
id, label, full_name, keywords text[], match_priority int, is_active
```
시드 20건: GRB, Mero, SYS, Finebuild, Puretech, ACU, KKC, HDEC, ASK, Rico,
Schindler, Microtac, Suntech, Tat Seng, Octopus, Geze, Ecoplus, Acemech, Maxbond, Rigel

**2) `defect_work_types`** — 36개 Work Type 사전
```
id, name, trade,
sub_match text[],          -- Tier 2 라벨 매칭 조건
desc_keywords text[],      -- description 키워드
default_main_trade text,   -- 매칭 시 채울 main_trade 값 (= Tier2)
default_sub_trade text,    -- 매칭 시 채울 sub_trade 값 (= Tier3)
match_order int,           -- WT-01 → WT-36 순서 (1~36)
is_active
```
시드 36건 (프롬프트 STEP 5 표 그대로)

**3) `defect_classification_alias`** — 라벨 정규화
```
id, raw_label, canonical_label
```
시드: `Puretch→Puretech`, `Finbuild→Finebuild`, `KURIHARA→KKC`,
`Highzone Mero→Mero`, `Highzone ACU→ACU`, slash 첫 토큰 추출 패턴 등

**RLS** (기존 룰 테이블 패턴 동일):
- SELECT: 인증 사용자 전체
- INSERT/UPDATE/DELETE: `is_admin_or_superuser(auth.uid())`

### B. 기존 테이블 — 변경 없음
- `defect_items` 스키마 그대로
- `defect_classification_rules` (13건), `defect_discipline_fallback` (6건) — 레거시 fallback으로 유지

## 3. 분류 엔진

**파일**: `src/lib/defect-classifier.ts` (확장, 기존 함수 보존)

### 새 함수: `classifyDefectV2(input, ctx) → V2Result`

```text
입력 input:    { description, field_discipline, raw_label }
컨텍스트 ctx:  { workscopes, workTypes, aliases, legacyRules, legacyFallbacks }

처리 순서:
  STEP 1  canonical_label = aliases.normalize(raw_label)

  STEP 2  subcontractor 결정:
            a) canonical_label이 workscope.label과 일치 → 그 라벨
            b) 없으면 description 키워드 매칭 (match_priority 순)
            c) 그래도 없으면 null

  STEP 3  workType 결정 (workTypes를 match_order 오름차순 순회):
            매칭 조건 (OR):
              - sub_match에 현재 subcontractor 또는 후보 sub가 포함
              - desc_keywords 중 하나가 description에 포함
            첫 매칭에서 정지

  STEP 4  결과 매핑:
            main_trade        = workType.default_main_trade
            sub_trade         = workType.default_sub_trade
            work_type         = workType.name
            subcontractor_name = STEP 2 결과 (master에 동명이 있으면 그대로)

  STEP 5  V2 매칭 실패 시 → legacy classifyDefect()로 위임 (현 동작 유지)

  STEP 6  모두 실패 → unclassified (모든 필드 빈 문자열, source='unclassified')

source: 'workscope' | 'work_type_rule' | 'legacy_keyword' | 'legacy_discipline' | 'unclassified'
```

기존 `classifyDefect()` 함수는 **그대로 유지** — V2가 fallback으로 호출.

## 4. Import / Detail 통합

### `DefectImportContext.tsx` (line 762~790)
- `classifyDefect()` → `classifyDefectV2()` 교체
- 우선순위 로직은 **변경 없음** (Excel > DB > 분류기)
- 컨텍스트(workscopes / workTypes / aliases)는 import 시작 시 한 번 로드해 메모리 보유 → row 별 DB 호출 없음
- `subcontractor_name` 처리: 현재는 분류기가 채우지 않음 → V2도 마찬가지로 **Excel/DB 우선, 분류기는 둘 다 비었을 때만** 동일 정책 적용

### `DefectDetailPage.tsx` (line 516~530) — Auto-classify 버튼
- `classifyDefect()` → `classifyDefectV2()` 교체
- **버그 수정**: `work_type: c.work_type || null` → `work_type: cur.work_type || c.work_type || null`
- toast 메시지에 source 표시 유지

### `DefectRawDataPage` — 변경 없음
기존 컬럼만 사용하므로 화면·정렬·필터 영향 0.

## 5. Admin UI (`AdminClassificationPage` 확장)

탭 구성 (기존 2개 + 신규 3개):
1. **Workscope Labels** (NEW) — 라벨/키워드/match_priority CRUD
2. **Work Types (36)** (NEW) — 이름·trade·sub_match·desc_keywords·default_main_trade·default_sub_trade·match_order 편집
3. **Label Aliases** (NEW) — typo / Highzone / slash 정규화
4. Keyword Rules (기존, 레거시)
5. Discipline Fallback (기존, 레거시)

기존 패턴(인라인 편집 + onBlur 저장) 그대로 사용.

## 6. 검증 도구 (read-only)

`scripts/validate-classification-v2.ts` — 일회성 분석 스크립트:
- 현 DB의 `defect_items` 2,942건을 메모리에서 V2 분류기로 재분류 (DB 변경 없음)
- 결과를 현재 저장된 `main_trade`/`sub_trade`/`work_type`/`subcontractor_name`과 비교
- 출력: `/mnt/documents/classification-v2-audit.md`
  - subcontractor 분포 vs 통합 가이드 §3 기준치 (GRB ~500, Mero ~470, …)
  - work_type 분포 (36개 중 어느 것이 가장 많이 매칭/미매칭되는지)
  - 현 DB 값과 V2 결과가 다른 행의 샘플 100건
- **목적**: 룰 시드의 적정성을 import 전에 검증

## 7. 테스트 (`src/test/defect-classifier-v2.test.ts`)

프롬프트 Example 1~4 그대로 케이스화:
- "Make good of walls and repaint" → subcontractor=GRB, work_type="Paint Touch-up/Repaint", main_trade="General Painting", sub_trade="Touch-up/Make Good"
- "Provide label to the trunking" + Field Discipline=Fire Protection → subcontractor=Rico, work_type="Labelling Work"
- "Water leak from male toilet urinal..." → subcontractor=ASK, work_type="Water Leak/Drainage Repair"
- "Air diffuser panel not seated properly" → subcontractor=KKC, work_type="Diffuser/Grille Adjustment"

Critical Rules A~H 각 1케이스 (Pelmet→Mero, KKC→HVAC, SYS→WetWork, HDEC paint→GRB, …)
Alias: "Highzone Mero" → Mero, "Puretch" → Puretech
빈 입력 / 매칭 실패 → unclassified, 모든 필드 빈 문자열

## 8. 작업 순서

```text
Phase A  마이그레이션: 테이블 3개 + 시드 (workscope 20, work_types 36, aliases ~10)
Phase B  src/lib/defect-classifier.ts 에 classifyDefectV2 + 컨텍스트 로더 추가
Phase C  Vitest 케이스 작성·통과
Phase D  DefectImportContext 와 DefectDetailPage 를 V2로 교체 (+ work_type 버그 픽스)
Phase E  AdminClassificationPage 에 신규 탭 3개 추가
Phase F  validate-classification-v2 스크립트 1회 실행 → /mnt/documents 보고서
```

LLM fallback edge function은 **이번 범위에서 제외** (룰 베이스만으로 90%+ 처리 가능, 필요 시 추후 단계).

## 9. 영향 / 리스크

- `defect_items` 스키마 무변경 → 기존 화면·export·룰·RLS 영향 0
- 기존 분류 결과 2,942건 보존 (V2는 빈 필드만 채움)
- `subcontractor_master` (46건)와 신규 workscope (20건)는 별개 운영 — workscope.label로 매칭한 라벨을 `subcontractor_name`에 그대로 넣음. master에 동명이 있으면 자연스럽게 SC No 발번 로직과 연결됨, 없으면 단순 텍스트로 저장 (기존 동작과 동일)
- 롤백: 신규 테이블 3건 drop + classifier에서 V2 함수 제거
- Import 성능: 룰 컨텍스트 1회 로드 후 in-memory 매칭 → 행당 추가 비용 < 1ms

## 10. 변경 파일 요약

| 파일 | 작업 |
|---|---|
| 신규 마이그레이션 1건 | 테이블 3개 + 시드 데이터 |
| `src/lib/defect-classifier.ts` | `classifyDefectV2` + 타입 + 컨텍스트 로더 추가 |
| `src/contexts/DefectImportContext.tsx` | 분류기 호출만 V2로 교체 (우선순위 로직 그대로) |
| `src/pages/DefectDetailPage.tsx` | V2 호출 + work_type 일관성 픽스 |
| `src/pages/AdminClassificationPage.tsx` | 탭 3개 추가 |
| `src/test/defect-classifier-v2.test.ts` | 신규 테스트 파일 |
| `scripts/validate-classification-v2.ts` | 신규 분석 스크립트 |

승인 시 Phase A부터 진행하겠습니다.
