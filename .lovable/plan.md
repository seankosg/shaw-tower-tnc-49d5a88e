# New Slide Generator — 런타임 슬라이드 엔진 전환

## 목표

현재 New Slide Generator는 결과물(코드)이 앱 빌드에 들어가야만 동작하므로 **Lovable 채팅에 접근 가능한 개발자만** 사용할 수 있습니다. 이를 바꿔, 배포된 앱의 **일반 사용자(권한자)**도 자연어 설명만으로 새 슬라이드를 만들고 즉시 PPT 리포트에 포함시킬 수 있게 합니다.

핵심 아이디어: AI가 **TS 코드 대신 JSON spec**을 만들고, 앱 안의 범용 렌더러가 PPT 내보낼 때 그 spec을 해석해 슬라이드를 그립니다. 코드 동기화·재배포 없음.

```text
사용자 설명 → AI(JSON spec 생성) → custom_slides 테이블에 저장
        → Slide Composer에 즉시 노출 → PPT Export 시 런타임 렌더링
```

## 영향 범위

- **기존 12종 슬라이드는 그대로**(`src/lib/ppt-builder.ts`의 내장 함수 사용). 디자인·데이터·로직 변경 없음.
- **신규 커스텀 슬라이드만** JSON spec 기반으로 렌더링.
- Slide Composer에서 둘이 한 리스트로 보이고 순서·on/off가 통합 관리됨. 출력 PPT도 단순히 이어붙임.
- 기존 리포트 출력은 영향 없음.

## 사용자 흐름 (D.Super User 이상)

1. **Admin → Report → New Slide Generator** 진입
2. **Step 1 Describe**: 슬라이드 제목, 위치, 데이터 소스, 자연어 설명
3. **Step 2 Preview**: AI가 만든 spec을 그대로 **단일 슬라이드 PPTX로 실제 생성 → PNG 썸네일**로 보여줌 (다시 만들기 / 확정 선택)
4. **Step 3 Save**: "Report에 추가" → `custom_slides` INSERT + `ppt_slide_config.slides`에 키 자동 append → 끝. **Lovable 채팅 안내문 완전 제거.**
5. Slide Composer에서 순서·on/off 조정. **삭제 / spec 수정은 Admin 전용.**

## 지원 블록 (MVP, 표·차트 포함)

| 블록             | 용도                                                                |
|------------------|---------------------------------------------------------------------|
| `kpi-card`       | 큰 숫자 + 진행률 바 + 부제                                          |
| `bar-row`        | 단일 가로 진행률 바                                                 |
| `metric-grid`    | 2x2 또는 1xN KPI 그리드                                             |
| `text-block`     | 자유 텍스트(Text Override 토큰 지원)                                |
| `bullet-list`    | 불릿 리스트                                                         |
| `simple-table`   | 작은 표(헤더 + 최대 10행). 열 정렬·폭 지정 가능                     |
| `bar-chart`      | 세로/가로 막대 차트 (pptxgenjs `addChart` 사용)                     |
| `line-chart`     | 라인 차트 (시리즈 N개, x축은 날짜 또는 카테고리)                    |
| `pie-chart`      | 파이/도넛                                                           |
| `stacked-bar`    | 스택 막대 (비율 비교)                                               |

표·차트는 모두 pptxgenjs의 네이티브 `addTable` / `addChart`를 호출하므로 PPT에서 편집 가능한 형태로 들어갑니다.

## 데이터 바인딩

`src/lib/ppt-builder.ts`의 기존 `loadKPIs()` 결과를 그대로 노출합니다.

지원 path (예시):
- 단일값: `tnc.completion.pct`, `tnc.official.actual`, `defect.closure.pct`, `docs.abd.completionPct`, `punch.openCount`
- 시계열: `tnc.scurve.weeks[*].planned`, `defect.scurve.weeks[*].actual`
- 카테고리 배열: `defect.byStage[*]`, `punch.byTrade[*]`

차트 블록은 위 시계열/카테고리 path 하나 이상을 받아 시리즈를 만듭니다. AI 프롬프트에 사용 가능한 path 목록을 항상 주입.

## DB 변경

새 테이블 `custom_slides`:
- 컬럼: `id`, `key`(unique), `label`, `spec`(jsonb), `created_by`, `created_at`, `updated_at`
- RLS:
  - SELECT: 모든 인증 사용자
  - INSERT: D.Super User 이상 (`has_role(uid,'d_superuser') OR has_role(uid,'superuser') OR has_role(uid,'admin')`)
  - UPDATE / DELETE: **Admin only** (`has_role(uid,'admin')`)
- `updated_at` 트리거(`update_updated_at_column`) 부착

`ppt_slide_config.slides` 스키마는 그대로 (key 문자열만 추가됨).

## 기술 구현 (파일별)

