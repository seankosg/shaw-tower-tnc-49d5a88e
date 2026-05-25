# Punch Raw Data — Summary Task / Subtask (Phase 1 진행 중)

## 완료 (이번 단계)
- Import/Export 계층 컬럼 round-trip 완료
  - Export: `Parent Item No`, `Subtask Stage`, `Is Summary`, `Manual Override Fields` 자동 산출 + Summary→자식 정렬, 스키마 버전 `punch-v2-hierarchy`로 표기
  - Import: `Parent Item No` 헤더 인식 → 2-pass linking (자식 `parent_id` 연결 + 부모 자동 `is_summary=true` promote), 자기참조/3단계 부모는 에러로 기록 후 스킵
- `migrate_existing_punch_to_groups` 함수 UUID 집계 버그 수정
- 현재 SHAW 프로젝트(168 rows) dry-run 결과: dot 패턴 item_no 없음 → 자동 그룹핑 대상 0건. UI에서 수동 "Convert to Summary & Add Subtask"로 진행 권장

## 다음 단계 후보
- Dashboard / KPI / Recovery Priority에서 Summary 처리 정책 (자식 합산 vs Summary % 사용)
- Bulk Edit에 Override 일괄 진입/해제 액션
- Import 시 `Manual Override = Y` 컬럼으로 명시적 Override 진입 (현재 미구현)

---

# Punch Raw Data — Summary Task / Subtask 도입 계획 (확정본 v2)


## 0. 확정된 의사결정
1. 계층 깊이: **2단계 고정** (Summary → Subtask). 손자 금지.
2. 부모-자식 **팀 불일치 허용** (협업 현장 반영). RLS는 행 단위로 각자의 team으로 평가.
3. 자식 0개 시 부모 **자동 demote** (is_summary=false).
4. 기존 데이터 비슷한 prefix는 **자동 묶음** 변환.
5. 첫 자식 복제 weight = **1.0**.
6. **Summary는 언제든 수동 Override 가능** — Override된 필드는 시각적으로 명시.
7. Dashboard / KPI 영향은 **다음 단계**.

---

## 1. Subtask Stage (3단계)
| Stage | 의미 |
|---|---|
| `pre_engineering` | 4개 게이트 후속 액션 (Material/Drawing/MOS Approval, Procurement) |
| `physical_work` | 실제 시공 |
| `inspection` | 최종 확인 / Walk-down / Handover |

각 자식은 정확히 1 Stage. Summary 행은 Stage별 요약 상태(`stage_status` JSON)와 stage_pct 보유 → 행 우측에 3-Stage 미니바.

Stage Status: `not_started` / `in_progress` / `done` / `blocked`.

---

## 2. Summary Override 모델 (신규 핵심)

### 2-1. 원칙
- Summary 행의 모든 rollup 가능 필드(`actual_progress_pct`, `planned_progress_pct`, `planned_start_date`, `actual_start_date`, `planned_completion_date`, `actual_completion_date`, 각 gate status/date, `health_status`, `pre_engineering_ready`, `stage_status`)는 **기본은 자식에서 자동 계산**.
- 사용자가 Summary 화면에서 해당 필드를 직접 수정하면 → **그 필드만** Override 상태로 잠기고, 이후 자식이 바뀌어도 trigger가 그 필드는 건드리지 않음.
- 다른 필드는 계속 자동 rollup.

### 2-2. 저장 방식: `override_fields jsonb`
Summary 행에 컬럼 추가:
```
override_fields jsonb NOT NULL DEFAULT '{}'::jsonb
-- 예: { "actual_progress_pct": { "by": "uuid", "at": "2026-05-25T...", "value": 78.5 },
--       "actual_completion_date": { "by": "...", "at": "...", "value": "2026-06-30" } }
```

### 2-3. Override 진입/해제
- **진입**: UI에서 필드 편집 → 저장 시 백엔드가 자동으로 `override_fields[field]` 기록.
- **해제 (Revert to auto)**: 각 Override 필드 옆 작은 ↺ 버튼 → 해당 키 삭제 + trigger 강제 재실행 → 자동 계산값으로 복귀.
- **일괄 해제**: Summary 카드 상단 "Revert all overrides to auto" 액션.

### 2-4. 트리거 동작
- `trg_punch_rollup` 이 부모를 다시 계산할 때, `override_fields`에 키가 있는 필드는 **건너뜀**.
- `stage_status` 전체가 override된 경우는 거의 없으므로 stage별 부분 override는 1단계에서 지원 안 함 (전체 `stage_status` override만).

