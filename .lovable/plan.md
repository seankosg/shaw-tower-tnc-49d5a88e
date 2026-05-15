## 문제 진단

Punch Import Logs 상세에 fail/reject 행이 안 보이는 근본 원인은 **Punch가 행 단위 로그 테이블을 가지지 않고**, `import_field_logs`에서 합성(synthesize)하는데, **거부된 행은 애초에 어떤 로그 테이블에도 기록되지 않기** 때문입니다.

### 현재 동작 (문제)
1. Parser에서 거부되는 행 (Item No / Outstanding Works 누락 등) → `parsed.errors`에만 들어가고 DB에는 안 적힘
2. DB upsert 실패 (`supabase.update/insert` 에러) → `result.errors`에만 push되고 `console.warn` 후 사라짐
3. 결과적으로 batch 헤더의 `rejected_rows` 카운트는 증가하지만, 상세 화면이 읽을 row log 행이 0건
4. `PunchImportLogsPage`는 `import_field_logs`에서 합성하므로 applied/unchanged 항목만 보임 (거부 항목은 field log조차 없으므로 누락)

### Defect 측 동작 (참조 구현)
- 전용 `defect_upload_row_logs` 테이블 (PK + upload_id + raw_row_no + issue_no + action_taken + reason_code + reason_detail)
- 모든 입력 행 1건당 정확히 1개 로그 (inserted / updated / skipped / rejected)
- `DefectImportLogsPage`는 합성 없이 그대로 조회 → 거부 행도 즉시 노출

---

## 작업 범위

### 1. DB 마이그레이션 — `punch_upload_row_logs` 테이블 신규
`defect_upload_row_logs`와 동일 스키마(`issue_no` → `item_no`로만 변경):

```
punch_upload_row_logs (
  id uuid pk default gen_random_uuid(),
  upload_id uuid not null,
  raw_row_no integer,
  item_no text,
  action_taken upload_row_action,   -- 기존 enum 재사용
  reason_code text,
  reason_detail text,
  processed_at timestamptz not null default now()
)
```
RLS:
- SELECT: `authenticated` 누구나
- INSERT: 해당 upload의 owner 또는 admin/superuser
- UPDATE: 금지
- DELETE: admin/superuser

인덱스: `(upload_id)`, `(upload_id, action_taken)`

### 2. Punch import 파이프라인 수정

**파일**: `src/lib/punch-excel-utils.ts` (`upsertPunchRows`)
- `pendingRowLogs` 배열 추가
- 각 행 처리 시점에 1건씩 push:
  - 성공 insert → `action='inserted'`
  - 성공 update → `action='updated'`
  - DB 에러 → `action='rejected'`, `reason_code='db_error'`, `reason_detail=error.message`
- 함수 종료 직전 `import_field_logs`와 함께 `punch_upload_row_logs`에 일괄 insert
- 거부된 행은 field log도 1건(요약) 같이 남겨 상세 확장 시 컨텍스트 표시

**파일**: `src/pages/PunchImportPage.tsx` (`runImport`)
- 파서 단계 거부(`parsed.errors`)도 직접 `punch_upload_row_logs`에 insert
  - `action='rejected'`, `reason_code='missing_required_field'`, `reason_detail=err.reason`, `raw_row_no=err.rawRowNo`

### 3. `PunchImportLogsPage` 리팩터 (Defect 화면과 동등)

**파일**: `src/pages/PunchImportLogsPage.tsx`
- `loadBatchDetails`에서 합성 로직 제거 → `fetchAllByUploadId('punch_upload_row_logs', ...)` 직접 조회
- `PunchRowLog` 인터페이스를 실제 컬럼 그대로 사용 (`item_no` 컬럼)
- 나머지 UI(필터 칩 / 액션 카운트 / Field outcome / 행 확장 / CSV 다운로드)는 이미 Defect와 동일하므로 **데이터 소스 교체만으로 거부·실패 행이 자동 노출**됨
- 화면 상단 카운트 칩, action filter, reason filter, outcome filter — Defect와 1:1 동일하게 유지

### 4. (참고) Schedule Changes 탭은 추가하지 않음
Punch에는 `*_schedule_change_audit` 테이블이 없으며 사용자 요청은 "Import 로그 시스템 및 상세"로 한정. 필요 시 별도 작업으로 분리.

---

## 검증

1. 필수 컬럼이 빈 행이 포함된 Excel 업로드 → Logs 상세에 `rejected · missing_required_field` 행이 보여야 함
2. DB 권한 위반 등 강제 에러 발생 행 → `rejected · db_error` 표시
3. 정상 행 → `inserted` / `updated` 그대로 표시 (회귀 없음)
4. 합계 카드(`rejected_rows`)와 상세 표 row 수 일치
5. 행 확장 시 FieldLogTable 정상 렌더 (기존 applied/unchanged 보존)

## 영향 범위
- 신규 테이블 1개 + RLS
- 코드 수정: `punch-excel-utils.ts`, `PunchImportPage.tsx`, `PunchImportLogsPage.tsx`
- 기존 데이터 무영향 (신규 테이블 비어있음, 다음 import부터 채워짐)
