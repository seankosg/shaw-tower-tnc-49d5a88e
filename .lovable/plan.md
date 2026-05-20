# OMM Import 팀 필터 추가

## 배경

`docs_omm`의 `team` 컬럼 값은 **Mech / Elec / Supp** 3종입니다. Ronaldo가 업로드하는 OMM 엑셀에는 3개 팀 데이터가 모두 들어 있지만 실제로 신뢰 가능한 것은 Mech, Elec뿐이고 Support 행은 반영되면 안 됩니다. 따라서 임포트 시점에 **반영할 팀을 명시적으로 선택**하게 만들어, 선택되지 않은 팀의 행은 INSERT/UPDATE 모두 건너뛰어야 합니다.

## 동작 요구사항

- OMM 탭(`/docs/import?sub=omm`) 상단에 **Teams to Update** 다중선택 칩(토글 버튼) 표시
  - 옵션: `Mech`, `Elec`, `Supp` (DB 실제 값 그대로)
  - **기본값: 아무 팀도 선택되지 않음**
  - 칩 클릭 시 on/off 토글, 여러 개 동시 선택 가능
- **선택 0개일 때**:
  - `Start import` 버튼 비활성화
  - 안내 문구: "Select at least one team to update."
- **선택 ≥1개일 때**:
  - 파싱된 각 행 중 `row.team`이 선택된 집합에 포함되지 않으면 업서트 단계에서 **skipped** 처리
  - skip 사유 코드: `team_not_selected`, detail: `Team "<X>" not in selected teams`
  - 파일별 결과 카드의 **Skipped** 카운트에 정상 반영
- ABD / Warranty / Spare Part 탭은 영향 없음 (변경 무)

## 구현 범위 (frontend + worker 한정)

1. **`src/contexts/docs-import/types.ts`**
   - `WorkerContext`에 `allowedTeams?: Set<string>` 추가 (선택사항, OMM에서만 사용)
   - `DocsImportContextValue`에 `allowedTeams: string[]`, `setAllowedTeams: (teams: string[]) => void` 추가 (모든 모듈 공통이지만 OMM 외에는 미사용)

2. **`src/contexts/docs-import/createDocsImportProvider.tsx`**
   - `allowedTeams` state 추가, 기본값 `[]`
   - `startImport` 내부에서 worker 호출 시 `allowedTeams: new Set(allowedTeams)`를 `WorkerContext`로 전달
   - context value에 노출

3. **`src/lib/docs-import-workers.ts` — `ommAdapter.upsertWorker`**
   - 루프 진입부에서 `ctx.allowedTeams`가 정의되어 있고 (`size > 0`) `row.team`이 포함되지 않으면 `counters.skipped++` 후 `team_not_selected` outcome push, return
   - 기존 SN 빈 검사 직후에 배치

4. **`src/pages/docs/DocsImportPage.tsx`**
   - OMM `<TabsContent>` 내부 `DocsImportShell` 위에 팀 선택 칩 UI 렌더링
     - `omm.allowedTeams` 기반 토글
     - 옵션 배열은 페이지 상수 `OMM_TEAM_OPTIONS = ['Mech', 'Elec', 'Supp']`
   - 선택 0개일 때 `DocsImportShell`에 새 prop `startDisabledReason="Select at least one team to update."` 전달

5. **`src/components/docs/import/DocsImportShell.tsx`**
   - 새 optional prop `startDisabledReason?: string`
   - `Start import` 버튼 `disabled` 조건에 `!!startDisabledReason` 추가
   - 버튼 위 또는 카드 헤더에 사유 표시 (사유 있을 때만)

## 비범위

- DB 스키마/RLS 변경 없음
- ABD / Warranty / Spare Part 임포트 동작 변경 없음
- 팀별 기본 권한(team-based RLS) 변경 없음 — 순수 임포트 단계 필터링
- 자동 master 등록(HDEC PIC/ENG, Subcontractor)은 기존대로 모든 행에 대해 실행 (skip 대상 행이라도 raw에 등장한 이름은 캐시됨) → 필요 시 후속에서 별도 논의
