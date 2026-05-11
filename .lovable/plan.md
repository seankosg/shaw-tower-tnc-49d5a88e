## OMM 워크플로우 전환: Draft/Final → Sub1/Sub2/Sub3/Final

새 SHAW 양식이 ABD와 동일한 다중 재제출(resubmission) 모델로 변경됨에 따라, OMM 모듈을 Draft 단일 사이클에서 **Sub1 → Sub2 → Sub3 → Final** 4단계 모델로 전환.

---

## Phase 1 — Database Schema (migration)

### `docs_omm` 테이블에 14개 컬럼 추가 (기존 draft_* 4개는 보관)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| sub1_planned_date | date | 1st Submission Planned |
| sub1_actual_date | date | 1st Submission Actual |
| sub1_response_date | date | 1st Response Date by PQ |
| sub1_response_status | text | 1st Response Status (A/B/C) |
| sub2_planned_date | date | 2nd Planned Submission |
| sub2_actual_date | date | 2nd Actual Submission |
| sub2_response_planned_date | date | 2nd Planned Response |
| sub2_response_actual_date | date | 2nd Actual Response |
| sub2_response_status | text | 2nd Response Status |
| sub3_planned_date | date | 3rd Planned Submission |
| sub3_actual_date | date | 3rd Actual Submission |
| sub3_response_planned_date | date | 3rd Planned Response |
| sub3_response_actual_date | date | 3rd Actual Response |
| sub3_response_status | text | 3rd Response Status |

기존 `final_planned_date`, `final_actual_date`, `final_response_planned_date`, `final_response_actual_date`, `final_response_status` 5개는 그대로 유지.

기존 `draft_planned_date / draft_actual_date / draft_response_date / draft_response_status` 4개는 **deprecated 표시(주석)만 하고 컬럼은 보존**. 데이터 마이그레이션 없음. 코드에서는 더 이상 참조하지 않음.

### `docs_field_config` (sub_module='omm') 시드 갱신
- 기존 `draft_*` 4개 행: `is_enabled=false`로 비활성화 (UI에서 숨김)
- 신규 14개 행 INSERT: sort_order 재정렬 (sub1 → 165~168, sub2 → 169~173, sub3 → 174~178, final은 기존 210~250 유지)
- display_name은 파일과 일치: "1st Submission Planned", "1st Response Status" 등

### `import_header_mappings` (module='docs', sub_module='omm') 시드 추가
파일에 보이는 14개 + 변형까지 약 30개 alias INSERT (예: `1st submission planned`, `1st sub planned`, `2nd planned submission`, `2nd planned response` 등).

---

## Phase 2 — Import Parser (`src/lib/docs-omm-import-parser.ts`)

### `normalizeHeader()` 보강
- **괄호 제거**: `s.replace(/\s*\([^)]*\)\s*/g, ' ')` → `Readible PDF (Req)` 등 처리
- **서수 정규화**: `1st / 2nd / 3rd` → `sub1 / sub2 / sub3` 토큰
- **"submission" 키워드는 제거하지 않음** (Sub1 사이클에서는 의미 있음). 현재 로직 수정 필요

### `FALLBACK_ALIASES` 확장
14개 새 필드에 대응하는 alias 추가:
- `sub1 planned`, `sub1 actual`, `sub1 response`, `sub1 response status` …
- `1st response date by pq` → `sub1_response_date`
- `2nd planned response`, `2nd actual response` → `sub2_response_planned_date`, `sub2_response_actual_date`
- 동일하게 sub3 / final도 `submission planned/actual` 키워드 매핑

### Stage / Status 등 시스템 컬럼 skip
`'stage': 'skip'` 추가 (현재 미등록).

---

## Phase 3 — Status & Stage 계산 (`src/lib/docs-omm-status.ts`)

### 새 OMMStatus 토큰
```
'Pending Sub1' | 'Sub1 Under Review'
'Pending Sub2' | 'Sub2 Under Review'
'Pending Sub3' | 'Sub3 Under Review'
'Pending Final' | 'Final Under Review'
'Approved' | 'Rejected'
```

### 계산 규칙 (높은 우선순위 → 낮은)
1. `final_response_status` = A → **Approved**
2. `final_response_status` = B/C → **Rejected**
3. `final_actual_date` 있고 status 없음 → **Final Under Review**
4. `final_planned_date` 있고 actual 없음 → **Pending Final**
5. `sub3_response_status` = A → **Pending Final**
6. `sub3_response_status` = B/C → **Pending Final**(재제출 만료) — 또는 Rejected? (확정 필요시 후속)
7. `sub3_actual_date` 있고 status 없음 → **Sub3 Under Review**
8. `sub2_response_status` = A → **Pending Final** (스킵 허용); = B/C → **Pending Sub3**
9. `sub2_actual_date` 있고 status 없음 → **Sub2 Under Review**
10. `sub1_response_status` = A → **Pending Final** ; = B/C → **Pending Sub2**
11. `sub1_actual_date` 있고 status 없음 → **Sub1 Under Review**
12. else → **Pending Sub1**

