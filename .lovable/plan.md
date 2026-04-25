## Import Batch Rollback (T&C + Defect 동시 적용)

### 목표
Import 배치를 **Delete**(전체 삭제)하는 대신, **Rollback**(이 배치가 만든 변경만 되돌리기) 옵션을 추가합니다. 다른 사용자/배치의 후속 작업은 보존합니다.

T&C Management와 Defect Management 양쪽 모두에 동일한 패턴으로 적용합니다.

---

### 핵심 동작

각 배치는 두 가지 영향을 미칩니다:
- **Insert**: 그 배치로 새로 만들어진 row → Rollback 시 **삭제**
- **Update**: 기존 row의 필드를 변경 → Rollback 시 **이전 값으로 복원**

이전 값은 이미 `change_log` 테이블에 `old_value`/`new_value`/`changed_field`로 기록되어 있어 이를 활용합니다.

### 충돌 처리 (안전 모드 기본)

해당 배치 이후 **다른 배치 또는 사용자가 같은 필드를 또 변경**한 경우:
- 기본: 그 필드는 **건너뜀** (Skip) → 후속 작업 보존
- 사용자가 다이얼로그에서 "Force restore" 체크 시 → 강제로 이전 값 복원

각 row의 `row_version`을 기준으로 충돌 감지: change_log에 기록된 시점 이후 같은 필드가 또 바뀌었는지 검사.

---

### 변경 내용

#### 1. DB 함수 (마이그레이션 — 신규 2개)

**`rollback_upload_batch(_batch_id uuid, _force boolean)`** — T&C용
```text
권한: is_admin_or_superuser만 실행 가능
처리:
  1. 이 배치로 insert된 subtests (source_upload_id=batch, change_log에 'insert' 기록 없거나 첫 등장)
     → soft-delete (is_active=false) 또는 hard-delete
  2. 이 배치로 update된 subtests:
     - subtest_change_log에서 (upload_id=batch, change_source='excel_import') 모든 row 조회
     - 각 row마다 후속 변경 여부 확인 (이후 timestamp의 같은 changed_field 존재?)
       · 없음 → old_value로 복원
       · 있음 + _force=false → skip, 충돌 카운트 증가
       · 있음 + _force=true → 강제 복원
  3. schedule_change_audit / upload_row_logs 정리 (이 배치 분만)
  4. upload_batches.status = 'rolled_back', note에 롤백 기록
  5. 결과 반환: { restored_count, deleted_count, skipped_count, conflicts: [...] }
```

**`rollback_defect_import_batch(_batch_id uuid, _force boolean)`** — Defect용
```text
T&C와 동일 패턴 + 추가:
  - defect_daily_snapshots 정리 (이 배치 이후 생성된 스냅샷만 삭제할지 결정)
  - defect_schedule_change_audit 이 배치 분만 삭제
  - sc_no_history 영향 검토
```

**enum 확장**: `upload_status`에 `'rolled_back'` 값 추가

#### 2. UI — Defect Import Logs Page

`src/pages/DefectImportLogsPage.tsx`:
- 배치 행에 기존 [Delete] 버튼 옆에 **[Rollback]** 버튼 추가 (admin/superuser만)
- Rollback 클릭 시 다이얼로그:
  ```text
  "이 배치를 롤백합니다"
  - 추가된 defect: N개 → 삭제됨
  - 수정된 defect: M개 → 이전 값으로 복원
  - 후속 변경 충돌: K개 (다른 사용자/배치가 이후 변경)
  
  [ ] 충돌 무시하고 강제 복원 (위험)
  
  [Cancel] [Rollback]
  ```
- 다이얼로그 열 때 미리 dry-run 쿼리로 카운트 표시

#### 3. UI — T&C Import Logs Page

`src/pages/ImportLogsPage.tsx`:
- 동일한 패턴으로 [Rollback] 버튼 추가
- 추가 안내: "T&C는 일일 스냅샷이 없어 change_log 기반으로만 복원됩니다"

