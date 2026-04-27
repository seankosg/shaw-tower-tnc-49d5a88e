## 목표

`Admin → Module Control`에서 T&C / Defect 모듈의 상태(중단/재개)를 변경할 때, 단순 토글이나 버튼 클릭만으로 즉시 적용되지 않도록 **2단계 보안 확인**을 추가합니다.

1. **1단계 — 비밀번호 재확인**: 현재 로그인한 관리자의 비밀번호를 다시 입력받아 검증
2. **2단계 — 최종 확인**: 비밀번호가 맞으면 "정말 진행하시겠습니까?" 한 번 더 묻기

이렇게 하면 실수 클릭이나 자리 비움 상태에서의 우발적/악의적 모듈 중단을 방지할 수 있습니다.

## 적용 범위

다음 진입점 모두에 동일한 2단계 흐름을 적용합니다:

- `ModuleControlTab` 의 **Switch 토글** (켜기 → 재개, 끄기 → 중단)
- `ModuleControlTab` 의 **재개 버튼**
- `ModuleControlTab` 의 **중단 다이얼로그 "일시 중단" 확정 버튼**
- `ModulePausedBanner` (상단 배너) 의 **재개 버튼**

## UX 흐름

### 중단(Pause) 시
```text
[Switch OFF] / [중단 버튼]
   ↓
[기존 PauseDialog: 사유/공지/예상재개 입력] → "일시 중단" 클릭
   ↓
[NEW: 비밀번호 재확인 다이얼로그]
   - 비밀번호 입력 (masked)
   - 검증: supabase.auth.signInWithPassword (현재 사용자 email)
   - 실패 시 에러 표시, 재시도 가능
   ↓
[NEW: 최종 확인 다이얼로그]
   "T&C 모듈을 일시 중단합니다. 진행하시겠습니까?"
   [취소] [확인]
   ↓
실제 setStatus 호출 → 토스트
```

### 재개(Resume) 시
```text
[Switch ON] / [재개 버튼] (탭 또는 배너)
   ↓
[NEW: 비밀번호 재확인 다이얼로그]
   ↓
[NEW: 최종 확인 다이얼로그]
   "T&C 모듈을 재개합니다. 진행하시겠습니까?"
   ↓
실제 setStatus(enabled: true) 호출 → 토스트
```

> 참고: 재개의 경우 기존에도 별도 AlertDialog가 있었지만, 이를 **비밀번호 재확인 → 최종 확인** 두 단계로 대체합니다.

## 기술적 변경 사항

### 1. 새 공통 컴포넌트: `src/components/admin/PasswordReverifyDialog.tsx`
- Props: `open`, `onOpenChange`, `actionLabel`(예: "일시 중단" / "재개"), `moduleLabel`, `onVerified()`
- 내부 state: `password`, `submitting`, `error`
- 검증 로직:
  ```ts
  const { user } = useAuth();
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  });
  ```
  - 성공 시 `onVerified()` 호출 후 닫힘
  - 실패 시 한국어 에러("비밀번호가 일치하지 않습니다") 표시, 입력 필드 비우고 재시도 가능
- 다이얼로그 헤더에 잠금 아이콘 + "보안 확인 필요" 안내 문구
- Enter 키 제출 지원

### 2. 새 공통 컴포넌트: `src/components/admin/FinalConfirmDialog.tsx` (또는 기존 AlertDialog 재사용)
- 단순한 "정말 진행하시겠습니까?" AlertDialog
- Props: `open`, `onOpenChange`, `title`, `description`, `confirmLabel`, `confirmVariant`(중단=warning, 재개=default), `onConfirm()`

### 3. `src/pages/admin/ModuleControlTab.tsx` 수정
- `ModuleRow` 내부 state 추가:
  - `pendingAction: { type: 'pause' | 'resume'; pauseData?: ... } | null`
  - `passwordOpen`, `finalOpen`
- 흐름 재배선:
  - **Pause**: 기존 `PauseDialog` confirm 시 → setStatus 호출하지 말고 `pendingAction` 저장 → `passwordOpen=true`
  - **Resume**: Switch ON 또는 재개 버튼 → 기존 AlertDialog 제거하고 바로 `pendingAction={type:'resume'}` 저장 → `passwordOpen=true`
  - 비밀번호 검증 성공 → `passwordOpen=false`, `finalOpen=true`
  - 최종 확인 → `setStatus(...)` 실제 실행 → 토스트
  - 어느 단계든 취소 시 `pendingAction=null`로 초기화 (스위치도 원위치)
- Switch의 낙관적 토글 방지: `checked`는 항상 `status.enabled` 기준으로만 표시, `onCheckedChange`에서 다이얼로그만 띄움 (검증 완료 전엔 실제 상태 변경 X)

### 4. `src/components/layout/ModulePausedBanner.tsx` 수정
- `BannerRow` 의 `onResume`을 즉시 `setStatus` 호출이 아니라:
  - `passwordOpen=true` → 검증 성공 시 → `finalOpen=true` → 확인 시 `setStatus({enabled:true})`
- 동일한 `PasswordReverifyDialog` + `FinalConfirmDialog` 재사용

### 5. 보안 / UX 노트
- `signInWithPassword`로 검증하면 현재 세션이 갱신될 수 있는데, 이는 정상 동작이며 사용자 경험에 영향 없음 (같은 계정 재인증)
- 비밀번호 입력 필드는 `autoComplete="current-password"` 지정
- 비밀번호는 state에만 잠시 보관, 검증 직후 클리어
- 실패 횟수 제한은 이번 범위에서는 적용하지 않음 (필요 시 추후)

## 변경 파일 요약

- 신규: `src/components/admin/PasswordReverifyDialog.tsx`
- 신규: `src/components/admin/FinalConfirmDialog.tsx`
- 수정: `src/pages/admin/ModuleControlTab.tsx` — pause/resume 흐름에 2단계 확인 끼워넣기, 기존 resume AlertDialog 대체
- 수정: `src/components/layout/ModulePausedBanner.tsx` — 재개 버튼에 동일한 2단계 확인 적용
