# 마스터 데이터 정합성 정리 (P5)

## 현재 상태 (DB 조회 결과)

| id (단축) | name | type | owner_code | is_active | parent |
|---|---|---|---|---|---|
| 313583a0… | **SCHINDLER** | sub | SCHINDLER | ✅ true | — |
| 636df3e5… | Schindler | subsub | **SCHINDLER2** | ❌ false | 313583a0 (SCHINDLER) |
| c1fd7c4c… | **Puretech** | sub | PURETECH | ✅ true | — |
| cf08c328… | PUTRETECH | sub | **PUTRETECH** | ❌ false | — |

**확인 사항**
- ✅ `defect_items` 테이블은 0건 (직전 truncate 완료) → 정리 시 운영 데이터 영향 **없음**
- ✅ inactive 레코드는 더 이상 신규 import에 사용되지 않음
- ⚠️ 그러나 owner_code(`SCHINDLER2`, `PUTRETECH`)가 살아있어 **P4 유니크 제약 적용 시 충돌 위험**
- ⚠️ 신규 import에서 동일 회사가 다른 코드로 잡히면 SC번호 시리즈가 분기됨

---

## 정리 방침

### 1. SCHINDLER (sub) ↔ Schindler (subsub, SCHINDLER2) 통합
- `Schindler` (subsub)는 `SCHINDLER`의 하위로 등록되어 있으나 사실상 동일 회사
- subsub 자체는 유지하되 (계층 정보), **owner_code = NULL** 로 변경
  - 이유: SC번호는 **상위 sub(SCHINDLER)** 의 owner_code로만 발번해야 함
  - subsub에 별도 owner_code가 있으면 SC번호가 두 갈래로 갈라짐
- 이미 `is_active = false` 이므로 표시상 영향 없음

### 2. PUTRETECH (오타 sub) 정리
- 명백한 오타, 이미 inactive
- **owner_code → NULL** 로 변경 (재사용/충돌 방지)
- 행 자체는 감사 추적을 위해 보존 (`is_active = false` 유지)
- 향후 owner_code 유니크 제약 적용 시 NULL은 허용되어 충돌 없음

### 3. subcontractor_issue_counters 정리
- 현재 카운터 테이블에 `SCHINDLER2`, `PUTRETECH` 키가 있다면 삭제
- (defect_items 0건이므로 발번 이력 자체가 의미 없음)

### 4. owner_code 유니크 제약 강화 (P5 본편)
- **부분 유니크 인덱스** 적용:
  ```sql
  CREATE UNIQUE INDEX subcontractor_master_owner_code_active_uq
    ON subcontractor_master (owner_code)
    WHERE owner_code IS NOT NULL AND is_active = true;
  ```
- 활성 마스터에 한해 owner_code 중복 차단
- inactive/NULL은 자유롭게 허용 → 과거 데이터/감사 추적 보존

### 5. 정규화 트리거 보강 (이미 P1~P4에서 일부 적용됨)
- `fn_subcontractor_master_normalize_owner` 가 이미 owner_code를 `upper(trim())` 처리 중
- **추가**: 빈 문자열(`''`)도 NULL로 변환 → 빈 코드로 인한 의도치 않은 충돌 방지

---

## 변경 사항 요약

### 데이터 변경 (insert/update 도구)
```sql
-- (a) Schindler subsub의 owner_code 제거
UPDATE subcontractor_master
SET owner_code = NULL
WHERE id = '636df3e5-35f7-46c3-bf8f-51825fa957c3';

-- (b) PUTRETECH 오타 행의 owner_code 제거
UPDATE subcontractor_master
SET owner_code = NULL
WHERE id = 'cf08c328-f1df-4a4d-bfdd-55fb385064a7';

-- (c) 잘못된 카운터 키 삭제 (있으면)
DELETE FROM subcontractor_issue_counters
WHERE owner_code IN ('SCHINDLER2', 'PUTRETECH');
```

### 스키마 변경 (마이그레이션)
```sql
-- (1) 정규화 트리거 보강: 빈 문자열 → NULL
CREATE OR REPLACE FUNCTION public.fn_subcontractor_master_normalize_owner()
RETURNS trigger AS $$
BEGIN
  IF NEW.owner_code IS NOT NULL THEN
    NEW.owner_code := nullif(upper(trim(NEW.owner_code)), '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (2) 활성 마스터 owner_code 부분 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS subcontractor_master_owner_code_active_uq
  ON public.subcontractor_master (owner_code)
  WHERE owner_code IS NOT NULL AND is_active = true;
```

---

## 검증 단계
1. UPDATE/DELETE 실행 후 `SELECT … WHERE upper(name) LIKE '%SCHIND%' OR …` 재조회로 상태 확인
2. 마이그레이션 적용 후 `\d subcontractor_master` 인덱스 목록에 부분 유니크 인덱스 존재 확인
3. 임의 테스트: 활성 행의 owner_code를 기존 활성 owner_code와 동일하게 update 시도 → 차단되는지 확인

## 영향 범위
- `defect_items`: 0건이므로 영향 없음
- `subcontractor_master`: 2건 update + 트리거/인덱스 추가
- `subcontractor_issue_counters`: 잘못된 키 정리
- 코드(`DefectImportContext.tsx` 등): **변경 없음** — RPC가 이미 정규화된 owner_code를 전달함

## 후속 (이번 범위 외)
- 정기적 마스터 데이터 점검 화면(중복/오타 후보 표시)은 별도 기능으로 추후 검토
