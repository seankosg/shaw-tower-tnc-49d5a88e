
# Raw Data 일괄(Bulk) 편집 기능

Defect Raw Data 와 Subtest Raw Data 두 화면에서, 체크박스로 다수 행을 선택한 뒤 **하나의 필드를 한 번에 동일 값으로 수정**할 수 있도록 합니다.

## 사용자 흐름

```text
1. Raw Data 페이지 진입
2. 좌측 첫 컬럼에 행 체크박스 + 헤더의 "전체 선택"(현재 필터 결과 한정)
3. 1개 이상 선택되면 상단에 sticky 액션바 표시:
   "N개 선택됨   [필드 선택 ▼] [새 값 입력]   [Apply] [Clear]"
4. Apply 클릭 → 확인 다이얼로그(영향 행 수, 변경 전/후 미리보기 5건) → 일괄 업데이트
5. 변경 이력 자동 기록 (defect_change_log / subtest_change_log)
6. 토스트로 성공/실패 건수 표시 후 데이터 자동 새로고침
```

## 편집 가능 필드 (화이트리스트)

권한별로 무분별한 일괄 변경을 막기 위해, **드롭다운/카테고리형 + 운영 필수 필드**만 허용합니다.

### Defect Raw Data
- 분류: `team`, `main_trade`, `sub_trade`, `work_type`, `priority`, `defect_type`
- 담당: `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
- 상태: `status`, `closure_status`, `completion_status`
- 일정: `planned_start_date`, `planned_completion_date`, `planned_closure_date`,
  `actual_start_date`, `actual_completion_date`, `actual_closure_date`
- 메모: `remarks`, `hdec_comments`

> `issue_no`, `subcontractor_issue_no`, `id`, `created_at`, `updated_at`, 자동 분류 결과(`classification_source`, `classified_at`) 등 시스템 식별/감사 필드는 **불가**.

### Subtest Raw Data
- 담당: `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `team`
- 상태: `t1_status`, `t2_status`, `pred_status`
- 일정: `t1_planned_date`, `t1_actual_date`, `t2_planned_date`, `t2_actual_date`,
  `pred_planned_date`, `pred_actual_date`
- 메모: `remarks`, `punchlist_comments`

## 입력 컨트롤 (필드 타입에 따라 자동 전환)

- **multi-select 옵션 필드** (예: subcontractor, team, status) → `Select` 드롭다운 (기존 옵션 + "(Blank)로 비우기" 옵션 포함)
- **날짜 필드** → `Input type="date"` + "비우기" 토글
- **텍스트 필드** (remarks, comments) → `Textarea` + "비우기" 토글

값을 비우는 동작은 `null`로 명시 저장합니다.

## 권한

- 기본: `admin`, `superuser`, `senior_user`, `user` 모두 일괄 편집 가능 (개별 편집과 동일 정책)
- RLS가 거부하는 행(예: 권한 없는 subtest)은 자동으로 실패 카운트로 분리, 토스트에 "성공 N / 거부 M" 표시

## 안전장치

- **상한**: 한 번에 최대 500건. 초과 시 차단 메시지.
- **확인 다이얼로그 필수**: 영향 행 수, 변경 필드, 새 값, 샘플 5행의 before/after 표시.
- **변경 이력 자동 기록**: 행마다 한 줄씩 `defect_change_log`/`subtest_change_log`에 기록 (`change_source = 'bulk_edit'`).
- **빈 값 방지**: 새 값을 입력하지 않고 Apply 누르면 에러.
- **선택 상태 보존 정책**: 페이지 새로고침/필터 변경 시 선택 해제(혼동 방지).

## 기술 구현

### 1. 공통 컴포넌트 (신규)
- `src/components/raw-data/BulkEditBar.tsx` — sticky 상단 액션바
- `src/components/raw-data/BulkEditDialog.tsx` — 확인/미리보기 다이얼로그
- `src/lib/bulk-edit.ts` — 공통 로직
  - `applyBulkUpdate({ table, ids, field, value, userId, changeSource })`
  - 1) 기존 값 SELECT (이력 기록용) 2) UPDATE 3) change_log INSERT를 한 번의 RPC가 아니라 트랜잭션이 없는 PostgREST 환경이므로 chunk(100건씩) 순차 처리

### 2. `DefectRawDataPage.tsx`
- 체크박스 컬럼(고정) 추가: TanStack Table의 row selection 활성화 (`enableRowSelection: true`)
- 헤더 "전체 선택"은 현재 필터된 `table.getFilteredRowModel().rows` 기준
- 행 클릭은 기존대로 상세 이동, 단 체크박스 칸 클릭은 `event.stopPropagation`
- 선택된 ID 1개 이상이면 페이지 상단 sticky `BulkEditBar` 노출
- 편집 가능 필드 메타데이터: 위 화이트리스트
- 변경 후 `setItems` 로컬 갱신 + 토스트

### 3. `SubtestList.tsx`
- 동일 패턴 (단, 테이블이 `subtests`, 변경 로그는 `subtest_change_log`)
- subtest의 RLS는 `can_update_subtest`로 행별 권한이 다르므로, 응답 카운트로 거부 건 분리

### 4. 타입/유틸
- `BulkEditableField` 타입과 각 화면의 `BULK_FIELDS` 상수 정의 (label, type, options 함수)
- 옵션은 기존 `optionFields` / `subcontractorOptions` 등 재사용

### 5. 테스트
`src/test/bulk-edit.test.ts` 추가
- 1건/여러건/빈값/권한거부 시 chunk 처리
- change_log 페이로드 형태 검증

## DB 변경

**없음**. 기존 `defect_items`, `subtests`, `defect_change_log`, `subtest_change_log` 테이블과 RLS만 사용합니다.

## 변경 파일 요약

신규
- `src/components/raw-data/BulkEditBar.tsx`
- `src/components/raw-data/BulkEditDialog.tsx`
- `src/lib/bulk-edit.ts`
- `src/test/bulk-edit.test.ts`

수정
- `src/pages/DefectRawDataPage.tsx` — 선택 컬럼, 액션바 통합, 화이트리스트
- `src/pages/SubtestList.tsx` — 선택 컬럼, 액션바 통합, 화이트리스트

## 향후 확장 (이 PR 범위 밖)
- 다중 필드 동시 변경 (현재는 1회 1필드)
- "현재 필터 전체에 적용" (선택 없이도 적용) 토글
- Undo (직전 변경 되돌리기) — `defect_change_log` 기반
