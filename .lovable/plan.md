## 문제 진단

현재 `src/components/admin/CodeEditor.tsx` 는 5개 섹션(Current Version / Bootstrap / Instruction / Result / Version History)이 평면적으로 나열되어 있어, 처음 쓰는 사람이 "어디서 시작해서 무엇을 눌러야 적용이 끝나는지" 파악하기 어렵습니다. 특히:

- **Current Version** 박스가 맨 위에 있고 "Sync from codebase" 같은 복구용 고급 버튼이 가장 눈에 띄게 노출됨 → 일반 사용자는 무엇부터 눌러야 할지 혼란.
- 핵심 흐름(지시 → AI 수정 → 저장/다운로드 → Lovable 채팅창에 적용 안내)이 페이지 중간~하단에 분산됨.
- 수정 결과에서 "Download Modified File" 와 "Save to Storage" 두 버튼이 동등하게 보여 어느 것을 먼저 눌러야 하는지 알 수 없음. 실제로는 **저장 → 다운로드 → Lovable 채팅창에 붙여넣기** 순서가 자연스러움.
- 다운로드 후 나타나는 "Lovable에 적용하는 방법" 안내가 details 박스 안에 갇혀 있어, 마지막 한 걸음을 놓침.

## 새로운 흐름 (3-Step Wizard)

상단에 항상 보이는 작은 상태바 + 아래로 진행되는 3단계 카드로 재구성합니다.

```text
┌─ Status bar ───────────────────────────────────────────────┐
│  ppt-builder.ts · Active: 2026-05-17 07:00 · 1,449 lines    │
│  [Download current]  [⚙ Advanced ▾]                          │
└─────────────────────────────────────────────────────────────┘

┌─ Step 1. Describe your change ─────────────────────────────┐
│  ▢ Textarea (예시 placeholder 포함)                          │
│  [✨ Generate edit with Claude]                              │
└─────────────────────────────────────────────────────────────┘
        ↓ (after AI runs)
┌─ Step 2. Review the proposed edit ─────────────────────────┐
│  Target: createSlide11_CloseOut (L1023–1187)                │
│  Summary: warranty draft → subcon Signed, 카드 높이 …       │
│  [Preview file ▾]                                            │
│  [↺ Discard]      [Looks good → Continue]                   │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─ Step 3. Apply to your app ────────────────────────────────┐
│  1) [💾 Save as new active version] ✅                      │
│  2) [⬇ Download updated ppt-builder.ts] ✅                  │
│  3) Lovable 채팅창에 파일 업로드 + 아래 문구 전송           │
│     ┌──────────────────────────────────────────────────┐    │
│     │ ppt-builder.ts를 업로드한 파일로 교체해주세요  📋│    │
│     └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

▾ Advanced  (collapsed by default)
   • Sync from codebase  (잘린 파일 복구용)
   • Upload initial file (active 없을 때만 자동 노출)
   • Version history table  +  Restore
```

### 단계별 인터랙션 규칙

- **Step 1** 은 active 파일이 있을 때만 활성화. active 없으면 "먼저 Advanced → Sync from codebase 를 눌러 초기화하세요" 안내 후 자동으로 Advanced 패널을 펼침.
- **Step 2** 카드는 `modifiedContent` 가 있을 때만 나타남. 비어 있을 땐 회색의 "Generate edit 를 먼저 실행하세요" 플레이스홀더.
- **Step 3** 카드는 Step 2 에서 "Looks good" 을 누른 뒤에만 활성. 내부 3개 단계(Save → Download → Apply) 는 체크리스트 형태로 순서대로 활성화 — 이전 단계가 끝나야 다음 버튼이 enable.
- 완료 시 "🎉 Done — Lovable 채팅창에 알려주면 적용이 끝납니다" 토스트 + 모든 단계 리셋.
- **Advanced 패널**: shadcn `<Collapsible>` 로 접기. 기본 닫힘. Current version 의 메타데이터 표시, Sync from codebase, Version history, Bootstrap upload 가 여기로 이동.

### 시각적 처리

- 각 Step 카드 헤더에 번호 배지(`1`, `2`, `3`) + 상태(점선/실선/✓) 로 진행감 표현.
- 비활성 단계는 `opacity-60 pointer-events-none` 로 흐리게.
- 핵심 액션 버튼은 primary, 보조 액션은 outline/ghost 로 통일 — 현재처럼 동등한 무게로 두 개가 나란히 놓이지 않게.

## 기술 변경 사항

수정 파일은 `src/components/admin/CodeEditor.tsx` 단 1개 (UI 재구성만; 로직 함수 `handleModify` / `handleSave` / `handleDownload` / `handleSyncFromCodebase` / `handleBootstrap` / `handleRestore` 는 그대로 재사용).

- 새 상태: `step3Step: 'save' | 'download' | 'apply' | 'done'` — Step 3 내 체크리스트 진행 추적.
- `<Collapsible>` (shadcn 이미 있음, 없으면 단순 `useState` 토글 + 화살표 아이콘).
- 토스트 메시지는 한국어 유지(현 코드와 동일).
- shadcn 디자인 토큰만 사용 (직접 색상 X).

## 변경하지 않는 것

- `src/lib/code-editor.ts` (helper 들 그대로)
- `code-editor` edge function
- DB 스키마 / Storage 버킷 정책
- `src/lib/ppt-builder.ts` 본문

## 검증

1. Admin → Report → Code Editor 진입 시 상태바 + Step 1 만 활성, Step 2/3 흐리게.
2. instruction 입력 → "Generate edit" → Step 2 활성, 요약·대상 함수 표시.
3. "Looks good" → Step 3 활성, Save → Download → Apply 순서로 enable.
4. Advanced 토글 클릭 시 Sync / Version history / Bootstrap 노출.
5. active 파일이 없는 상태로 진입하면 Advanced 가 자동 펼쳐지고 "Sync from codebase" 가 강조됨.
