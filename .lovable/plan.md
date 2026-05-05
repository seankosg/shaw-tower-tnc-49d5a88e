문제 원인을 확인했습니다.

- `HDEC-AR-SHD-2405-01-51`의 DB 값은 `sub1_approval_status = 'WIP'` 이지만 `current_status = null` 입니다.
- ABD Raw Data 화면에서 사용자가 보고 있는 `Overall Status` 컬럼은 실제로 계산된 `overall_status`가 아니라 DB 컬럼 `current_status`를 보여주고 있습니다.
- 즉, 화면 계산 로직은 이미 `WIP`를 만들 수 있지만, 표에 표시되는 컬럼이 계산값이 아니라 저장값이라서 `null`로 보이는 상태입니다.

진행 계획

1. Raw Data의 Overall Status 표시 로직 수정
- ABD Raw Data 테이블에서 `Overall Status`가 비어 있으면 `computeOverallStatus(...)`의 계산값을 표시하도록 수정합니다.
- 필요하면 컬럼 자체를 진짜 파생값(`overall_status`) 기준으로 렌더링/필터링하도록 정리합니다.
- 이렇게 하면 기존 데이터가 `current_status = null`이어도 즉시 `WIP`가 화면에 보입니다.

2. 저장 시 current_status 자동 동기화
- Drawing Detail 저장 로직에서 `sub1/2/3` 값들을 정리한 뒤, 최종 `computeOverallStatus(...)` 값을 `current_status`에도 함께 저장하도록 수정합니다.
- 즉 앞으로는 1st/2nd/3rd status/date를 바꾸면 Overall Status가 자동으로 DB에도 반영됩니다.

3. Bulk Edit도 동일 규칙 적용
- Raw Data의 Bulk Edit로 `sub1/2/3_approval_status`나 관련 cycle 날짜를 수정할 때도 `current_status`를 재계산해 함께 저장하도록 맞춥니다.
- Detail 화면에서만 맞고 Bulk Edit에서 다시 어긋나는 문제를 방지합니다.

4. Import 경로도 동일 규칙 적용
- ABD import 시 `current_status`를 원본 엑셀값에 의존하지 않고 cycle 데이터 기준으로 계산/동기화하도록 정리합니다.
- 신규 업로드/재업로드 후에도 Overall Status가 일관되게 유지됩니다.

5. 기존 데이터 보정
- 이미 저장된 ABD 행들 중 `current_status`가 비어 있거나 오래된 값인 데이터는 일괄 보정합니다.
- 이렇게 해야 필터, export, 대시보드 등 `current_status`를 참조하는 다른 화면에서도 동일하게 맞습니다.

기술 상세

- 수정 대상
  - `src/pages/docs/DocsRawDataPage.tsx`
  - `src/pages/docs/DocsDrawingDetailPage.tsx`
  - `src/lib/bulk-edit.ts`
  - `src/contexts/DocsImportContext.tsx`
  - 필요 시 기존 ABD 데이터 보정용 DB migration

- 핵심 방향
  - ABD의 `current_status`를 사실상 “Overall Status의 저장본”으로 취급
  - 화면 계산값과 DB 저장값이 항상 같은 규칙을 따르도록 단일화
  - `WIP`는 기존 `computeOverallStatus` 규칙대로 `UR`과 유사한 active 상태로 유지

- 예상 결과
  - `1st/2nd/3rd` 중 어느 cycle이든 `WIP`면 Overall Status가 자동으로 `WIP`
  - `A/B/C/UR/WIP` 변경 시 Raw Data, Detail, Bulk Edit, Import 결과가 서로 일치
  - 현재 문제의 도면 `HDEC-AR-SHD-2405-01-51`도 보정 후 `WIP`로 표시

승인해주시면 이 계획대로 바로 수정하겠습니다.