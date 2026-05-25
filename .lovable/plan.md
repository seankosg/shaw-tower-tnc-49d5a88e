신규 Subtask Dialog 자동 채움 필드에 Subcontractor / Subsub / HDEC PIC / HDEC ENG 4개를 추가합니다.

## 변경 파일

### 1) src/pages/PunchDetailPage.tsx (lines 617–630)
`defaults` 객체에 4개 필드 추가. 동일한 "첫 child(item_no 정렬) 우선, 없으면 parent" 규칙 적용:
- subcontractor_name
- subsub_name
- hdec_pic_name
- hdec_eng_name

### 2) src/components/punch/AddPunchSubtaskDialog.tsx
- `Props.defaults` 타입에 위 4개 필드 추가 (string | null)
- state 추가: subcontractor, subsub, hdecPic, hdecEng
- 초기 useState + 다이얼로그 open 시 useEffect 재초기화 양쪽에 prefill 로직 추가
- Identity 입력 grid에 4개 `<Input>` 추가 (Subcontractor, Subsub, HDEC PIC, HDEC ENG)
- handleSubmit payload에 4개 필드 포함 (빈 문자열은 null 처리)

## 검증 시나리오
- Summary + child 있음 → 첫 child 값으로 4개 모두 자동 채워짐
- Summary + child 없음 → parent 값으로 자동 채워짐
- 사용자 수정 후 저장 → 수정값이 RPC payload로 전달
- 빈 값 → null 저장

## 비고
RPC `add_punch_subtask`는 텍스트로 저장만 함. 신규 subcontractor/HDEC 인명 입력 시 master 자동 등록(`createMasterEnsurer`)은 import 경로에서만 동작하며, 이 변경 범위에는 포함하지 않음.