### 신규
- `src/lib/custom-slide-spec.ts` — Zod 스키마(`SlideSpec`, 블록 union), 데이터 path 리졸버, 유효성 검사
- `src/lib/custom-slide-renderer.ts` — `renderCustomSlide(pres, spec, kpis, data, C, FONT)` — 블록 타입별 pptxgenjs 호출
- `src/lib/custom-slides-cache.ts` — Supabase에서 `custom_slides` 한 번 로드 후 메모리 캐시(5분 TTL, 변경 시 invalidate)

### 수정
- `src/lib/ppt-builder.ts`
  - `SlideKey` 타입을 union + `(string & {})`로 완화
  - `buildPpt()` 시작부에서 `custom_slides` fetch
  - `runners` 매핑에 없는 key는 `renderCustomSlide(...)` 호출
- `src/lib/slide-registry.ts`
  - `loadSlideRegistry()` 비동기 함수 추가 — 내장 + custom 병합 결과 반환
  - 기존 `SLIDE_REGISTRY` 상수는 내장 전용으로 유지
- `src/lib/slide-config.ts`
  - `reconcile()`에서 custom slide 키도 known set에 포함 (인자로 받음)
- `src/components/admin/SlideComposer.tsx`
  - `loadSlideRegistry()`로 변경, 커스텀 항목에 `Custom` 배지 + 삭제 버튼(Admin only)
- `src/components/admin/SlideCodegen.tsx`
  - Step 2: 단일 슬라이드 PPTX를 임시 생성 → 서버에서 PNG로 변환하거나, 클라이언트에서 pptxgenjs 결과를 LibreOffice 없이 미리보기하기 어려우므로 **HTML 모의 렌더(블록 단위 카드 UI)** 로 대체 (실제 PPT 외관과 최대한 유사한 정적 미리보기)
  - Step 3: 코드/Storage/Lovable 안내문 전부 제거 → `custom_slides` INSERT + `ppt_slide_config` 갱신
- `src/lib/slide-codegen.ts`
  - `addSlideToReport()` 재작성 — Storage append 코드 제거, DB INSERT로 교체
- `supabase/functions/slide-codegen/index.ts`
  - 시스템 프롬프트와 출력 스키마를 **JSON spec(Zod)** 으로 교체
  - `functionCode` 필드 제거, `spec`/`label`/`key`/`summary` 반환
  - 사용 가능한 데이터 path 목록과 블록 카탈로그를 프롬프트에 동봉
  - 응답 spec을 서버에서도 Zod로 검증 후 반환

### 미리보기 전략

실제 PPTX 썸네일은 서버 변환(LibreOffice)이 필요해 비용·복잡도가 큽니다. MVP는 **블록 spec을 HTML로 렌더**(같은 폰트/색 토큰 사용)해 보여주고, "실제 PPT는 Export에서 확인" 이라고 안내합니다. 추후 옵션으로 서버 PNG 미리보기를 붙일 수 있습니다.

## 권한 요약

| 액션                              | 권한                          |
|-----------------------------------|-------------------------------|
| 슬라이드 보기 (Composer/PPT)      | 인증된 모든 사용자            |
| 새 커스텀 슬라이드 추가           | D.Super User 이상             |
| 커스텀 슬라이드 spec 수정         | **Admin only**                |
| 커스텀 슬라이드 삭제              | **Admin only**                |
| 순서/on-off (ppt_slide_config)    | 기존과 동일 (D.Super User 이상)|

## 단계별 작업 순서

1. `custom_slides` 테이블 + RLS 마이그레이션 (Admin-only 수정/삭제)
2. `custom-slide-spec.ts`(Zod) + 데이터 path 리졸버
3. `custom-slide-renderer.ts` — 10개 블록 (kpi-card, bar-row, metric-grid, text-block, bullet-list, simple-table, bar-chart, line-chart, pie-chart, stacked-bar)
4. `ppt-builder.ts` 런타임 라우팅 + custom slide loader 통합
5. `slide-registry.ts` / `slide-config.ts` / `SlideComposer.tsx` 커스텀 슬라이드 노출 + Admin 삭제 버튼
6. `slide-codegen` edge function 프롬프트·스키마 JSON spec 전환
7. `SlideCodegen.tsx` 3-step UI: Step3에서 DB INSERT, Lovable 안내문 제거, HTML 미리보기
8. 샘플 슬라이드 1개로 생성 → Composer 노출 → PPT Export 검증

## 위험 / 메모

- 차트는 pptxgenjs의 chart 옵션 키마다 까다로워, 잘못된 spec이 export 자체를 실패시키지 않도록 렌더러에서 try/catch + fallback(에러 텍스트 블록) 처리.
- spec 버전 필드(`spec.version = 1`)를 처음부터 넣어 추후 스키마 진화 대비.
- `SlideKey` 완화로 타입 좁힘이 일부 깨질 수 있어 그 영향 범위는 구현 시 LSP로 확인 후 최소화.
