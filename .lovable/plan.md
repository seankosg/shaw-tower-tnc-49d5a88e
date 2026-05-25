## 목표

모든 Import 흐름(Defect, Punch/TnC, DMR, Docs(ABD/OMM/SparePart/Warranty))에서:
1. **대소문자만 다른 협력사명** → 마스터의 canonical 표기로 자동 교체 (조용히)
2. **철자가 2자 이하로 다른 협력사명** → 사용자에게 기존 마스터 후보 제안 → "Use Existing / Register New" 확인 후 진행

현재 상태:
- Defect: 둘 다 구현됨 (기준)
- DMR: 대소문자 정규화만 있음, 유사명 다이얼로그 없음
- Punch(TnC): 둘 다 없음 (바로 자동 생성)
- Docs (ABD/OMM/SparePart/Warranty): 둘 다 없음 (ensurer가 바로 생성)

---

## 1. 공통 유틸 추가 — `src/lib/master-name-match.ts`

새 헬퍼 추가 (기존 `findSimilarMasterName`는 토큰 유사도라 "철자 2자 이내" 의도와 어긋남):

- `levenshtein(a, b): number` — 표준 편집거리 계산
- `findEditDistanceMatch<T>(importedName, candidates, maxDistance = 2)` — 대소문자/공백 정규화 후 편집거리가 `1..maxDistance` 인 후보 중 최소거리 1개 반환 (거리 0은 정확 일치라 제외 — 그건 canonical 자동 교체로 처리)

이 헬퍼를 모든 모듈에서 공통 사용.

---

## 2. DMR — `src/pages/analysis/DmrImportPage.tsx`

- 기존 `normalizeSubcontractors`는 유지(대소문자 자동 교체).
- 직후, 마스터에 없는 이름들에 대해 `findEditDistanceMatch`로 유사 후보 검색.
- 유사 후보가 있으면 `<Dialog>`로 사용자에게 표 형식으로 제시:
  - Imported Name / Suggested Existing Master / [Use Existing] [Register New]
- 모든 항목 결정 후 "Continue Import" 클릭 → `Use Existing` 인 행의 `subcontractor`를 canonical 로 치환 → 이후 dedupe/insert 진행.
- `Register New` 는 그대로 두어 마스터 자동 생성됨.

---

## 3. Punch / TnC — `src/contexts/ImportContext.tsx`

`startImport` 내부, 마스터 캐시 prefetch 직후 + bulk 자동 생성 직전에 두 단계 추가:

a) **Canonical 정규화 (조용히)**  
   `subData` 로 `Map<lowerName, canonicalName>` (sub) 와 `Map<"parentLower::subsubLower", canonicalSubsub>` (subsub) 빌드 → `parsed` 행의 `subcontractor_name`, `subsub_name` 을 canonical 로 치환.

b) **유사명 사전 확인**  
   캐시에 없는 이름에 대해서만 `findEditDistanceMatch` 실행 → 후보 있는 항목을 상태로 모아 다이얼로그 표시 → 사용자 결정 후 import 재개.

Context value에 `similarDecisions`, `setDecisionAction`, `confirmSimilarDecisions`, `cancelSimilarDecisions` 추가 (Defect와 동일 인터페이스 차용).  
`PunchImportPage.tsx` 에 Defect와 동일한 Dialog UI 추가 (재사용 위해 작은 공용 컴포넌트로 분리 가능 — 우선 두 페이지에 동일 마크업).

---

## 4. Docs (ABD/OMM/SparePart/Warranty) — `src/contexts/docs-import/createDocsImportProvider.tsx`

모든 파일 import 루프가 시작되기 전 한 번:

a) `subcontractor_master` (active) 1회 prefetch → canonical 맵 생성.  
b) 모든 파일의 parsed 행의 `subcontractor_name` 대소문자 정규화 (조용히).  
c) 캐시에 없는 이름 수집 → `findEditDistanceMatch` → 후보 있는 항목들에 대해 다이얼로그 표시.  
d) 사용자가 `Use Existing` 선택한 이름은 parsed 행에 canonical 로 치환 후 진행. `Register New`는 그대로 두어 기존 `ensurer.ensureForRow` 흐름에서 자동 생성.

Factory가 4개 Provider(ABD/OMM/SparePart/Warranty)를 모두 만들기 때문에 한 번의 수정으로 4개 모듈에 동시 적용됨.

상태/액션: `similarDecisions`, `setDecisionAction`, `confirmSimilarDecisions`, `cancelSimilarDecisions` 를 context value에 추가하고, 공용 다이얼로그 컴포넌트를 Docs Import 페이지들에 노출. (Docs 4개 페이지가 동일 패턴 사용 — 다이얼로그 컴포넌트 분리 권장)

---

## 5. 공용 다이얼로그 컴포넌트 (권장)

`src/components/import/SimilarMasterDialog.tsx` 신규 — Defect 다이얼로그 마크업 그대로 이식. 4곳(Defect/Punch/DMR/Docs)에서 재사용.

---

## 기술 세부사항

- "2자 이하" = Levenshtein 거리 ≤ 2 (대소문자/앞뒤공백 정규화 후, 거리 0은 제외).
- subsub 후보 매칭은 동일 parent 범위 내에서만 (Defect 패턴과 동일).
- 정확 일치(거리 0) 자동 교체와 유사 일치(거리 1~2) 사용자 확인이 충돌하지 않도록, 정규화 → 유사검색 순서 유지.
- 기존 `findSimilarMasterName` (토큰 유사도)은 Defect의 광범위 매칭에서 이미 쓰이고 있으므로 그대로 두고, 신규 `findEditDistanceMatch`를 병행 사용 (또는 Defect도 새 헬퍼로 일원화 — 추후 결정 가능).
- Punch/Docs 다이얼로그의 결정 결과는 in-memory에서 parsed 행을 치환하는 방식이므로 추가 DB 스키마 변경 없음.

---

## 변경 파일

- `src/lib/master-name-match.ts` (헬퍼 추가)
- `src/components/import/SimilarMasterDialog.tsx` (신규, 공용)
- `src/pages/analysis/DmrImportPage.tsx`
- `src/contexts/ImportContext.tsx` + `src/pages/PunchImportPage.tsx`
- `src/contexts/docs-import/createDocsImportProvider.tsx` + 4개 Docs Import 페이지 (다이얼로그 mount)
- (선택) `src/contexts/DefectImportContext.tsx` + `src/pages/DefectImportPage.tsx` 를 공용 다이얼로그로 리팩터
