## 변경 내용

`src/pages/admin/ReportTab.tsx`의 **External LLM Report** 카드를 비활성화하되, 코드는 보존하여 추후 재활성화 가능하도록 함.

## 구현 방식

1. `ReportTab.tsx` 상단에 `const EXTERNAL_LLM_ENABLED = false;` 플래그 추가
2. External LLM Report `<Card>` 전체를 `<details>` 요소로 감싸서 기본 접힘 상태로 표시
   - `<summary>`: "External LLM Report (disabled)" — 토글 가능
   - 펼쳤을 때 카드 내부 인터랙션(버튼/입력)은 `EXTERNAL_LLM_ENABLED`가 false면 모두 `disabled` 처리
   - 카드 상단에 "이 기능은 현재 비활성화되어 있습니다" 안내 문구 추가
3. 관련 state(`model`, `systemPrompt`, `llmOutput`, `llmRunning`)와 `runLlm` 함수는 그대로 유지 (재활성화 시 즉시 복구)
4. `MODELS`, `DEFAULT_SYSTEM_PROMPT` 상수도 그대로 유지

## 영향 범위

- 수정: `src/pages/admin/ReportTab.tsx` 1개 파일
- 백엔드/edge function(`report-llm`)은 변경 없음 — 재활성화 시 그대로 사용 가능
- Report Generator, PPT Export, Design Guide Manager 등 다른 기능은 영향 없음

추후 재활성화는 `EXTERNAL_LLM_ENABLED = true`로 바꾸고 `<details>` → `<Card>` 직접 렌더링으로 되돌리면 됨.
