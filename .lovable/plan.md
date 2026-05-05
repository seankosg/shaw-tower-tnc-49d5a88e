## 목적

ABD(Docs) 모듈의 1st/2nd/3rd Status (`sub1/2/3_approval_status`)에 기존 A/B/C/UR 외 5번째 유효값 **WIP (Work In Progress)** 추가.

의미: "Planned와 유사 — 작업 시작했으나 아직 미완료". DB에 raw 값 `'WIP'`로 저장, Raw Data 표시·필터·Detail 입력·Overall Status 도출 모두 지원.

---

## 동작 규칙 (UR과 동일하게 처리)

- **Cycle status 도출** (`computeCycleStatus`): K=`'WIP'`이면 cycle status는 `'WIP'` (UR이 `'Under Review'` 반환하는 것과 평행)
- **Closure**: `WIP`는 종결 아님 (`computeIsClosed` 영향 없음, A만 종결)
- **Next active cycle** (`computeNextActiveCycle`): B/C에서만 다음 cycle로 진행. WIP는 같은 cycle에 머무름 (UR과 동일)
- **Auto-fill** (`applyCycleAutoFill`): B/C일 때만 다음 cycle planned_date 자동채움. WIP는 자동채움 트리거 안 함
- **Clear after closure**: 영향 없음 (A=종결만 후속 cycle 클리어)
- **All cycles exhausted**: B/C만 소진 조건. WIP는 영향 없음

---

## 변경 파일

### 1. `src/lib/docs-status.ts`
- `CycleStatus` 유니온에 `'WIP'` 추가
- `VALID_STATUS` Set에 `'WIP'` 추가
- `normStatus` 반환 타입을 `'A' | 'B' | 'C' | 'UR' | 'WIP' | null`로 확장
- `computeCycleStatus`: status === 'WIP' → return 'WIP' (UR 분기 바로 아래에 추가)
- `normalizeApprovalStatus`: 입력 `'WIP'`, `'W.I.P'`, `'W/I/P'`, `'WORK IN PROGRESS'`, `'IN PROGRESS'`, `'INPROGRESS'`, `'ONGOING'`, `'IN-PROGRESS'`를 `'WIP'`로 매핑. 반환 타입 확장
- `cycleStatusColorClasses`: `case 'WIP'` → 회색 계열 (Planned와 구분 위해 약간 진한 톤): `'bg-slate-200 border-slate-400 text-slate-700'`
- `cycleStatusGlyph`: `case 'WIP'` → `'W'`
- 파일 상단 주석 `K = approval_status ∈ {'A','B','C','UR','WIP',null}`로 갱신

### 2. `src/lib/docs-import-parser.ts`
변경 없음 — `normalizeApprovalStatus`만 통해 처리되므로 자동 지원.

### 3. `src/pages/docs/DocsRawDataPage.tsx`
- 573~575행 multi-select 필터 옵션 시드에 `'WIP'` 추가:
  ```
  ['A', 'B', 'C', 'UR', 'WIP']
  ```

### 4. `src/pages/docs/DocsDrawingDetailPage.tsx`
- 104행 `APPROVAL_STATUS_OPTIONS`에 `'WIP'` 추가:
  ```ts
  const APPROVAL_STATUS_OPTIONS = ['A', 'B', 'C', 'UR', 'WIP'];
  ```

### 5. `src/components/docs/DocsCycleProgress.tsx`
변경 없음 — `cycleStatusColorClasses`/`cycleStatusGlyph`만 사용하므로 자동 지원.

---

## DB 변경
**없음**. `sub1/2/3_approval_status`는 `text` 컬럼이고 CHECK constraint 없음 — 'WIP' 문자열 저장 즉시 가능.

---

## Overall Status 영향
`computeOverallStatus`는 `computeCycleStatus`를 호출하므로 자동으로 'WIP'를 반환할 수 있게 됨. 별도 수정 불필요. 가장 진행된 cycle이 WIP면 Overall = 'WIP'.

---

## 검증 시나리오
1. Detail 페이지에서 cycle 1 status를 'WIP'로 저장 → Raw Data에서 1st Status='WIP', Overall Status='WIP' 표시
2. Raw Data 필터에서 WIP 옵션 선택 가능
3. Import 시 셀 값 'WIP', 'In Progress', 'Ongoing' 모두 'WIP'로 정규화되어 저장
4. cycle 1=WIP 상태에서는 cycle 2 입력 비활성화 유지 (UR과 동일)