### `computeOmmStage()` 토큰 변경
`'Sub1' | 'Sub2' | 'Sub3' | 'Final' | 'Closed'`로 교체.

---

## Phase 4 — UI (Detail / RawData / Cycle Progress)

### `src/pages/docs/DocsOMMDetailPage.tsx`
- Draft 카드 섹션 제거 → **Sub1 / Sub2 / Sub3 / Final** 4개 카드 섹션으로 교체
- 각 카드는 해당 사이클 컬럼들(planned/actual/response_*/status) 인라인 편집
- Stage progress 헤더 표시 갱신

### `src/pages/docs/DocsOMMRawDataPage.tsx`
- 컬럼 정의에서 `draft_*` 4개 제거 (혹은 hidden), `sub1_*`/`sub2_*`/`sub3_*` 14개 컬럼 추가
- 정렬/필터 메뉴도 새 필드 키로 갱신
- Bulk action(`OmmBulkActionBar`, `omm-bulk-actions.ts`) 일괄 업데이트 대상에서 `draft_*` 제거, 새 필드 옵션 추가

### `src/components/docs/OmmCycleProgress.tsx`
- 현재 Draft → Final 2-스텝 막대를 **Sub1 → Sub2 → Sub3 → Final** 4-스텝 막대로 재설계
- 각 스텝 상태(Planned / WIP / Done / Delayed)는 `classifyOmmStageState()` 신규 함수로 산출 (warranty 패턴 참고)

### Dashboard (`src/lib/docs-dashboard-data.ts`, `src/lib/docs-executive-dashboard-data.ts`)
- OMM 단계 카운트 로직을 새 토큰(Pending Sub1 등) 기반으로 갱신
- Stage funnel: Draft, Final → Sub1, Sub2, Sub3, Final 5개(Approved 포함)
- `OMM_STAGES` 상수도 갱신

### Import 워커 (`src/lib/docs-import-workers.ts`)
- OMM upsert 컬럼 화이트리스트에 새 14개 필드 추가
- excludedFields 처리 동일 패턴

### 변경 로깅 (`src/contexts/docs-import/OmmImportContext.tsx` + Detail save)
- TRACKED_FIELDS 배열에 14개 새 필드 추가 (이전 Warranty 패턴과 동일)

### Excel export (`src/lib/omm-excel-export.ts`)
- 컬럼 헤더와 출력값을 새 사이클 모델로 갱신 (양식과 동일하게 36열 출력)

---

## Phase 5 — 정리 항목 (코드만, 데이터 손실 없음)
- `docs-omm-import-parser.ts`의 `draft_*` 직접 매핑 alias 12개는 fallback에서 삭제 (DB 컬럼은 유지하지만 신규 import는 더 이상 채우지 않음)
- `docs_field_config`의 draft_* 4개 row는 비활성화 상태로 유지 → 추후 데이터가 없음을 확인하면 별도 cleanup migration

---

## 영향 받는 파일 요약 (총 ~16개)

**라이브러리**
- `src/lib/docs-omm-status.ts` — 전면 재작성
- `src/lib/docs-omm-import-parser.ts` — normalizer + aliases 확장
- `src/lib/docs-import-workers.ts` — upsert 화이트리스트
- `src/lib/docs-dashboard-data.ts` / `docs-executive-dashboard-data.ts` / `docs-stage-records.ts` — OMM 단계 정의
- `src/lib/omm-excel-export.ts` — 신규 컬럼 export
- `src/lib/omm-bulk-actions.ts` — 새 필드 일괄 편집

**페이지/컴포넌트**
- `src/pages/docs/DocsOMMDetailPage.tsx`
- `src/pages/docs/DocsOMMRawDataPage.tsx`
- `src/components/docs/OmmCycleProgress.tsx`
- `src/components/raw-data/OmmBulkActionBar.tsx`

**컨텍스트/훅**
- `src/contexts/docs-import/OmmImportContext.tsx`
- `src/hooks/useDocsFieldConfig.ts` (캐시 무효화 정도)

**DB 변경 (migration)**
1. `ALTER TABLE docs_omm ADD COLUMN ...` × 14
2. `INSERT INTO docs_field_config ...` 신규 14행 + 기존 draft_* 4행 `is_enabled=false`
3. `INSERT INTO import_header_mappings ...` 약 30 alias

---

## 진행 순서 권장
1. **Phase 1 migration 먼저** (사용자 승인) → 컬럼/seed 확보
2. Phase 2~3 (Parser + Status) — 데이터 들어오기 시작
3. Phase 4 (UI 전환) — 화면 동기화
4. Phase 5 (정리)

이 plan 승인 시 Phase 1 migration부터 작성합니다.
