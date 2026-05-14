## 목표
Photo OCR 업로드/Parse/Apply 진행 중에 사이드바 다른 메뉴로 이동했다가 `/defects/import`로 돌아와도, 진행 중인 작업과 화면 상태(파일 목록·썸네일·진행률·리뷰 테이블·Summary)가 그대로 유지되도록 한다.

## 원인
현재 `PhotoOcrPanel.tsx`가 모든 상태(`files`, `reviewItems`, `parseProgress`, `applyProgress`, `summary`, `dataDate`, `phase`, `previewItem`)를 컴포넌트 로컬 `useState`로 보관한다. 라우트를 떠나면 컴포넌트가 언마운트되며 상태가 소실되고, 진행 중이던 `for` 루프는 더 이상 UI에 반영되지 않는다.

## 변경 사항

### 1. 새 파일: `src/contexts/PhotoOcrContext.tsx`
- `PhotoOcrProvider`가 기존 `PhotoOcrPanel`의 모든 state를 끌어올려 보관
  - `dataDate, phase, files, reviewItems, parseProgress, applyProgress, summary, previewItem`
- 실행 함수도 컨텍스트로 이전: `addFiles, removeFile, clearAll, runParse, reMatchOne, updateItem, runApply, setDataDate, setPreviewItem`
- `runParse`/`runApply`의 비동기 루프는 컨텍스트 내부에서 setter를 호출 → Provider가 마운트된 상태이면 패널이 사라져도 진행 계속
- `usePhotoOcr()` 훅 export

### 2. `src/App.tsx`
- 81번 라인의 `<DefectImportProvider>` 안쪽에 `<PhotoOcrProvider>` 래핑 추가 (인증된 사용자 전체 트리에서 살아있도록)

### 3. `src/components/import/PhotoOcrPanel.tsx`
- 모든 `useState` 제거 → `usePhotoOcr()` 훅에서 값/액션 구독
- JSX/UI는 그대로 유지 (시각적 변경 없음)
- `inputRef`만 컴포넌트 로컬 유지

### 4. `src/components/layout/AppSidebar.tsx`
- `usePhotoOcr()`로 phase 구독, `phase === 'parsing' | 'applying'`이면 "Defect Import" 메뉴 옆에 작은 spinner + `done/total` 배지 표시 → 백그라운드 작업이 돌고 있음을 시각화

### 5. 테스트: `src/test/photo-ocr-context.test.ts` (신규)
- Provider 단독으로 `runParse` 호출 후 컨슈머를 언마운트해도 진행이 끝까지 가는지 확인 (`callPhotoOcr`/`fetchExistingDefects` mock)

## 한계 (사용자에게 안내)
- 라우트 이동(앱 내 SPA 네비게이션)은 OK.
- 브라우저 새로고침/탭 닫기/다른 사이트 이동 시에는 메모리에 있던 사진이 사라져 작업이 중단됨. `beforeunload` 핸들러로 확인 다이얼로그를 띄워 실수 방지.
- 실제 DB 백그라운드 잡으로 만들려면 별도 워커/서버사이드 작업이 필요(이번 범위 외).