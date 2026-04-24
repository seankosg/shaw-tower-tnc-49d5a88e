## Defect Re-import (Round-trip) 기능 추가

### 목표
Defect Raw Data에서 export한 엑셀을 사용자가 수정 후 다시 import하면, 시스템이 이를 자동으로 감지하여 기존 row를 update하는 워크플로우를 구현합니다.

### Team 처리 규칙 (통합)
**모든 import (최초/재import 공통)**
- 엑셀에 Team 값이 있으면 → 그대로 사용
- 엑셀에 Team 값이 비어있으면 → Field Discipline 기반 자동 계산 (기존 로직)
- 앱 UI에서는 권한에 따라 사용자가 직접 수정/저장 가능 (기존 동작 유지)

즉, **"엑셀에 명시된 값이 있으면 우선"** 이라는 단일 규칙으로 단순화.

---

### 변경 내용

#### 1. Export 측 (`src/lib/defect-excel-export.ts`)
- Export Dialog에 **Format** 옵션 추가:
  - **View-friendly** (현재 동작): 사람이 읽기 좋은 표시값
  - **Re-import ready** (신규): 다시 import 가능한 raw 형식
- Re-import ready 모드:
  - 첫 행에 hidden marker: `[Format: SHAW_DEFECT_REIMPORT_V1]`
  - 고정 식별자 컬럼 포함: `id`, `issue_no`, `subcontractor_issue_no`
  - 날짜: `YYYY-MM-DD` raw 형식
  - 진행률: 0–100 숫자값 (`%` 미포함)
  - Team: 짧은 코드값 (`Mech`/`Elec`/`Arch`/`Supp`)
  - 메타데이터 블록에 "Re-import ready" 표시

#### 2. Parser 측 (`src/lib/defect-parser.ts`)
- Re-import marker 자동 감지 → `ParseDefectResult.isReimport` 플래그 추가
- Header 스캔 범위 10행 → 20행으로 확대 (메타데이터 블록 대응)
- "ID" / "Subcontractor Issue No" 헤더를 내부 필드로 매핑

#### 3. Import 로직 (`src/contexts/DefectImportContext.tsx`)
- File 객체에 `isReimport: boolean` 추가
- **Update-only 모드** (re-import일 때):
  - `id` 우선 → 없으면 `issue_no`로 기존 row 매칭
  - 매칭 실패 row는 reject (`reason_code: 'reimport_not_found'`)
  - 신규 insert 금지 (실수로 issue_no 변경 시 중복 생성 방지)
- **Last-write-wins**: 파일 값이 항상 우선 (row_version 충돌 검사 없음)
- **Team 처리** (최초/재import 공통 규칙):
  ```ts
  const teamValue = row.team_from_excel 
    ? row.team_from_excel 
    : computeTeamFromDiscipline(row.field_discipline);
  ```
- 자동 계산 필드 (`completion_status`, `closure_status`, 진행률 등)는 update 후에도 재계산 (기존 로직 유지)
- `defect_change_log` / `defect_schedule_change_audit` 정상 기록

#### 4. UI 업데이트
- **Export Dialog** (`src/pages/DefectRawDataPage.tsx`): RadioGroup에 Format 옵션 추가
- **Import Page** (`src/pages/DefectImportPage.tsx`):
  - Re-import 파일 감지 시 파일 항목에 `Re-import (Update only)` 배지
  - 안내 문구: "기존 row를 update합니다. 새 row는 생성되지 않습니다."

---

### 검증 기준
```text
1. View-friendly export → 기존과 동일한 형식
2. Re-import ready export → 헤더 marker + raw 값 포함
3. Re-import 파일 import → marker 감지 → Update-only 모드
4. 엑셀에 Team='Elec' → DB에 'Elec' 저장 (자동 계산 무시)
5. 엑셀 Team 비어있음 → Field Discipline에서 자동 계산
6. 최초 import에서도 엑셀에 Team 값 있으면 그대로 사용
7. issue_no가 DB에 없는 row → reject (insert 안 함)
8. 변경 필드는 defect_change_log에 정상 기록
9. UI에서 사용자 수동 Team 수정 → 권한대로 정상 동작
```

### 영향 파일
```text
EDIT  src/lib/defect-excel-export.ts
EDIT  src/lib/defect-parser.ts
EDIT  src/contexts/DefectImportContext.tsx
EDIT  src/pages/DefectImportPage.tsx
EDIT  src/pages/DefectRawDataPage.tsx
```

### 변경하지 않는 항목
- DB schema / migration (불필요)
- RLS 정책
- 기존 view-friendly export의 형식
- UI 수동 편집 권한 로직
- Subcontractor Issue No 자동 부여 규칙
