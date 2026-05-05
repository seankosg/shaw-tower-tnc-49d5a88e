## 목표

ABD / OMM Import 시 Excel에 들어 있는 **HDEC PIC** 또는 **HDEC ENG** 이름이 마스터/프로필에 없는 새 사람이면, Defect Import와 똑같은 방식으로 **자동 등록**되도록 합니다. Warranty는 현재 "Coming soon" 상태이므로, 어댑터가 추가되는 즉시 자동으로 같은 흐름이 적용되도록 공용 위치에 훅을 심어 둡니다.

## 현재 구조

- `src/lib/defect-master-autocreate.ts` 의 `createDefectMasterEnsurer(supabase)` 가 이미:
  - `hdec_pic_master`, `hdec_eng_master`, `subcontractor_master`, `profiles` 를 미리 로드
  - 행마다 `ensureHdecPic` / `ensureHdecEng` 호출 → 마스터에 없으면 INSERT, 그 후 edge function `auto-create-master-user` 로 프로필/사용자 생성
  - `DefectImportContext` 에서만 사용 중
- Edge function `auto-create-master-user` 는 이미 `master_type: 'hdec_pic' | 'hdec_eng'` 를 지원 → **백엔드 수정 불필요**
- ABD/OMM 임포트는 `createDocsImportProvider.tsx` → `adapter.upsertWorker(...)` 흐름이며, `abdAdapter`/`ommAdapter` 의 파싱된 행에는 `hdec_pic_name`, `hdec_eng_name` 이 이미 포함되어 있음
- Warranty(`'warranty'`)는 비활성 탭만 존재, 어댑터 미구현

## 작업 계획

### 1. Ensurer 를 공용 모듈로 승격

- `defect-master-autocreate.ts` 는 그대로 두고(Defect 측 변경 없음), `src/lib/master-autocreate.ts` 를 신규로 추가해 `createDefectMasterEnsurer` 를 `createMasterEnsurer` 라는 이름으로 re-export. 입력 타입(`MasterRowInput`)도 함께 export.

### 2. Docs Import 흐름에 Ensurer 연결

`src/contexts/docs-import/createDocsImportProvider.tsx` 의 `startImport` 안에서:

- `getDefaultProject()` 성공 후, 파일 루프 **시작 전에** `const ensurer = await createMasterEnsurer(supabase as any);` 로 1회만 생성
- 파일 루프 안, `adapter.upsertWorker(...)` **호출 직전에**:
  - 해당 파일의 `parsed` 행을 순회하며 `await ensurer.ensureForRow({ hdec_pic_name: r.hdec_pic_name, hdec_eng_name: r.hdec_eng_name })` 실행
  - Ensurer 내부에 in-memory Set 으로 중복 차단이 이미 있으므로, 동일 이름 반복은 비용 거의 없음
  - `try/catch` 로 감싸 실패 시 `ensurer.warnings` 에만 기록되고 임포트는 계속 진행
- 모든 파일 처리 완료 후 `ensurer.warnings.length > 0` 이면 비-블로킹 토스트로 안내(첫 1~2개 메시지 + 총 개수)

이 순서는 Defect Import와 동일 — upsert **이전**에 마스터/프로필이 만들어져야 후속 team/role 조회가 정상 동작.

### 3. 타입

`DefectMasterRowInput` 의 모든 필드가 이미 optional 이므로, ABD/OMM 행에서 HDEC 두 필드만 넘기면 됨. **타입 변경 없음.**

### 4. Warranty 사전 대응

Ensurer 호출이 공용 `createDocsImportProvider` 에 들어가므로, 추후 Warranty 어댑터가 동일한 패턴으로 추가되기만 하면(`hdec_pic_name`, `hdec_eng_name` 을 행에 노출) **추가 작업 없이** 자동 등록이 동작.

## 변경 파일

- **신규**: `src/lib/master-autocreate.ts` — re-export 래퍼 (`createMasterEnsurer`, `MasterRowInput`)
- **수정**: `src/contexts/docs-import/createDocsImportProvider.tsx` — `startImport` 에서 ensurer 생성 + 행마다 `ensureForRow` 호출 + 마지막 경고 토스트

## 범위 외

- DB 스키마/마이그레이션 변경 없음 (마스터 테이블·edge function 모두 이미 지원)
- Defect Import 코드 변경 없음 (이미 동작)
- Warranty 탭 활성화 없음 (어댑터 추가는 별건)
- Subcontractor / Subsub 자동 등록은 이번 요청 범위(HDEC PIC/ENG)에 한정해 **포함하지 않음**. 추후 동일 `ensureForRow` 호출에 `subcontractor_name` 등을 추가하면 손쉽게 확장 가능

## 검증 방법

1. ABD Import 파일에 신규 `HDEC PIC` 이름 1건 → 임포트 후 `hdec_pic_master` 에 추가되고 프로필 생성 확인
2. OMM Import 파일에 신규 `HDEC ENG` 이름 1건 → 동일 확인
3. 같은 파일 재임포트 시 중복 마스터/프로필이 생기지 않음 (in-memory Set + edge function 자체 lookup 으로 멱등)
4. 기존 Defect Import 동작 무변화
