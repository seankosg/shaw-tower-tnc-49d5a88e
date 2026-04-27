# SC번호 발번 근본개선 — P1~P4 통합 적용

기존 클라이언트(TS) 메모리 기반 시퀀스 발번을 **DB 단일 진실원(SSOT)** 으로 이전합니다. 동시 업로드/재시도/병행 임포트에서도 발번이 원자적이고 순서적으로 보장되며, 유니크 제약 충돌이 사라집니다.

## 결과적으로 해결되는 문제

- "duplicated key value violates unique constraint defect_items_subcontractor_issue_unique" 재현 차단
- `project_id` NULL로 인한 키 불일치 (`COALESCE(project_id::text, '')`) 제거
- 다중 업로드/멀티유저/재시도 시 SC 시퀀스 중복 또는 건너뛰기 방지
- 엑셀에 수동 입력된 SC번호와 자동 발번 시퀀스 동기화

---

## 변경 범위

### 1) 신규 마이그레이션 (단일 파일)

**A. 카운터 테이블**
```text
subcontractor_issue_counters
  - project_id    uuid    NOT NULL
  - owner_code    text    NOT NULL  (UPPER 정규화)
  - next_seq      int     NOT NULL DEFAULT 1
  - updated_at    timestamptz
  - PK (project_id, owner_code)
RLS: 모든 변경은 SECURITY DEFINER RPC로만 수행 → 일반 INSERT/UPDATE 정책 미부여(읽기는 authenticated 허용).
```

**B. 원자 발번 RPC**
- `allot_subcontractor_issue_no(_project_id uuid, _owner_code text, _count int) → int[]`
  - `INSERT ... ON CONFLICT DO UPDATE SET next_seq = next_seq + _count` 후 시작 시퀀스 반환.
  - 동시성: row-level lock으로 직렬화. 한 번의 호출로 N개 시퀀스 예약.
- `bump_subcontractor_issue_counter(_project_id uuid, _owner_code text, _used_seq int)`
  - 엑셀에 수동 입력된 `SC-XXX-NNNNN`이 발견되면 카운터를 `MAX(current, used+1)`로 끌어올림.

**C. 기본 project_id 트리거 (P2)**
- `defect_items` BEFORE INSERT: `project_id IS NULL` 이면 활성 프로젝트가 1개일 때 그것을 채움(현재 SHAW 단일). 다중일 경우 RAISE EXCEPTION.

**D. NOT NULL 강제 (P4)**
- 잔여 NULL 점검 후 `ALTER TABLE defect_items ALTER COLUMN project_id SET NOT NULL`.
- 유니크 인덱스 단순화: `defect_items_subcontractor_issue_unique`를 `(project_id, lower(trim(subcontractor_issue_no)))` WHERE 조건만 유지(현재의 `COALESCE(project_id::text,'')` 제거).

**E. 마스터 정규화 보강 (보조)**
- `subcontractor_master.owner_code`에 `UPPER` 정규화 트리거(기존 데이터 42건은 이미 정상).

### 2) Import 코드 리팩토링 — `src/contexts/DefectImportContext.tsx`

- `buildIssueRegistry` / `reserveSubcontractorIssueNo` / `buildSubcontractorIssueAssignments` 의 발번 부분을 RPC 호출로 교체.
- 새 흐름:
  1. 행 파싱 후 owner_code 분류 → 자동발번 대상 행을 owner별로 그룹핑(이슈번호 오름차순 정렬 유지).
  2. owner별 1회 `allot_subcontractor_issue_no(project_id, owner, group.length)` 호출 → 시작 시퀀스 N개 일괄 수령.
  3. 행에 순서대로 매핑하여 `SC-{owner}-{seq.padStart(5,'0')}` 생성.
  4. 엑셀에 수동 입력된 SC번호는 `bump_subcontractor_issue_counter`로 카운터 동기화 후 그대로 사용.
- `existingKeys` 중복 체크 루프 제거(DB 유니크 + RPC가 보장).
- `project_id`는 항상 단일 활성 프로젝트 ID로 명시 전달(트리거가 백업).

### 3) 적용 순서 (마이그레이션 1회)

```text
1. 카운터 테이블 + RPC 2종 생성
2. 트리거 (project_id 기본값) 추가
3. 기존 defect_items 잔여 NULL project_id 백필 (현재 0건이지만 안전 장치)
4. 카운터 시드: 기존 SC번호로부터 owner별 MAX(seq) → next_seq = MAX+1 INSERT
   (현재 defect_items가 비어있으므로 모든 owner의 next_seq=1로 시작)
5. project_id NOT NULL 적용
6. 유니크 인덱스 재생성 (단순화)
```

### 4) 코드 변경 영향 파일

- `src/contexts/DefectImportContext.tsx` (발번 로직 교체)
- `src/integrations/supabase/types.ts` 자동 갱신 (RPC 타입 포함)

---

## 위험/영향 검토

- 데이터 손실 없음. 현재 `defect_items`는 0건 상태(직전 truncate)이므로 카운터 시드가 안전.
- `subcontractor_master.owner_code`는 42건 모두 NOT NULL/대문자 정상.
- 활성 프로젝트가 1개(SHAW)이므로 `project_id` 기본값 트리거가 단일 프로젝트로 동작. 다중 프로젝트 도입 시 임포트 UI에서 명시 선택 필요(현재도 동일).
- 마스터 데이터 정리(P5)는 별도 단계로 보류.

## 검증 체크리스트 (적용 후)

1. 동일 파일을 연속 2회 업로드 → 두 번째는 "이미 처리된 행"으로 모두 skip, 신규 발번 0.
2. SC번호 컬럼이 비어있는 신규 50행 업로드 → owner별 연속 시퀀스 발급, 유니크 충돌 0.
3. 수동 SC번호(SC-AB-00099) 포함 행 임포트 → 동일 owner의 다음 자동 발번이 100부터 시작.
4. 두 사용자가 동시 업로드 → 시퀀스 겹침 없이 모두 성공.