### 2-5. 시각 표시 (필수)
- Raw Data 테이블의 Summary 행에서 override된 셀:
  - 좌측에 작은 **● 주황 dot** + 셀 우상단에 `M` (Manual) 배지
  - 배경에 옅은 주황 톤 (semantic token `--override-bg` 신규 추가)
- Summary 행 자체에 override가 1개 이상이면 행 우측에 **"Manual" 칩** (주황 outline).
- Detail Page의 Summary:
  - 각 입력 필드 우측에 작은 배지 `Auto` (기본) / `Manual` (override 중)
  - Manual 배지에 hover 시 tooltip: "Overridden by {user_name} at {datetime}. Click ↺ to revert."
  - 배지 옆 ↺ 버튼으로 즉시 revert.
- Export Excel:
  - Override 셀에 주황색 배경 + 셀 노트(comment)에 "Manual override by {user} at {datetime}" 기록.
- Import:
  - Summary 행 import 시 값이 명시되어 있으면 → 그 필드는 override로 진입 (`override_fields`에 자동 기록, source = "import").
  - 비어 있으면 → override 해제로 간주하지 않음 (기존 상태 유지).

### 2-6. 권한
- Override 진입/해제는 일반 UPDATE 권한과 동일 (D.Super User는 자기 팀 Summary만).
- Guard 트리거는 **override를 통해서만** Summary의 rollup 필드 수정 허용 (즉, 항상 `override_fields`에 메타가 같이 기록되어야 UPDATE 통과). UI는 이 흐름을 자동 처리.

---

## 3. 데이터 모델 변경

### `punch_items` 추가 컬럼
- `parent_id uuid REFERENCES punch_items(id) ON DELETE SET NULL`
- `is_summary boolean NOT NULL DEFAULT false`
- `subtask_stage subtask_stage_enum NULL`
- `stage_status jsonb NULL`
- `override_fields jsonb NOT NULL DEFAULT '{}'::jsonb`

### 신규 enum
```
CREATE TYPE subtask_stage_enum AS ENUM ('pre_engineering','physical_work','inspection');
```

### 제약
- 2단계 강제 (depth_guard trigger).
- Summary는 `subtask_stage = NULL`, 자식은 NOT NULL.
- `override_fields`는 Summary 외 행에서는 비어 있어야 함 (check).

---

## 4. 트리거 / 함수

1. **`trg_punch_rollup`** — INSERT/UPDATE/DELETE on punch_items
   - 부모 자식들로부터 stage_status, 가중 % 등 재계산
   - `override_fields`에 등록된 키는 건너뜀
2. **`trg_punch_auto_demote`** — DELETE 후 자식 0이면 부모 일반행 복귀 + `override_fields = '{}'`
3. **`trg_punch_summary_guard`** — Summary UPDATE 시
   - 사용자가 rollup 필드를 변경하려면 같은 UPDATE에 `override_fields`의 해당 키도 함께 갱신되어야 통과
   - 단순 메타 필드(`outstanding_work`, `team`, `remarks`, `location`)는 자유 수정
4. **`trg_punch_depth_guard`** — 3단계 INSERT/UPDATE 차단
5. **RPC `add_punch_subtask(parent_id, payload, stage)`** — 첫 호출 시 promote + 첫 자식 복제
6. **RPC `override_summary_field(summary_id, field, value)`** — UI에서 명시적 override 진입 (메타 기록 포함)
7. **RPC `revert_summary_field(summary_id, field)`** — `override_fields`에서 키 제거 + rollup 강제 재실행
8. **일회성 `migrate_existing_to_groups()`** — prefix 패턴 기반 자동 묶음 (dry-run 후 적용)

---

## 5. UI 변경

### 5-1. Raw Data 테이블 (`PunchRawDataPage.tsx`)
- expand chevron, Summary 굵게 + 좌측 액센트.
- Summary 행 우측 3-Stage 미니바 + override 있으면 "Manual" 칩.
- Override된 셀: 주황 배경 + 코너 `M` 배지.
- 자식 행 들여쓰기 + Stage 뱃지.
- 정렬: Summary → 자식(stage 순 → item_no).
- 케밥: "Convert to Summary & Add Subtask" / "Add Subtask" / "Change Stage" / "Detach from parent" / "Revert all overrides" (Summary에만).

### 5-2. `AddPunchSubtaskDialog` (신규)
- **Stage** radio (필수)
- Outstanding Works (필수), Location, Work Type, Main Trade
- Team (부모와 달라도 OK — 안내)
- Planned Start / Completion, Weight (1.0), Remarks
- Stage=pre_engineering 선택 시 어느 게이트인지(Material Approval/Procurement/Drawing/MOS) 선택 → 자식의 해당 gate 컬럼 자동 pending

