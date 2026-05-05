현재 상태 확인 결과:

- **Subcontractor**: ABD Bulk Edit에서 이미 `subcontractor_master`에서 active 항목들을 불러와 select로 제공 중 (단, sub/subsub 타입만 필터). 추가로 "free text" 옵션도 있어 두 줄로 표시되어 혼란스러움.
- **HDEC PIC**: 현재 `inputType: 'text'` (자유 텍스트). 마스터 미사용.
- **HDEC ENG**: 현재 `inputType: 'text'` (자유 텍스트). 마스터 미사용.

`hdec_pic_master`와 `hdec_eng_master`는 Admin 탭에 이미 존재하며 `name`, `is_active` 컬럼을 가집니다.

진행 계획

1. ABD Raw Data Bulk Edit 정비
- HDEC PIC를 `inputType: 'select'`로 변경, `hdec_pic_master`에서 active한 name 목록을 옵션으로 사용
- HDEC ENG를 `inputType: 'select'`로 변경, `hdec_eng_master`에서 active한 name 목록을 옵션으로 사용
- Subcontractor select는 그대로 두되, 라벨을 "Subcontractor"로 정리하고 free text 옵션은 제거 (마스터에 없는 값이 필요하면 Admin에서 추가하도록 유도)
- 마스터 옵션 로딩은 페이지 마운트 시 한 번만 수행 (이미 `subcontractorOptions` 패턴이 있어 동일 구조로 추가)

2. Detail 페이지에도 동일하게 적용 (선택)
- Drawing Detail 페이지 HDEC PIC/ENG 입력도 마스터 기반 select가 되도록 정렬해 일관성 유지
- 이미 `statusPool`에 `hdec_pic_name` / `hdec_eng_name` distinct 값을 모으고 있는데, 이를 `hdec_pic_master` / `hdec_eng_master` 기반으로 교체

기술 상세

- 수정 대상
  - `src/pages/docs/DocsRawDataPage.tsx`
    - `hdec_pic_master` / `hdec_eng_master` fetch 추가, state로 보관
    - `bulkFields`에서 `hdec_pic_name`, `hdec_eng_name`을 select로 변경
    - free-text Subcontractor 옵션 제거
  - `src/pages/docs/DocsDrawingDetailPage.tsx` (옵션)
    - 마스터에서 옵션 로드 후 select 옵션으로 사용

- 동작 방향
  - 옵션 = master.name where is_active = true, 알파벳 순
  - 마스터에 없는 이름은 입력 불가 (필요한 경우 Admin → HDEC PIC/ENG Master에서 먼저 추가)
  - Subcontractor는 기존대로 master id를 저장하면서 companion으로 name도 저장

- 예상 결과
  - Bulk Edit에서 HDEC PIC/ENG/Subcontractor가 모두 Admin 마스터 목록과 1:1 일치
  - 잘못된 자유 텍스트 입력으로 인한 데이터 불일치 방지

승인해주시면 바로 수정하겠습니다.