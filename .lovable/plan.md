## 목표

HDEC 소속 사용자가 한글로 댓글을 작성하면, **저장 전**에 입력창 자체에서 영어로 번역 미리보기 → 사용자가 검토/수정 → 최종 영어 텍스트만 DB에 저장.

## 핵심 결정사항 (확정)

- **기본 저장 형식**: 영어만 (한글은 DB에 남기지 않음)
- **적용 범위**: Subtest 댓글 + Defect 댓글 모두
- **활성화 조건**: `profile.user_type === 'hdec'` 인 사용자만 번역 UI 노출
- **DB 스키마 변경 없음**: 기존 `message` 컬럼만 사용 (영문 결과만 저장)
- **AI 모델**: `google/gemini-2.5-flash-lite` (빠르고 저렴)

## UX 흐름

```text
[입력창]
 ┌──────────────────────────────────────┐
 │ 안녕하세요, 이 부분 확인 부탁드립니다 │  ← 한글 입력
 └──────────────────────────────────────┘
       [🌐 Translate to English]   [Send] (비활성)

   ↓ 클릭

[원문 표시 (읽기 전용, 작게)]
   "안녕하세요, 이 부분 확인 부탁드립니다"

[영문 입력창 (편집 가능)]
 ┌──────────────────────────────────────┐
 │ Hello, please review this part.      │  ← 수정 가능
 └──────────────────────────────────────┘
       [↻ Re-translate]  [✕ Cancel]  [Send] (활성)
```

- **Send 버튼**: 번역 패널이 열려 있을 때는 "영문 입력창 내용"만 저장. 닫혀 있고 한글이 감지되면 Send 비활성 + 안내("Translate first")
- 한글이 전혀 없는 입력(영문/숫자만)은 번역 단계 없이 바로 Send 가능
- **Edit 모드**도 동일 적용 (수정 시에도 한글 → 영문 번역 후 저장)

## 작업 항목

### 1. Edge Function: `translate-text`
- 입력: `{ text: string, targetLang?: 'en' }`
- 출력: `{ translated: string }`
- Lovable AI Gateway 호출 (`google/gemini-2.5-flash-lite`)
- System prompt: "Translate to natural professional English used in construction/QA reports. Preserve technical terms, numbers, IDs. Output only the translation, no explanations."
- CORS, JWT 검증, zod 입력 검증, 429/402 에러 처리

### 2. 공용 훅: `useTranslateToEnglish`
- 위치: `src/hooks/useTranslateToEnglish.ts`
- `containsKorean(text)` 헬퍼: `/[\u3131-\uD79D\uAC00-\uD7AF]/`
- `translate(text)` → edge function 호출, 로딩/에러 상태 관리
- 마지막 결과 캐싱 (동일 입력 재호출 방지)

### 3. 공용 컴포넌트: `<TranslatePanel>`
- 위치: `src/components/comments/TranslatePanel.tsx`
- props: `originalText`, `onConfirm(englishText)`, `onCancel`
- 내부에서 자동으로 1회 번역 호출 → 결과를 편집 가능한 textarea로 표시
- "Re-translate" 버튼 제공
- HDEC 사용자에게만 부모에서 렌더링

### 4. `SubtestComments.tsx` 수정
- `useAuth()`에서 현재 user의 `user_type` 가져오기 (이미 컨텍스트에 있음)
- `isHdec = profile.user_type === 'hdec'`
- 신규 작성 / 수정 모드 모두에 다음 로직:
  - `isHdec && containsKorean(message)` → "Translate to English" 버튼 노출, Send 비활성
  - 클릭 시 `<TranslatePanel>` 펼침 → 확정된 영문이 `message` 상태로 교체 → Send 가능
- 비-HDEC 사용자는 기존 동작 그대로

### 5. `DefectComments.tsx` 수정
- 위 4번과 동일 패턴 적용

### 6. (선택) Plan 파일 업데이트
- `.lovable/plan.md`에 이 기능 항목 추가

## 기술 세부사항

- **DB 스키마 변경 없음** → 마이그레이션 불필요
- **저장 데이터**: 항상 영문만 (`message` 단일 컬럼)
- **HDEC 판별**: AuthContext의 `user_type`이 이미 노출되어 있어 추가 쿼리 불필요
- **에러 처리**: 번역 실패 시 toast + 한글 그대로 저장은 차단 (Send 계속 비활성). 사용자가 직접 영문으로 수정해서 진행 가능
- **비용**: gemini-2.5-flash-lite는 매우 저렴 → 무료 $1 AI balance로 수천 건 처리 가능

## 영향 범위 (변경 파일)

- `supabase/functions/translate-text/index.ts` (신규)
- `src/hooks/useTranslateToEnglish.ts` (신규)
- `src/components/comments/TranslatePanel.tsx` (신규)
- `src/components/defects/SubtestComments.tsx` (수정)
- `src/components/defects/DefectComments.tsx` (수정)
- `.lovable/plan.md` (수정, 선택)