### 5-3. Detail Page (`PunchDetailPage.tsx`)
- 헤더: 자식이면 "Parent: …" 링크 / Summary면 "Summary" 배지 + override 개수.
- Summary일 때 rollup 필드 입력칸:
  - 우측에 `Auto` 또는 `Manual` 배지 + ↺ revert 버튼
  - 직접 입력하면 즉시 Manual로 전환 (저장 시 RPC로 override 등록)
- Summary 페이지 하단에 자식 리스트를 **Stage별 3 섹션**으로 분리 표시.

### 5-4. Bulk Edit
- Summary 행은 bulk 진행률/일자/게이트 업데이트 대상에서 제외 (override 무차별 진입 방지). Override 전용 별도 bulk action은 다음 단계.

---

## 6. Import / Export

### Import (`import-parser.ts`)
- 신규 헤더: `Parent Item No`, `Subtask Stage`, `Manual Override` (선택, 'Y' 시 그 행의 값 필드를 모두 override로 진입).
- `Parent Item No` 있으면 자식으로, 부모 자동 promote.
- Summary 행에 값이 채워져 있고 `Manual Override = Y` → 명시적 override.
- 호환성: 기존 헤더만 있는 파일은 그대로 동작.

### Export (`punch-excel-export.ts`)
- 컬럼 추가: `Parent Item No`, `Subtask Stage`, `Level Depth`, `Manual Override Fields` (override된 필드명 콤마 결합).
- Summary→자식 순으로 정렬.
- Override 셀에 주황 배경 + cell note.

---

## 7. Field Registry (`punch-field-registry.ts`)
신규 필드 항목: `parent_item_no` (export-only), `subtask_stage` (enum), `is_summary` (readOnly bool), `override_fields` (readOnly jsonb, export label "Manual Override Fields").
`punch_field_config` 기본 enabled로 seed.

---

## 8. RLS 요약
- SELECT 기존 정책 유지.
- INSERT 자식: 자식 행의 team이 본인 권한 안. 부모 team은 무관.
- UPDATE: 각 행 team 기준. Summary 행 rollup 필드는 guard trigger 통과 필요.
- Override RPC는 SECURITY DEFINER로 정의하되 내부에서 `has_role` + team 체크 수행.

---

## 9. 작업 순서
1. DB 마이그레이션 1 (enum, 컬럼, 인덱스, 제약)
2. DB 마이그레이션 2 (trigger 5개 + RPC 3개 + migration 함수)
3. 기존 데이터 dry-run 후 자동 묶음 실행
4. Field registry / field_config seed
5. Raw Data 테이블 UI (expand, 들여쓰기, 3-Stage 미니바, Override 시각화)
6. AddPunchSubtaskDialog
7. Detail Page Summary/자식 분기, Override 배지 + ↺ revert UI
8. Bulk Edit Summary 제외 가드
9. Import / Export 신규 컬럼 + round-trip 테스트
10. (다음 단계) Dashboard / KPI / Recovery Priority의 Summary 처리

---

## 10. 사용 흐름 (비기술)
1. 일반 행 케밥 → "Convert to Summary & Add Subtask" → 원본이 첫 자식(Physical Work)로 복제됨.
2. "Add Subtask"로 자식 계속 추가, 각자 Stage 선택.
3. 자식 진행률 입력 시 Summary % / 3-Stage 미니바 실시간 갱신.
4. 사용자가 Summary 행의 % 또는 날짜를 직접 손으로 입력하면 **그 칸만** Manual로 잠김 + 주황 배지 표시.
5. Manual 칸 옆 ↺ 누르면 자동값으로 복귀.
6. 자식이 모두 삭제되면 Summary는 일반 행으로 자동 복귀(override 메타도 초기화).

---

## 11. 위험 및 대응
- Override 남용 → Summary가 자식과 동떨어진 값 유지: 행에 "Manual" 칩을 항상 노출 + Detail 페이지 상단에 override 개수 카운터.
- 자동 묶음 오인식 → 마이그레이션 dry-run 결과를 임시 테이블에 남기고 검수 후 적용.
- Guard trigger 우회 시도(직접 UPDATE) → trigger에서 `override_fields` 동시 갱신 강제, 위반 시 raise exception.
- Import에서 의도치 않은 override 진입 → `Manual Override` 컬럼이 명시되어야만 override 등록. 그 외에는 기존 자동값 유지.
