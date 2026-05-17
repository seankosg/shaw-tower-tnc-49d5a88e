## 문제
`code-editor` edge function이 `ppt-builder.ts`(약 1,358줄 / ~12k tokens)의 **전체 파일**을 Claude에 보내고 전체 파일을 다시 받기 때문에 `max_tokens: 4000` 한도에서 응답이 잘려 반환된 결과가 항상 미완성. 그 결과 storage에 잘린 파일이 저장되거나 다운로드가 잘린 채로 나옴.

## 해결 방향: 함수 단위 편집(function-targeted modification)

전체 파일을 주고받는 대신, **수정 대상 함수 하나만** Claude에 보내고, 받은 결과를 원본 파일에 splice 한다.

```
[원본 파일 1358줄]
     │
     ├─ 클라이언트에서 함수 경계 파싱 → 함수 목록
     │
     ├─ 사용자가 함수 선택 + instruction 입력
     │
     ├─ Edge function에 { functionSource, functionName, instruction } 전송
     │     ↓ Claude (max_tokens: 8192)
     │     ← 수정된 함수 본문만 반환
     │
     └─ 클라이언트에서 [start, end] 위치에 splice → 완전한 파일 복원 → 다운로드/저장
```

### 변경 파일

#### 1. `src/lib/code-editor.ts` (신규 함수 추가)
- `parseTopLevelFunctions(source: string): FunctionRange[]` 추가
  - `FunctionRange = { name, kind: 'function' | 'arrow' | 'const-fn', start, end, source }`
  - 매칭 규칙(최상위 들여쓰기 0칸만):
    - `^(export\s+)?(async\s+)?function\s+(\w+)\s*\(` → opening brace 부터 brace counting 으로 end 찾기
    - `^(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?(\([^)]*\)|\w+)\s*=>\s*{` → 동일하게 brace counting
    - 문자열/주석/템플릿 리터럴 내 `{`/`}` 제외(간단한 state machine: `//`, `/* */`, `"..."`, `'...'`, `` `...` ``)
- `spliceFunction(fullSource: string, range: FunctionRange, newFunctionSource: string): string`
- `invokeCodeEditor` 시그니처 변경:
  - 기존 `{ fileContent, instruction, fileType }` → 신규 `{ functionSource, functionName, instruction, fileType }`
  - 반환은 동일 `{ modifiedContent, changeSummary }` 단, 여기서 `modifiedContent` 는 **수정된 함수 소스**만 담음(파일 splice 는 호출 측에서 수행).

#### 2. `supabase/functions/code-editor/index.ts`
- `InputSchema` 변경:
  ```ts
  z.object({
    functionSource: z.string().min(1).max(60_000),
    functionName: z.string().min(1).max(200),
    instruction: z.string().min(1).max(8000),
    fileType: z.enum(['ts', 'yaml']),
  })
  ```
- `EDIT_SYSTEM_PROMPT` 교체:
  > "You are a TypeScript code editor. You will receive a SINGLE function declaration and an instruction. Modify only this function according to the instruction. Return the complete modified function declaration, preserving its signature, name, and indentation, with no surrounding code, no explanation, no markdown fences."
- `userMsg`:
  ```
  Instruction:
  <instruction>

  Function to modify (name: <functionName>):
  ```typescript
  <functionSource>
  ```
  ```
- `callAnthropic` 호출의 `max_tokens` 를 **8192** 로 상향.
- 요약 호출도 `modifiedFunctionSource` 만 보내고 동일하게 한국어 1-2 문장 요약 생성.
- 반환: `{ modifiedContent: <modifiedFunctionSource>, changeSummary }`.
- 입력 검증 실패/Anthropic 에러는 기존 동일하게 4xx/5xx 응답.

#### 3. `src/components/admin/CodeEditor.tsx`
- 활성 파일 로드 후 `parseTopLevelFunctions(activeContent)` 호출, state `functions: FunctionRange[]` 보관.
- 새 UI 요소 (Instruction 섹션 위/내부):
  - **Function selector** (`<Select>`): 함수 이름 + 줄 범위 표시. 예: `buildDashboard  (lines 412–498)`.
  - 선택된 함수 미리보기(접힘식 `<details>`, read-only `<pre>` 처리 길이 제한).
- `handleModify` 변경:
  - 선택된 `range` 없으면 toast 로 안내 후 중단.
  - `invokeCodeEditor({ functionSource: range.source, functionName: range.name, instruction, fileType: 'ts' })` 호출.
  - 응답의 `modifiedContent`(= 수정된 함수)를 `spliceFunction(activeContent, range, modifiedContent)` 로 합쳐 완전한 파일을 state(`splicedFullFile`)에 저장.
  - 미리보기/다운로드/Save 는 **splice 된 전체 파일** 기준으로 동작.
  - "Modification Result" 카드에 `이 함수 수정 (buildDashboard): NN → MM lines` + `전체 파일: 1358 → 1361 lines` 같은 요약 표시.
- 기존 다운로드/Save 로직은 splice 결과를 사용하므로 그대로 유효.

### 미적용/범위 외
- Yaml 파일은 함수 개념이 없어 기존 전체 파일 방식이 필요. 이번 변경에서는 yaml 지원을 제거하지 않고, edge function 입력 스키마는 ts 만 받는 새 경로로 좁히고 fileType 은 `'ts'` 로 고정(현재 사용처도 ts 뿐). 향후 yaml 편집이 필요하면 별도 endpoint로 분리.
- 함수가 너무 길어 단일 함수만으로도 8192 토큰을 초과하는 경우(`ppt-builder.ts`에는 없음)는 차후 분할 대응.
- AST 기반 파싱 대신 정규식 + brace counter 사용 (의존성 추가 없음). ppt-builder.ts 의 모든 최상위 함수가 표준 패턴이라 충분.

### 검증
1. Code Editor 탭 진입 → Function selector 에 `buildDashboard`, `buildSnapshot`, `buildAndDownloadPpt` 등 ppt-builder 의 함수들이 모두 보이는지 확인.
2. 작은 함수(예: `stripFence` 유사한 헬퍼) 선택 → "타이틀 폰트 크기 키워줘" 같은 instruction 으로 수정 → 미리보기에서 해당 함수만 바뀌고 나머지는 동일한지 확인 (`diff` 로 줄 수 비교).
3. 큰 함수(예: `buildDashboard`) 선택 → 수정 후 다운로드 한 파일이 잘리지 않고 1358±N 줄의 완전한 파일인지 확인. 마지막 줄이 `setTimeout(() => URL.revokeObjectURL(url), 5000);\n}` 로 끝나는지 확인.
4. Save to Storage 후 Storage 의 `ppt-builder.ts` 가 완전한 파일인지 (`wc -l`) edge function 로그/Storage 다운로드로 검증.
