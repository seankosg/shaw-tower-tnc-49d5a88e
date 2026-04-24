

## Subcontractor 재배정 시 SC No 자동 재발급 + 이력 보존

### 동작 시나리오

```text
[사용자 동작]
  Defect Detail 페이지에서 Subcontractor 를 "Acme" → "Mero" 로 변경 후 Save

[시스템 처리]
  1. 변경된 subcontractor_name 의 owner_code 를 subcontractor_master 에서 조회
  2. 기존 SC No 의 owner_code 와 다르면 자동 재발급:
       - 새 owner_code 의 max(SEQ)+1 로 SC-{new}-{NNNNN} 생성
       - subcontractor_issue_source = 'reassigned'
  3. sc_no_history 에 (defect_id, old SC No, new SC No, old/new subcontractor, 사유, 사용자, 시각) 한 줄 INSERT
  4. defect_change_log 에도 subcontractor_issue_no 변경 한 줄 추가 (기존 흐름 유지)
  5. owner_code 가 같으면 (예: 같은 owner 안에서 sub-sub만 변경) SC No 그대로 유지
  6. subcontractor 가 master 에 없거나 owner_code 가 비어있으면 'UNASSIGNED' 로 대체 발급
```

### DB 변경

```text
[신설 테이블] public.sc_no_history
  - id uuid PK default gen_random_uuid()
  - defect_id uuid NOT NULL          (FK 없이 인덱스만)
  - issue_no text NOT NULL           (조회 편의)
  - old_subcontractor_issue_no text
  - new_subcontractor_issue_no text
  - old_subcontractor_name text
  - new_subcontractor_name text
  - old_owner_code text
  - new_owner_code text
  - reason text                       ('reassigned' | 'manual_edit' | 'admin_bulk')
  - changed_by uuid
  - changed_at timestamptz default now()
  - INDEX (defect_id, changed_at desc)

[RLS]
  - SELECT : authenticated 전체 read
  - INSERT : changed_by = auth.uid() OR is_admin_or_superuser
  - UPDATE/DELETE : admin only
```

### 코드 변경

**[수정] `src/lib/defect-utils.ts`**
- 헬퍼 추가:
  - `extractOwnerCodeFromIssueNo(scNo): string | null` — `SC-{CODE}-{SEQ}` 에서 CODE 파싱
  - `buildNextSubcontractorIssueNo(ownerCode, currentMaxSeq): string`

**[수정] `src/pages/DefectDetailPage.tsx` (handleSave)**
- `canEditResponsibility` 분기 안에서 subcontractor_name 이 바뀌었는지 감지
- 바뀐 경우:
  1. `subcontractor_master` 에서 새 이름의 `owner_code` 조회 (대소문자 무시 trim 매칭, type='sub' 우선)
  2. `extractOwnerCodeFromIssueNo(record.subcontractor_issue_no)` 와 비교
  3. 다르면:
     - `select max(sequence) from defect_items where subcontractor_issue_no like 'SC-{NEW}-%'` 로 다음 SEQ 산출
     - payload.subcontractor_issue_no = 새 SC No
     - payload.subcontractor_issue_source = 'reassigned'
     - 저장 후 sc_no_history INSERT
- 사용자가 직접 subcontractor_issue_no 도 같이 수정한 경우는 사용자 입력값을 우선 (source='manual' 유지)
- 중복 체크 로직(라인 171–185)은 그대로 적용

**[추가] Detail 페이지 UI**
- "Subcontractor Issue No History" 카드 (Card + 작은 표):
  - sc_no_history where defect_id = 현재 결함, 최근 10건
  - 컬럼: When | Old SC No | New SC No | Old Subcontractor | New Subcontractor | Reason | By
- 상단 SC No 인풋 옆에 작은 배지: source='reassigned' 시 "Reassigned" 표시

### 변경하지 않는 항목

- Import 경로 (`buildSubcontractorIssueAssignments`) 는 그대로 — 신규 import 행에는 영향 없음
- Quick Update / Mobile Update 페이지의 SC No 처리 — Subcontractor 변경 권한 자체가 'team'/'full' 한정이므로 동일 로직 추후 확장 가능 (이번 변경 범위 밖)
- 기존 데이터 일괄 보정 안 함 (필요시 별도 Admin 도구로 분리)

### 검증

```text
1. Subcontractor 만 'Acme'(ABC) → 'Mero'(MRO) 로 바꾸고 저장
   → SC No 가 SC-ABC-00012 → SC-MRO-{새SEQ} 로 자동 변경
   → sc_no_history 에 1행 추가, source='reassigned'
2. 같은 owner 의 sub-sub 만 바꾸면 SC No 변동 없음, history 도 추가 안 됨
3. 사용자가 SC No 를 직접 수정하면 owner 자동 변경 없이 입력값 유지(source='manual')
4. Detail 페이지 하단에 SC No 변경 이력 표 노출
5. 동일 SC No 중복 시 기존 중복 토스트로 차단
6. Subcontractor 가 master 에 없으면 SC-UNASSIGNED-{SEQ} 발급 + history 기록
```

