## Login Greeting Popup

로그인 성공 직후 화면 한가운데에 사용자 영문 이름과 시간대(접속자 로컬 표준시) 기반 인삿말을 띄우고, 6초 후 자동으로 사라지거나 X 버튼으로 즉시 닫을 수 있는 모달을 추가합니다.

### 인삿말 카피 (Warm & concise, professional 유지)

시간대 인사 (접속자 브라우저 시간 기준):
- 05:00–11:59 → "Good morning"
- 12:00–17:59 → "Good afternoon"
- 18:00–21:59 → "Good evening"
- 22:00–04:59 → "Hello"

표시 형식 (2줄):
```
Good morning, John.
Welcome to SHAW Tower Project Completion Management System.
```

서브텍스트(작게, 한 줄):
```
Have a productive day.
```

이름 추출 로직:
- `profile.hdec_eng_name` 우선 사용 (있을 경우)
- 없으면 `profile.name`에서 영문 토큰만 추출 (`/[A-Za-z][A-Za-z .'-]*/`)
- 그래도 없으면 `login_id`의 첫 토큰(`_` 앞부분)을 Title Case로
- 첫 단어(이름)만 사용 — 예: "John Smith" → "John"

### UI 사양

- shadcn `Dialog` 사용, 화면 정중앙
- 카드 폭 ~ `max-w-md`, padding 넉넉히 (p-8)
- 우상단에 X 닫기 버튼 (Dialog 기본 close)
- 본문 중앙 정렬:
  - 큰 인삿말 (text-2xl, font-semibold)
  - 시스템 환영 문구 (text-base, text-muted-foreground)
  - 하단 작은 서브텍스트 (text-sm)
- 6초 카운트다운 진행바 (하단 얇은 bar, primary 색)
- 사용자가 마우스 hover 시 타이머 일시정지(작은 UX 개선) — 선택사항
- Inter 폰트, 기존 디자인 토큰만 사용 (no playful)

### 동작

- 트리거: `Login.tsx`의 `signIn` 성공 + `is_active=true` → `navigate('/dashboard')` 직후
- 구현: `AuthContext`에 `justLoggedIn` 플래그를 두거나, 더 단순히 `sessionStorage.setItem('shaw_just_logged_in', '1')` 후 `AppLayout` 마운트 시 읽어 모달 1회 표시 후 키 삭제
- 빈도: 매 로그인 시 (요청대로 — 일자 게이트 없음)
- 자동 닫힘: 6초 (`setTimeout`), X 버튼 클릭 시 즉시 닫힘 + 타이머 클리어
- 키보드: ESC로 닫힘 (Dialog 기본)

### 파일 변경

- 신규: `src/components/auth/LoginGreetingDialog.tsx`
  - props: `open`, `onClose`, `name`
  - 내부에서 시간대별 인사 계산, 6초 자동 닫힘, 진행바
- 신규: `src/lib/greeting.ts`
  - `getTimeGreeting(date = new Date()): string`
  - `extractEnglishFirstName(profile, loginId): string`
- 수정: `src/pages/Login.tsx`
  - 로그인 성공 시 `sessionStorage.setItem('shaw_greet', '1')` 후 navigate
- 수정: `src/components/layout/AppLayout.tsx` (또는 최상위 인증 후 레이아웃)
  - 마운트 시 `sessionStorage`에서 플래그 확인 → `LoginGreetingDialog` 렌더 → 닫히면 키 제거
  - `profile`이 로드된 후에만 표시 (이름 필요)

### Edge cases

- profile이 아직 로드 중이면 로드 완료까지 대기 (조건부 렌더)
- 영문 이름을 전혀 추출 못하면 `"there"`로 폴백 → "Good morning, there." 대신 "Good morning." 처럼 이름 부분 생략
- 모달이 열린 상태에서 라우트 이동해도 sessionStorage 키는 1회 표시 후 즉시 제거되므로 중복 노출 없음
