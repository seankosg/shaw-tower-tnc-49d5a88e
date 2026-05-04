# Cycle 승인 상태에 `UR` 추가 (1차/2차/3차)

## 배경

현재 각 Cycle의 `subN_approval_status`는 `A`/`B`/`C` (또는 null)만 저장 가능합니다. "Under Review"는 `docs-status.ts`에서 *자동 계산*되는 상태일 뿐, 사용자가 직접 선택할 수 없습니다.

목표: 1차/2차/3차 각 Cycle에 대해 사용자가 **`UR`** (Under Review)을 `A`/`B`/`C`와 함께 명시적으로 선택·저장할 수 있게 합니다.

## 의미 정의

`UR`은 "결정 대기 중"을 의미합니다. 해당 Cycle은 활성 상태로 유지되고, **다음 Cycle로 넘어가지 않으며**, 도면을 **종결시키지 않습니다**.

| 저장 값 | Cycle 동작 | Overall 표시 |
|---|---|---|
| `A` | 도면 종결 | `A` |
| `B` / `C` | 다음 Cycle 활성화 | `B` / `C` |
| `UR` (신규) | Cycle 유지 (null과 동일) | `Under Review` |
| null | Cycle 유지 (날짜로 자동 판단) | 자동 계산 |

즉, `actual_response_date`가 아직 입력되지 않았어도 "검토 중"임을 명시적으로 표시할 수 있는 수동 옵션입니다.

## 변경 사항

### 1. `src/lib/docs-status.ts` (상태 엔진)

- `normStatus()` 반환 타입을 `'A' | 'B' | 'C' | 'UR' | null`로 확장하고 `VALID_STATUS`에 `'UR'` 추가
- `computeCycleStatus()`: 저장값이 `UR`이면 날짜와 무관하게 `'Under Review'` 반환
- `computeNextActiveCycle()`: `UR`은 `B`/`C`가 아니므로 기존 로직(`s !== 'B' && s !== 'C'`)에서 자동으로 "활성 Cycle 유지"로 처리됨 — 주석에 `UR` 명시
- `computeAllCyclesExhausted()`: 변경 없음 (`UR`은 소진으로 간주하지 않음)
- `clearCyclesAfterClosure()`: 변경 없음 (`A`만 하위 Cycle 정리 트리거)
- `normalizeApprovalStatus()`: 다음 입력값을 `'UR'`로 매핑
  - `'UR'`, `'U/R'`, `'U.R'`
  - `'UNDER REVIEW'`, `'UNDERREVIEW'`, `'IN REVIEW'`, `'PENDING'`, `'PENDING REVIEW'`
- 파일 상단 주석(상태 매핑표) 업데이트

### 2. `src/pages/docs/DocsDrawingDetailPage.tsx`

- `APPROVAL_STATUS_OPTIONS`를 `['A','B','C']` → `['A','B','C','UR']`로 변경

### 3. `src/lib/bulk-edit.ts`

- "A 설정 시 하위 Cycle 자동 정리" 가드는 `A`에만 반응하므로 추가 변경 불필요 — 주석으로 명시

### 4. `src/lib/import-parser.ts` / `src/lib/docs-import-parser.ts`

- 기존 import 흐름은 이미 `normalizeApprovalStatus()`를 거치므로, (1)에서 헬퍼만 확장하면 Excel의 "Under Review", "UR", "Pending" 등이 자동으로 `'UR'`로 정규화됨 — 구조적 변경 불필요

### 5. `src/components/docs/DocsCycleProgress.tsx`

- 범례에 이미 "Under Review" 표시 있음. 핍(pip) 렌더링은 계산된 `CycleStatus`를 기준으로 하므로, 저장값 `UR` → 계산값 `'Under Review'` → 기존 ◐ (sky 컬러) 핍이 자동 적용됨 — 변경 불필요

### 6. `src/pages/docs/DocsRawDataPage.tsx` (Bulk Edit 드롭다운)

- 현재 옵션은 데이터에서 `uniqueOptions(...)`로 동적 생성됨. `UR`이 어떤 행에도 없을 때도 선택할 수 있도록 `subN_approval_status` 옵션 목록에 `'UR'`을 시드로 합쳐 노출

## 작업 범위 외

- **DB 마이그레이션 없음**: `subN_approval_status` 컬럼은 free-text(`string | null`)이므로 스키마 변경 불필요
- 기존 데이터 백필 없음
- Defect / Test 모듈 변경 없음

## 변경 파일

- `src/lib/docs-status.ts`
- `src/pages/docs/DocsDrawingDetailPage.tsx`
- `src/pages/docs/DocsRawDataPage.tsx` (bulk-edit 옵션 시드)
