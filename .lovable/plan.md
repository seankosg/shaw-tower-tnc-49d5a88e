## 원인 진단

**왜 컬럼을 4개만 매핑해도 32개 매핑할 때와 속도가 비슷한가?**

`src/contexts/DefectImportContext.tsx`의 import 처리 루프(line 568~810)는 **각 행마다 1~6개의 `await supabase.from(...).insert/update()` 호출**을 직렬로 수행합니다. 컬럼 수가 줄어도 **행 수만큼의 네트워크 round-trip은 동일**하므로 시간 차이가 거의 나지 않습니다.

행 1건당 발생하는 DB 호출(최소 → 최대):
- `defect_upload_row_logs.insert` × 1~5 (rejected/skipped/inserted/updated, planned_pct 경고, classifier 경고, status 경고, conflict 경고 등)
- `defect_items.update` 또는 `defect_items.insert` × 1
- `defect_schedule_change_audit.insert` × 변경된 trackedField 수 (최대 10)
- `defect_daily_snapshots.insert` × 1 (신규 행만)

→ **2,000행이면 약 4,000~10,000회의 직렬 HTTP 요청**. 이게 진짜 병목입니다.

또한 `parseDefectExcel`의 컬럼 제외 로직(line 446~454)은 단순히 `raw[k]` 객체에서 키를 제거할 뿐, 그 후 `mappedRows`를 만들 때는 **항상 32개 필드 전체에 대해 `getMapped` / `normalizeDate` / `toText` 등을 실행**합니다. 즉 파싱 단계에서도 컬럼 제외가 **연산량을 줄이지 않습니다**.

게다가 update 분기에서 `hasAnyChange` 체크(line 764)는 **payload의 모든 키**를 비교하므로, 사용자가 "Subcontractor 4개 컬럼만 바꾸려고" 28개를 제외해도 32개 필드 모두 비교 → 변경 없음 시 skip되지만, **변경 비교 자체는 매번 전체 수행**됩니다.

## 해결 전략 (3단계, 효과 큰 순)

### 1. 행-단위 DB 호출 → 일괄 처리(batch)로 전환 [가장 큰 효과: 5~20배 빨라짐 예상]

루프 안에서 즉시 `await insert`하지 말고, 메모리에 누적 후 청크 단위(예: 200~500행)로 일괄 전송합니다.

- `defect_upload_row_logs`: 행 처리 중 `pendingLogs: any[]`에 push → 청크 끝에서 `.insert(pendingLogs)` 1회.
- `defect_schedule_change_audit`: 동일하게 `pendingAudits` 배열로 누적 → 청크 끝에서 1회 insert.
- `defect_daily_snapshots`: 신규 insert된 행 ID를 받아 `pendingSnapshots`에 모아서 청크 끝에서 1회 insert.
- `defect_items.update` / `insert`:
  - 신규 insert는 `.insert(payloads).select('id')`로 청크 단위 일괄 insert (반환 id 순서로 snapshot에 매핑).
  - update는 PK 기준이라 일괄 처리하기 어려우므로, **변경 없음 행을 먼저 걸러낸 뒤** 변경된 것만 `Promise.all` 병렬로 (예: 동시 10개) 실행.
- 진행률(progress)은 청크 단위로 업데이트.

### 2. 선택 컬럼 기반 부분 업데이트 (사용자가 매핑한 4개만 변경) [중간 효과 + UX 개선]

현재는 제외된 컬럼이 "raw에서 빠짐 → `toText(getMapped(raw,'x'))`가 null → `preserveExistingForBlank`가 DB값으로 복원"의 흐름인데, **실제로 32개 필드 모두 payload에 들어가서 update**됩니다(같은 값으로). 이로 인해 `hasAnyChange` 비교, audit 비교, row_version 증가가 불필요하게 모든 필드에 대해 일어납니다.

개선: parser가 `excludedFields: Set<string>`를 importer로 전달 → importer는
- **변경 비교(`hasAnyChange`)와 audit 비교를 "사용자가 선택한 필드"로만 한정**.
- update payload도 선택된 필드 + 항상 필요한 메타(team, classification_source, row_version 등)만 포함.
- 그러면 4개 컬럼만 매핑한 경우 변경된 행 수가 극적으로 줄고, audit insert도 줄어듭니다.

### 3. 파싱 단계 미세 최적화 [효과 작지만 무료]

- 제외된 헤더에 매핑되는 필드는 `parseDefectExcel`의 매핑 루프(line 465~510)에서 `null`로 즉시 단축 → `normalizeDate` / `parseArea` 호출 자체를 스킵.
- 단, `area_raw`처럼 derived field(area_type/level/location)를 만드는 입력은 제외되면 derived도 자동 null이 되어야 함(이미 dialog에서 경고 중).

## 변경 파일

### `src/contexts/DefectImportContext.tsx` (메인)
- `processFile` 내부 루프를 **청크 기반 2-pass**로 재작성:
  - Pass A (CPU only): 모든 행에 대해 payload·log·audit·snapshot 객체를 **메모리에서만** 생성, 누적.
  - Pass B (DB I/O): 청크 단위로 `defect_items.upsert` (insert 청크) + `update` 병렬화 + `row_logs.insert(array)` + `schedule_change_audit.insert(array)` + `daily_snapshots.insert(array)`.
- `excludedFields: Set<string>` 매개변수를 받아 `hasAnyChange`와 `trackedFields` audit 루프에서 필터링.
- `setFiles` progress 업데이트는 청크 단위로(루프마다 setState하지 않도록) — React 리렌더 비용도 절감.

### `src/lib/defect-parser.ts`
- `ParseDefectResult`에 `excludedFields: Set<string>` 추가.
- 매핑 루프(line 465~510)에서 `excludedFields.has('xxx')`인 필드는 정규화 스킵하고 `null` 할당.

### `src/components/import/ColumnSelectDialog.tsx`
- 변경 없음. 기존 `excludedHeaders` 흐름 그대로 사용.

## 검증

1. 2,000행 / 4컬럼 매핑 vs 32컬럼 매핑 처리 시간 비교 → 4컬럼 매핑이 명확히 빨라야 함(개선 후 50% 이상 단축 기대).
2. 2,000행 전체 매핑도 절대 시간이 큰 폭(예상 5~10배) 단축.
3. row_logs, schedule_change_audit, daily_snapshots 레코드 수가 기존과 동일(누락 없음).
4. 부분 컬럼만 매핑 시: 매핑 안 된 필드의 audit이 생성되지 않아야 함(불필요한 audit 노이즈 제거).
5. Re-import / 신규 import 양쪽 모두 정상 동작.
6. 진행률 바가 청크 단위(2,000행이면 5~10번)로만 업데이트되어 UI 끊김 없음.

## 리스크

- 일괄 insert 도중 1행 실패 시 청크 전체 롤백 정책 필요 → Supabase는 기본적으로 청크 단위 트랜잭션 아님. 실패 행만 row_logs에 reason='batch_error'로 기록하고 나머지는 진행하는 graceful 처리 추가.
- update 병렬화 동시성은 10 이하로 제한(Supabase rate limit 회피).