#### 4. 롤백 기록 자체도 audit 남기기

롤백으로 발생한 필드 변경도 `change_log`에 기록:
- `change_source = 'rollback'`
- `upload_id = 원래 배치 id` (역추적 용이)
- `changed_by = 실행한 admin user`

---

### 데이터 모델 확장

```sql
-- enum 확장
ALTER TYPE upload_status ADD VALUE IF NOT EXISTS 'rolled_back';

-- change_source enum (있다면) 확장
ALTER TYPE change_source_enum ADD VALUE IF NOT EXISTS 'rollback';
```

`upload_batches` / `defect_upload_batches`에 선택적 컬럼:
- `rolled_back_at timestamptz`
- `rolled_back_by uuid`

---

### 시나리오 예시

```text
배치 A (Mon): defect-001 description="cracked wall"
배치 B (Tue): defect-001 description="hairline crack"  ← B가 같은 필드 또 수정
배치 C (Wed): defect-002 신규 추가

──────────────────────────────────────────
배치 B 롤백 (안전 모드):
  - defect-001.description → "cracked wall"로 복원 ✓
  - 충돌 없음 (이후 변경 없음)
  
배치 A 롤백 (안전 모드):
  - defect-001.description → 충돌 감지 (배치 B가 이후 변경)
  - skip, 사용자에게 알림
  
배치 A 롤백 (강제):
  - defect-001.description → 강제로 A의 old_value로 복원
  - B의 변경 사항 사라짐
  
배치 C 롤백:
  - defect-002 → 삭제 (이 배치로 insert됨)
```

---

### 검증 기준

```text
1. T&C 배치 롤백 → 그 배치가 update한 subtests만 이전 값으로 복원
2. T&C 배치 롤백 → 그 배치가 insert한 subtests만 삭제
3. Defect 동일 동작
4. 다른 배치/사용자의 후속 작업 보존 (안전 모드)
5. 충돌 발생 시 다이얼로그에 카운트와 목록 표시
6. 강제 모드 시 충돌 무시하고 복원
7. 롤백 자체가 change_log에 'rollback' source로 기록
8. 배치 status='rolled_back'으로 변경 (히스토리 보존)
9. admin/superuser만 실행 가능 (RLS + 함수 내부 체크)
10. 기존 [Delete] 버튼은 유지 (전체 삭제 옵션은 그대로)
```

### 영향 파일

```text
NEW   supabase/migrations/<ts>_add_rollback_functions.sql
EDIT  src/pages/ImportLogsPage.tsx              (Rollback 버튼 + 다이얼로그)
EDIT  src/pages/DefectImportLogsPage.tsx        (Rollback 버튼 + 다이얼로그)
NEW   src/components/import/RollbackDialog.tsx  (공통 다이얼로그 컴포넌트)
NEW   src/lib/rollback-utils.ts                 (dry-run 카운트 쿼리, 호출 헬퍼)
```

### 변경하지 않는 항목

- 기존 Delete 동작 (전체 삭제 옵션 유지)
- Import 로직 / Parser
- 파일 업로드 흐름
- 기존 RLS 정책 (롤백 함수는 SECURITY DEFINER로 처리)
- `database_snapshots` / `restore-snapshot` 기존 기능

### 리스크 / 주의사항

- **Auto-created masters** (system_master, subcontractor_master 등): 이 배치로 자동 생성된 마스터는 **삭제하지 않음** (다른 배치에서도 참조 가능). 추후 별도 정리 도구 권장.
- **defect_daily_snapshots**: 롤백된 이후 날짜의 스냅샷은 삭제하지 않음 (관측 시점의 사실 기록이므로). 단, 해당 배치 직후 강제로 만들어진 스냅샷이 있다면 정리 검토.
- **T&C `tests` 테이블**: subtest 삭제 시 부모 test가 고아가 될 수 있음 → 일단 보존, 추후 정리 도구.
- 큰 배치(수천 row) 롤백 시 트랜잭션 시간 길어질 수 있음 → 함수 내부 배치 처리.
