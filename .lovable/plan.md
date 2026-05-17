## 배경

현재 Report Generator(`ReportTab`)의 Module 선택에는 `T&C / Defect / Docs / Punch` 4종만 있습니다. 신규 슬라이드 생성기로 만든 슬라이드는 `category: 'custom'`으로 분류되지만, Module 선택에 대응하는 항목이 없어 사용자가 출력 범위를 제어할 수 없고, 출력 흐름상 모듈 데이터에만 의존하는 구조가 됩니다.

또한 `buildPpt`는 현재 `slideConfig`만 보고 모듈 체크 상태와 무관하게 모든 활성 슬라이드를 출력합니다. 그래서 사용자가 "Defect만 체크" 해도 Composer에서 켜둔 T&C 슬라이드가 그대로 나옵니다 — 이 부분도 같이 정리합니다.

## 변경 사항

### 1. `ReportModule` 타입 확장
`src/lib/report-builder.ts`:
- `export type ReportModule = 'tnc' | 'defect' | 'docs' | 'punch' | 'custom';`
- `buildReport()`는 `'custom'`에 대해 별도 데이터 fetch 없음(기존 KPI bag만 사용). markdown 본문에는 custom 모듈 섹션 없음(설명만 한 줄 추가하거나 그냥 skip).

### 2. `ReportTab` UI에 Custom 체크박스 추가
`src/pages/admin/ReportTab.tsx`:
- `MODULE_OPTIONS`에 `{ id: 'custom', label: 'Custom Slides' }` 추가
- 기본 선택 상태에 `'custom'` 포함
- `canBuild` 조건은 `modules.length > 0` 유지

### 3. PPT 출력 시 카테고리 기반 필터링
`src/components/report/PptExportCard.tsx` (또는 `ppt-builder.ts`에 옵션 추가):
- `buildPpt`에 `modules: ReportModule[]` 옵션 신설
- 슬라이드 레지스트리(`loadSlideRegistry`)에서 각 key의 `category`를 조회해, `modules`에 포함된 카테고리의 슬라이드만 렌더
- `intro`, `overview` 카테고리는 항상 출력(또는 어느 한 모듈이라도 켜져 있으면 출력)
- `custom` 카테고리는 `modules.includes('custom')` 일 때만 출력

### 4. `PptExportCard`에서 modules 전달
- ReportTab → PptExportCard에 현재 선택된 `modules`를 prop으로 전달
- `buildPpt({ ..., modules })` 호출

### 5. 영향 없는 영역
- `SlideComposer`, `slide-registry`, `custom_slides` 테이블, edge function — 변경 없음
- 기존 built-in 슬라이드 로직 — 변경 없음

## 사용자 동작 흐름

1. New Slide Generator로 커스텀 슬라이드 생성 → `custom_slides` 저장 + Composer 노출(기존 그대로)
2. Report Generator → Module 선택에 **Custom Slides** 체크박스 표시
3. Custom Slides 체크 + Generate → PPT 다운로드 시 활성화된 모든 custom 슬라이드 포함
4. Custom Slides 체크 해제 → 다른 모듈만 출력, custom 슬라이드는 건너뜀

## 기술 노트

- `loadSlideRegistry()`는 비동기. `buildPpt` 내부에서 한 번 호출해 category 맵 구축 후 필터에 활용
- 알 수 없는 key(레지스트리에 없음 + custom_slides에도 없음)는 기존처럼 skip
- markdown/JSON 출력에는 custom 데이터가 없으므로 LLM 프롬프트는 그대로 유지(영향 없음)
