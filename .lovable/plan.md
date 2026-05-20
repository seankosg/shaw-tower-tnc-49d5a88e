# Captured By 데이터 노출 + 백필 점검

## 현상

대시보드 Captured By 섹션에 "No Captured By data available" 표시.

## 원인 진단 (DB 확인 결과)

- `defect_items` 전체 6,097 행 중:
  - `raw_payload`에 `Captured by` 키를 가진 행: **1,320 행**
  - 마이그레이션으로 백필된 `captured_by_name` (NULL 제외): **905 행**
- 팀별 백필 현황: Arch 656 / Elec 226 / **Mech 23** / Design 0
- 현재 화면(Mech 팀)에는 23명분이 있어야 하지만 **0건**으로 표시됨

→ 원인은 **클라이언트 캐시(`src/lib/defect-cache.ts`)의 `SLIM_COLUMNS`에 `captured_by_name`이 빠져있어** Supabase에서 가져오지 않기 때문. DB에는 값이 있으나 프런트엔드 메모리에 로딩되지 않음.

## 작업 계획

### 1) 캐시 select에 컬럼 추가 (핵심 수정)

`src/lib/defect-cache.ts` 의 `SLIM_COLUMNS` 배열에 `'captured_by_name'` 한 줄 추가 (`hdec_eng_name` 다음 위치).

이 한 줄 추가만으로 현재 DB에 백필된 905건이 즉시 대시보드에 표시됨.

### 2) 백필 보강 — 대소문자/공백 변형 흡수

기존 마이그레이션은 `raw_payload->>'Captured by'` 정확 매칭만 사용. 다음 변형도 합쳐서 재백필:
- `Captured By`, `CAPTURED BY`, `captured_by`, `CapturedBy` 등
- 좌우 공백 트림 후 빈 문자열은 NULL

추정 추가 백필 대상은 많지 않지만(현재 1,320행이 이미 정확 키 사용) 안전망으로 실행.

### 3) 미보유 행에 대한 안내

`raw_payload`에 어떤 형태의 Captured by 키도 없는 약 **4,777 행**은 원본 데이터 자체에 정보가 없음 (구버전 Aconex export, 초기 import 시점에 해당 컬럼이 포함되지 않음). 이 데이터는 DB 차원에서 복구 불가하며, 다음 중 하나가 필요:
- 해당 행을 **재import** (Aconex에서 Captured by 컬럼 포함하여 export 후 import)
- 또는 그대로 두고 Captured By 섹션의 "Unknown" 카운트로만 노출

이 부분은 사용자 결정 필요 — 본 작업에서는 **재import는 수행하지 않음**.

## 검증

수정 후 Mech 팀 대시보드에서 Captured By 카드 23명분 표시 + Reconciliation Row의 Unknown 카운트가 (팀 total - 23) 와 일치하는지 확인.

## 기술 메모

- `HEAVY_SELECT`는 raw_payload를 포함하므로 별도 수정 불필요
- 변경 파일: `src/lib/defect-cache.ts` 1개 + 백필용 migration 1개
