## 목적

엑셀 Punch Import에서 `3_1`, `3.1` 같은 표기를 Subtask로 자동 인식하여 Parent와 연결하고, 부모 행이 없으면 빈 Summary 행을 자동 생성한다. Stage 컬럼은 값이 있을 때만 검증/적용한다.

## 변경 범위

대상: `src/lib/punch-excel-utils.ts` 1개 파일만 수정 (DB 스키마/기타 컴포넌트 변경 없음).

## 1. Item No 정규화 + Subtask 자동 인식

Parse 단계(`parsePunchWorkbook`, line 197-254)에서 `item_no` 값 처리 직후 다음 로직 추가:

```text
parseSubtaskItemNo(raw):
  - "<base><sep><child>" 패턴 매칭 (sep = "_" 또는 ".")
    · base: 영문/숫자 혼합 허용 (예: "3", "Elec-001", "M-12")
    · child: 숫자 1개 이상
  - 매칭 시 → { itemNo: `${base}.${child}`, parentItemNo: base }
  - 매칭 안 되면 → { itemNo: raw, parentItemNo: null }
```

규칙:
- `3_1` → `item_no="3.1"`, `parent_item_no="3"`
- `3.1` → `item_no="3.1"`, `parent_item_no="3"` (그대로 + parent 자동 추출)
- `Elec-001_2` → `item_no="Elec-001.2"`, `parent_item_no="Elec-001"`
- 엑셀에 이미 `parent_item_no` 컬럼이 들어와 있으면 **엑셀 값 우선**, 자동 추출은 덮어쓰지 않음

## 2. Stage 컬럼 엄격 검증

현재 `subtask_stage`는 enum이라 값이 매칭 안 되면 조용히 무시된다. 다음과 같이 변경:

- enum 처리 분기(line 217-224)에서 `field === 'subtask_stage'`인 경우 별도 처리
- 허용 값: `pre_engineering`, `physical_work`, `inspection` (대소문자/공백 무시, 약어 `PE`/`PW`/`IN`도 허용)
- 빈 값/없음 → 그대로 통과 (null)
- 매칭 실패 → row를 **reject**하고 `errors`에 `Invalid Subtask Stage: "<value>" (allowed: pre_engineering, physical_work, inspection)` 추가

## 3. 빈 Summary 자동 생성

`upsertPunchRows` 2nd pass(line 470-511)에서 부모를 찾지 못한 경우 현재는 "Parent not found — link skipped" 에러를 띄우는데, 이를 다음으로 변경:

```text
for (childNo, parentNo) of parentRefByItemNo:
  parent = idByItemNo.get(parentNo)
  if !parent:
    // 빈 Summary 자동 INSERT
    insert punch_items {
      project_id, item_no: parentNo,
      outstanding_work: parentNo,   // 최소값 (필수 컬럼)
      is_summary: true,
      data_source_type: 'auto_generated',
      source_upload_id, created_by: opts.updatedBy,
      updated_by: opts.updatedBy,
    }
    → 새 id를 idByItemNo에 등록
    → result.inserted++
    → pushRowLog(null, parentNo, 'inserted', 'auto_summary', `Auto-created parent for ${childNo}`)
  // 이후 기존대로 child.parent_id = parent.id 연결 + is_summary 승격
```

엣지 케이스:
- 같은 부모를 여러 child가 참조 → 부모는 1번만 생성 (idByItemNo 캐시로 처리)
- 같은 import 배치에 부모도 명시적으로 들어와 있는데 자식이 먼저 처리됐을 때 → 1st pass에서 이미 부모가 INSERT 됐으므로 2nd pass refRows 조회에 포함됨 (현재 로직 그대로)

## 4. 검증 시나리오

| 입력 Item No | 결과 item_no | parent | 비고 |
|---|---|---|---|
| `3` | `3` | (없음) | 일반 행, 자식이 생기면 자동 Summary 승격 |
| `3_1` | `3.1` | `3` | parent `3` 없으면 자동 생성 |
| `3.2` | `3.2` | `3` | 동일 |
| `Elec-001_2` | `Elec-001.2` | `Elec-001` | prefix 유지 |
| `3_1_2` | `3_1.2` | `3_1` | 마지막 segment만 분리 (그래도 parent `3_1` 자동 생성) |
| Stage = `physical_work` | 적용 | - | OK |
| Stage = `PW` | 적용 | - | 약어 허용 |
| Stage = `완료` | **reject** | - | 에러 로그 |
| Stage = 빈칸 | null | - | 통과 |

## 5. 미변경

- DB 스키마, RLS, types.ts 변경 없음
- Detail/RawData/Export UI 변경 없음 (이미 `parent_id` / `is_summary` 기반으로 동작)
- `add_punch_subtask` RPC 변경 없음 (수동 추가 흐름은 영향 없음)
