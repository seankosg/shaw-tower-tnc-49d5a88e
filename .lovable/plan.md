## 작업 범위

### 1) Subtask 추가 시 Main Trade + Sub Trade 자동 채움

- `AddPunchSubtaskDialog`에 `sub_trade` 필드 추가
  - `defaults` 타입에 `sub_trade?: string | null` 추가
  - 상태 변수 `subTrade` 추가 (open 시 리셋 로직 포함)
  - Main Trade 옆에 Sub Trade Input 렌더링 (2열 그리드 유지)
  - RPC `add_punch_subtask` payload에 `sub_trade` 포함
- `PunchDetailPage.tsx`의 `defaults` 계산부에 `sub_trade: src.sub_trade` 추가
  - 기존 로직(가장 늦은 `planned_start_date` 자식 → 없으면 부모)을 그대로 활용하므로 Main Trade와 동일하게 전달됨

> Main Trade는 이미 prefill되고 있어서 Sub Trade만 추가하면 됨. (사용자 요청 문구는 "Main Trade와 Sub Trade 값도" 이나 실제 누락된 건 Sub Trade 한 가지)

### 2) Punch(T&C Raw Data) 상세 페이지 댓글 기능

DB 측 `punch_comments` / `punch_comment_reads` 테이블과 RLS 정책은 이미 존재. UI 컴포넌트만 신규 작성.

- `src/components/punch/PunchComments.tsx` 신규 작성
  - `SubtestComments`를 템플릿으로 사용
  - props: `punchId`, `punchTeam`, `subcontractorName`, `onCountChange`
  - 기능: 댓글/지시(Instruction)/답글, 수신자 선택(RecipientSelector), 편집·삭제, 한글 자동 번역 패널, 권한 게이트(Instruction은 admin/superuser/senior_user/d_superuser), 미읽음(unread) 표시 + `punch_comment_reads` upsert
  - 테이블·컬럼·읽음 기록 모두 `punch_*`로 치환
- `PunchDetailPage.tsx` 하단(현재 `AddPunchSubtaskDialog` 위)에 `<PunchComments />` 카드 섹션 삽입
  - `punchTeam={item.team}`, `subcontractorName={item.subcontractor_name ?? null}` 전달

### 변경 파일

- `src/components/punch/AddPunchSubtaskDialog.tsx` — sub_trade 필드 추가
- `src/pages/PunchDetailPage.tsx` — defaults에 sub_trade 추가, PunchComments 섹션 마운트
- `src/components/punch/PunchComments.tsx` — 신규 생성 (SubtestComments 기반)

### 비변경

- DB 스키마/RLS (이미 존재)
- 다른 페이지·필드 레지스트리·import/export 로직
