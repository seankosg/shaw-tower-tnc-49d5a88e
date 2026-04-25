# Import 시 기존 분류 값 보존 (Main Trade / Sub Trade / Work Type)

## 현재 동작 (문제점)

`src/contexts/DefectImportContext.tsx` (라인 474-481)는 매 Import 행마다:

1. 항상 `classifyDefect()`를 호출
2. **엑셀에 값이 있을 때**:
   - Main/Sub Trade → 엑셀 값 유지 ✅
   - Work Type → **항상 분류 결과로 덮어씀** ❌
3. **엑셀에 값이 없을 때**:
   - Main/Sub/Work Type 모두 → **항상 분류 결과로 덮어씀** ❌
   - DB에 기존에 분류된 값이 있어도 무시됨

→ 1차 import 후 분류된 값이 있는데, 2차 update 파일에 해당 컬럼이 비어있으면 다시 분류가 돌아 결과가 바뀔 수 있음.

## 목표 동작 (사용자 요구사항)

세 필드(Main Trade, Sub Trade, Work Type)에 대해 **동일한 우선순위**:

```
1. 엑셀에 값이 있으면      → 엑셀 값 사용
2. 엑셀에 값이 없고
   DB(기존 행)에 값이 있으면 → 기존 DB 값 유지 (재분류 안 함)
3. 둘 다 없을 때만          → classifyDefect() 결과 사용 (신규 분류)
```

## 구현 계획

### 파일: `src/contexts/DefectImportContext.tsx`

1. **분류 호출 시점을 `existing` 조회 이후로 이동**
   - 현재: 라인 474에서 분류 → 라인 495에서 `existing` 조회
   - 변경: `existing`을 먼저 조회한 뒤, 세 필드 중 **하나라도 결정 못 한 경우**에만 `classifyDefect()` 호출 (불필요한 호출 절감)

2. **세 필드 적용 로직 변경** (라인 479-481)
   ```ts
   // Main Trade
   if (!row.main_trade) {
     row.main_trade = existing?.main_trade ?? classification.main_trade;
   }
   // Sub Trade
   if (!row.sub_trade) {
     row.sub_trade = existing?.sub_trade ?? classification.sub_trade;
   }
   // Work Type ─ 핵심 변경: "항상 덮어쓰기" 제거
   if (!row.work_type) {
     row.work_type = existing?.work_type ?? classification.work_type;
   }
   ```

3. **`classification_source` / `classified_at` 처리**
   - 신규 분류가 실제로 적용된 경우(= classification 결과가 사용된 경우)에만 source/timestamp 업데이트
   - 기존 DB 값을 그대로 유지한 경우: `existing.classification_source`, `existing.classified_at` 보존
   - 엑셀 직접 입력의 경우: source = `'manual'`로 설정 (기존 분류기 enum과 일치)

4. **카운터 / 로그 로직 조정**
   - `classifiedRule`, `classifiedDiscipline`, `unclassified` 카운터 및 `defect_upload_row_logs` 기록은 **이번 Import에서 신규로 분류가 발생한 행만** 집계
   - 기존 값을 보존한 행은 분류 로그를 남기지 않음 (불필요한 로그 방지)

### 영향 범위

- **변경 파일 (1개)**: `src/contexts/DefectImportContext.tsx`
- **DB 스키마 변경**: 없음
- **다른 분류 진입점 (Detail 화면 Auto-classify)**: 영향 없음 — 사용자가 명시적으로 클릭하는 동작이므로 그대로 둠

### 테스트 시나리오

1. 1차 Import: Work Type 비어있음 → 분류기로 채워짐, DB 저장
2. 2차 Import: 동일 issue, Work Type 비어있음 → **DB 값 유지**, 재분류 안 됨
3. 3차 Import: 동일 issue, Work Type에 "Door Adjustment" 명시 → 엑셀 값으로 업데이트
4. 신규 issue, 모든 필드 비어있음 → 분류기로 채워짐 (기존과 동일)
5. Main/Sub Trade도 동일한 우선순위로 동작 확인

## 사용자가 보게 될 차이

- 같은 issue를 반복 import할 때 분류 값이 흔들리지 않음
- 분류 규칙(Admin)을 나중에 바꿔도, 이미 분류된 기존 행은 영향받지 않음 (의도된 동작)
- 새 분류를 강제로 다시 돌리고 싶다면 → Detail 화면의 "Auto-classify" 버튼 사용 (기존 그대로)
