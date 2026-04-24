

## Import 진행 상황 탭 이동 후에도 유지

### 현재 한계

```text
DefectImportPage 의 files 상태는 컴포넌트 로컬 useState
  → 탭 이동(unmount) 시 상태 소실
  → 돌아오면 빈 화면, 진행 중인 import 도 끊긴 것처럼 보임

대조군: Standard Import 는 ImportContext (전역 Provider) 사용 → 탭 이동해도 유지됨
```

### 변경 방향

Standard Import 와 동일한 패턴 적용 — **`DefectImportContext` 신설**해서 상태/로직을 컴포넌트 밖으로 끌어올림.

### 변경 내용

**1. 신규 파일: `src/contexts/DefectImportContext.tsx`**

DefectImportPage 안에 있던 다음 항목을 그대로 이전:
- `interface DefectImportFile` (currentStep / stepDetail / progress / result 등 포함)
- `files` state, `isRunning` state, `summary` state
- `addFiles`, `removeFile`, `clearAll`, `setFileDataDate`
- `importOneFile`, `runImport`(=`startImport`)
- 단계 보고 헬퍼 `reportStep`
- duplicate / similar-master 확인 dialog 상태도 함께 이전

Provider 형태:
```text
export function DefectImportProvider({ children }) { ... }
export function useDefectImport() { ... }
```

**2. `src/App.tsx`**

기존 `<ImportProvider>` 옆에 `<DefectImportProvider>` 추가로 감싸기:
```text
<ImportProvider>
  <DefectImportProvider>
    ...
  </DefectImportProvider>
</ImportProvider>
```

**3. `src/pages/DefectImportPage.tsx`**

- 모든 로컬 state / handler 제거
- `const { files, isRunning, summary, addFiles, ... } = useDefectImport()` 로 교체
- JSX (드롭존, 파일 카드, 단계 인디케이터, summary) 는 그대로 유지
- 컴포넌트는 "view only" 가 됨

**4. `src/components/layout/AppLayout.tsx` — 글로벌 인디케이터 확장**

기존 `GlobalImportIndicator` 가 Standard Import 만 표시 중. Defect Import 도 동시 표시:
- `useDefectImport()` 의 `isRunning` / 진행률 함께 읽음
- 둘 중 하나라도 진행 중이면 헤더에 작은 칩 표시:
  ```
  [Importing TC: 2/5]   [Importing Defect: file.xlsx Step 5/6]
  ```
- 클릭 시 각각 `/import` 또는 `/defects/import` 로 이동

**5. 다이얼로그 (similar-master / duplicate 확인) 처리**

- 다이얼로그 open 상태도 Context 로 이동
- DefectImportPage 에서 다이얼로그 JSX 렌더링 (Context state 참조)
- 사용자가 다른 탭으로 이동한 사이 확인 필요 상태가 되면, 글로벌 인디케이터에 "⚠ Awaiting confirmation" 표시 + 클릭 시 `/defects/import` 로 이동

### 변경하지 않는 항목

- import 비즈니스 로직 (분류, SC No 발급, master ensurer, audit) — 코드 위치만 이동, 동작 동일
- DB 스키마 / 토스트 / 단계 정의
- Standard Import 쪽 (`ImportContext`, `ImportPage`) — 기존 유지
- 파일 객체(File) 자체의 영속화는 하지 않음 — Provider 메모리 보존만 (페이지 새로고침 시는 초기화, 이는 Standard Import 와 동일한 한계)

### 기술 세부사항

- File 객체 + parsed rows 가 메모리에 남아있어야 하므로 sessionStorage / IndexedDB 영속화는 이번 범위 밖 (요구가 "탭 이동" 한정이므로 Provider 메모리로 충분)
- importOneFile 안의 setFiles 클로저는 Context 의 setFiles 를 그대로 사용 — 단계 보고도 자연스럽게 유지
- 페이지 재진입 시 useEffect 없이도 Provider state 가 그대로라 즉시 동일 화면 복원

### 검증

```text
1. Defect Import 시작 → 진행 중 (Step 5) 에 다른 탭(Dashboard) 이동
2. 다시 /defects/import 진입 → 같은 파일 목록, 같은 step dot, 같은 progress 그대로 보임
3. 진행 중인 동안 헤더에 "Importing Defect: ... (Step X/6)" 칩 노출
4. 완료 후 진입해도 결과 summary 가 그대로 남아있음 (clearAll 누르기 전까지)
5. similar-master 확인 다이얼로그가 떠야 하는 시점에 다른 탭에 있어도, 돌아오면 다이얼로그 노출
6. Standard Import 와 Defect Import 동시 실행 시 헤더에 두 개의 인디케이터 동시 표시
7. 페이지 새로고침(F5) 은 초기화 — 이는 정상 (Standard Import 와 동일)
```

