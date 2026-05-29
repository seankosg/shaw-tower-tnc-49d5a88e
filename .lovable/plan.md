# New Slide Generator — Preview 창에 실제 슬라이드 렌더

## 문제
현재 Step 2 미리보기는 레이아웃 이름과 블록 배지(`kpi-card`, `bar-chart` 등)만 표시. 사용자는 실제로 어떻게 보일지 알 수 없어 "Report에 추가" 전에 검증 불가.

## 목표
Step 2 미리보기 패널에 **실제 데이터로 채워진 슬라이드를 1280×720 HTML 으로 렌더**해서 보여준다. PPT Export 결과와 시각적으로 동일한 레이아웃·수치.

## 변경 사항

### 1. 신규: `src/components/admin/SlideSpecPreview.tsx`
- Props: `spec: SlideSpec`, `kpis: KpiBag | null`, `loading?: boolean`
- 고정 1280×720 캔버스를 `transform: scale()` 으로 부모 폭에 맞춰 축소 (16:9 유지)
- `custom-slide-renderer.ts` 와 동일한 색상/폰트 토큰 사용 (PPT 와 동일한 다크 네이비 배경)
- `layoutBlocks()` 와 동일한 자동 배치 로직 (1열/2열/3열, 좌표 기반) → 별도 헬퍼로 추출 후 공유
- 블록별 HTML 렌더:
  - `kpi-card` / `bar-row` / `metric-grid` / `text-block` / `bullet-list` / `simple-table` → 순수 HTML+Tailwind
  - `bar-chart` / `line-chart` / `stacked-bar` / `pie-chart` → recharts 사용 (`ResponsiveContainer` + 적절한 컴포넌트)
- 데이터가 `null` 일 때는 모든 값을 `—` 로 표시 (구조 미리보기)
- 렌더 에러는 블록 안에 빨간 안내 텍스트로 표시 (PPT 렌더와 동일 fallback 정책)

### 2. 공유 헬퍼 추출: `src/lib/custom-slide-layout.ts`
- `layoutBlocks(spec)` 와 캔버스 상수 (`SLIDE_W`, `SLIDE_H`, `BODY_X/Y/W/H`) 를 분리
- `custom-slide-renderer.ts` 도 새 모듈에서 import 하도록 수정 (중복 방지)

### 3. KPI 데이터 로딩 — `SlideCodegen.tsx`
- Step 2 진입 시 (또는 draft 열람 시) `buildReport` + `loadKPIs` 를 호출해 `kpiBag` 구성
- 옵션: `modules: spec` 에 선언된 dataSources, `sections` 는 KPI 산출에 필요한 최소값으로 고정 (`{ snapshot:true, scurve:true, forecast:true, actionPlan:true }`)
- 호출은 컴포넌트 안에서 lazy import (`await import('@/lib/report-builder')`) 로 페이지 진입 비용 분산
- 로딩 중에는 미리보기 캔버스에 스피너 + "Loading project data…" 표시, 그 동안에도 블록 구조는 placeholder 로 즉시 표출
- 데이터는 컴포넌트 unmount 까지 캐시 (한 번만 빌드)

### 4. UI 배치 — `SlideCodegen.tsx` Step 2
- 기존 메타 카드 위쪽에 `<SlideSpecPreview>` 신규 영역 (border + bg-muted/20)
- 우측 상단 작은 "Refresh data" 아이콘 버튼 → KPI 재빌드
- "AI 요약" 과 "레이아웃/블록 배지" 카드는 미리보기 하단으로 이동 (보조 정보)

## 영향 범위
- 신규: `src/components/admin/SlideSpecPreview.tsx`, `src/lib/custom-slide-layout.ts`
- 수정: `src/lib/custom-slide-renderer.ts` (헬퍼 import 만), `src/components/admin/SlideCodegen.tsx`
- DB / PPT Export 동작 변동 없음
- recharts 는 이미 프로젝트에 포함됨 → 신규 의존성 없음

## 기대 효과
- 사용자가 "Report에 추가" 전 실제 결과 확인 가능 → 잘못된 spec 으로 인한 재작업 감소
- Draft 목록에서 열어볼 때도 즉시 시각화 → 비교/선택이 직관적
