# Excel Import: "엑셀 빈값은 기존 값 유지" 정책 전 필드 적용

## 목표

기존에는 Main Trade / Sub Trade / Work Type 3개 필드만 "엑셀 빈값 시 DB 값 유지" 로직이 적용되어 있었습니다. 이제 **모든 일반 데이터 필드**에 동일한 정책을 적용합니다.

```
엑셀 셀에 값이 있다  → 엑셀 값으로 업데이트
엑셀 셀이 비어있다   → DB의 기존 값을 그대로 유지 (null로 덮어쓰지 않음)
신규 행 (DB에 없음)  → 엑셀 값 그대로 (없으면 null)
```

## 적용 대상 / 비대상

### ✅ 보존 정책 적용 (엑셀 빈값이면 DB 값 유지)

**Defect 일반 필드:**
- 식별/설명: `description`, `defect_type`, `status`, `priority`
- 위치: `area_raw`, `area_type`, `area_level`, `area_location`
- 분류: `main_trade`, `sub_trade`, `work_type`, `trade_detail` (Field Discipline)
- 담당: `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
- 일정 날짜 (모두): `planned_start_date`, `planned_completion_date`, `planned_closure_date`, `actual_start_date`, `actual_closure_date`
- 진척: `actual_progress_pct`
- 메모: `remarks`, `hdec_comments`

### ⚙️ 별도 처리 (정책 적용 안 함 — 자동 계산/시스템 필드)

이 필드들은 import 로직에서 별도로 계산되므로 일괄 보존 정책에서 제외합니다:

- `planned_progress_pct` — planned 날짜로 항상 자동 재계산 (현재 동작 유지)
- `actual_completion_date` — `actual_progress_pct ≥ 100`일 때 자동 채움 (현재 동작 유지)
- `completion_status`, `closure_status` — 엑셀 값 우선, 없으면 자동 계산 (현재 동작 유지)
- `team` — 엑셀 → Field Discipline → Profile 매핑 (단, **null로 떨어지면 DB 값 유지**로 보강)
- `subcontractor_issue_no`, `subcontractor_issue_source` — 시스템 채번 (현재 동작 유지)
- `classification_source`, `classified_at` — 분류 적용 시점에만 갱신 (현재 동작 유지)
- `source_upload_id`, `data_source_type`, `updated_by`, `row_version`, `is_active` — 시스템 메타 (항상 갱신)
- `id`, `issue_no`, `project_id` — 매칭 키 (변경 없음)
- `raw_payload` — 원본 엑셀 페이로드 (현재 동작 유지)

## 구현 방법

### 파일: `src/contexts/DefectImportContext.tsx`

1. **헬퍼 함수 추가** (파일 상단)
   ```ts
   const PRESERVE_FIELDS = [
     'description', 'defect_type', 'status', 'priority',
     'area_raw', 'area_type', 'area_level', 'area_location',
     'trade_detail',
     'subcontractor_name', 'subsub_name', 'hdec_pic_name', 'hdec_eng_name',
     'planned_start_date', 'planned_completion_date', 'planned_closure_date',
     'actual_start_date', 'actual_closure_date',
     'actual_progress_pct',
     'remarks', 'hdec_comments',
   ] as const;

   function preserveExistingForBlank(row: ParsedDefectRow, existing: any | null) {
     if (!existing) return;
     for (const field of PRESERVE_FIELDS) {
       const v = (row as any)[field];
       const isBlank = v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
       if (isBlank && existing[field] != null) {
         (row as any)[field] = existing[field];
       }
     }
   }
   ```

2. **`existing` 조회 직후 호출** (현재 line 478 근처)
   - `preserveExistingForBlank(row, existing)`를 분류 로직 **이전**에 호출
   - 결과: 분류 로직에 들어가는 `row`는 이미 "엑셀 값 또는 DB 값"으로 채워진 상태
   - 따라서 main_trade/sub_trade/work_type용 별도 보존 코드는 **자연스럽게 동일한 동작**이 되지만, 그대로 두어도 문제없음 (이중 안전망)

3. **`team` 필드 보강** (`resolveDefectTeam` 호출 직후, line 564 근처)
   ```ts
   const resolvedTeam = resolveDefectTeam(row, profileTeamMap) ?? existing?.team ?? null;
   ```
   - 엑셀에 team도 없고 Field Discipline/Profile에서도 못 찾으면 → DB의 기존 team 유지

4. **`actual_completion_date` 처리 보강** (line 567 근처)
   - 현재: `progress >= 100`이면 엑셀값 → DB값 → dataDate
   - 변경: `progress < 100`이고 엑셀 빈값이면 DB값 유지 (현재는 null로 떨어짐)
   ```ts
   const actualCompletionDate = Number(row.actual_progress_pct ?? 0) >= 100
     ? (row.actual_completion_date ?? existing?.actual_completion_date ?? dataDate)
     : (row.actual_completion_date ?? existing?.actual_completion_date ?? null);
   ```

5. **`planned_progress_pct` 처리** (line 462)
   - planned 날짜 둘 다 존재할 때만 재계산해서 덮어씀
   - 둘 중 하나라도 없으면 (null 반환 시) → DB의 기존 값 유지
   ```ts
   const computedPlanned = computePlannedProgressPct(row.planned_start_date, row.planned_completion_date, dataDate);
   row.planned_progress_pct = computedPlanned ?? existing?.planned_progress_pct ?? null;
   ```
   - 단, 위 #2의 `preserveExistingForBlank`가 호출되기 전에 이 라인이 실행되므로, **순서를 조정**: existing 조회 → preserveExistingForBlank → planned_progress_pct 재계산

6. **`completion_status` / `closure_status` 보강** (line 587, 594)
   - 현재: 엑셀 값 없고 planned 날짜도 없으면 → null로 강제
   - 변경: null로 강제하기 전에 → DB의 기존 값이 있으면 그것을 유지
   ```ts
   else if (!row.planned_completion_date && !row.planned_closure_date) {
     completionStatus = existing?.completion_status ?? null;
     ...
   }
   ```

### 처리 순서 재정렬 (importOneFile 루프 내부)

```
1. issue_no 검증
2. masterEnsurer
3. existing 조회                           ← 위치 변경 (앞당김)
4. preserveExistingForBlank(row, existing) ← 신규
5. planned_progress_pct 재계산 (existing fallback 포함)
6. 분류 로직 (이미 위에서 채워진 값 활용)
7. issue_no 채번 / team 결정 (existing fallback)
8. status 자동 계산 (existing fallback)
9. payload 구성 / insert or update
```

## 사용자가 보게 될 효과

- **2차 update 파일에 일부 컬럼만 있어도 안전함** — 빠진 컬럼은 기존 값이 유지됨
- **부분 업데이트 시나리오 지원** — PIC만 적힌 파일, 날짜만 적힌 파일 등 자유롭게 import 가능
- **기존 데이터 손실 방지** — LL 원본에서 누락된 셀 때문에 description/area 등이 사라지는 사고 방지
- **명시적으로 비우고 싶을 때**: 현재 시스템에는 "clear 토큰"이 없으므로, 비우려면 Detail 화면이나 Bulk Edit의 "Clear" 옵션 사용

## 영향 범위

- **변경 파일 (1개)**: `src/contexts/DefectImportContext.tsx`
- **DB 스키마 변경**: 없음
- **다른 모듈**: 영향 없음 (Subtest import는 별도 로직, 이번 변경 대상 아님)

## 테스트 시나리오

1. 1차 Import: PIC = "Andrew" → DB 저장
2. 2차 Import (동일 issue): PIC 컬럼 비어있음 → **"Andrew" 유지**
3. 3차 Import: PIC = "Bob" → "Bob"으로 업데이트
4. 일정 날짜만 적힌 파일 import → 다른 필드 보존 확인
5. 신규 issue with 빈 필드 다수 → 엑셀 값(=null) 그대로 insert (기존 동작과 동일)
