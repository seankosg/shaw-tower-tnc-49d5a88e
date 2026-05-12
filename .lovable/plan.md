## Defect Simulation – 협력사 풀다운 추가

### 변경 파일
- `src/pages/DefectSimulationPage.tsx` 만 수정

### 구현 내용

1. **데이터 소스**: `useCommonMasters()` 훅의 `subcontractorOptions` 사용 (Master 테이블 `subcontractor_master`의 active 항목만, legacy union 없음)

2. **상태 추가**:
   - `subcontractorFilter: string` (`'all' | <name>`)
   - URL 파라미터 `sub`와 동기화 (기존 `team`/`stages`/`target`/`delay` 패턴과 동일)

3. **UI**: Team Select 옆에 Subcontractor Select 추가
   - Label: `Subcontractor`
   - Width: `w-[200px]`
   - 첫 항목: `All Subcontractors`
   - 이후 `subcontractorOptions` 정렬 순서대로 렌더

4. **필터 로직**: 기존 `filteredItems` useMemo에 조건 추가
   ```
   .filter(it => subcontractorFilter === 'all' 
     || it.subcontractor_name === subcontractorFilter)
   ```
   Team 필터와 AND로 결합. 이후의 series / stageResults / teamRows 모두 자동 반영.

5. **헤더 N 카운트**, **Recalculate**, **차트/테이블/팀 분해** 등 나머지는 그대로 유지.

### 범위 외
- T&C Simulation 페이지는 변경하지 않음
- 비즈니스 로직 (시뮬레이션 계산) 변경 없음
- legacy 값(Master에 없는 협력사)은 풀다운에 노출되지 않음 — 사용자 요청대로 Master만
