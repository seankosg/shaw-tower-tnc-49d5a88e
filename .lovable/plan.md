## 목표
Admin → Report 탭에서 현재 Markdown만 생성/다운로드되는 리포트 데이터를, 동일한 소스로 **JSON 형식**으로도 함께 내보낼 수 있게 한다. LLM에는 기존처럼 Markdown을 보내고, JSON은 사용자가 별도 분석·아카이브·외부 시스템 입력용으로 활용한다.

## 동작
- "Generate" 버튼을 누르면 Markdown + JSON 두 산출물이 한 번에 만들어진다.
- 화면에 탭 두 개(Markdown / JSON)로 미리보기 표시.
- 각각에 대해 Copy, Download 버튼 제공 (`.md`, `.json`).
- 옵션(모듈/섹션/스냅샷 날짜/MC 날짜/Delay mode/Data date/T&C Guide 포함 여부)은 두 산출물에 동일하게 적용.

## JSON 스키마 (요지)
하드코딩 없이 Markdown에 들어가는 것과 **동일한 계산 결과**를 구조화하여 노출:

```text
{
  "meta": {
    "generatedAt": "2026-05-16T...Z",
    "dataDate": "2026-05-15",
    "mcDate": "2026-06-15",
    "delayMode": "penalty",
    "modules": ["tnc","defect","docs","punch"],
    "sections": ["dashboard","progress","simulation","snapshots"]
  },
  "tnc": {
    "totals": { "total": 1797, "t1": 1289, "t2": 828, "r2s": 10 },
    "plannedToDate": { "t1": ..., "t2": ..., "r2s": ... },
    "requiredPace": { ... },
    "snapshots": [
      { "date": "2026-05-30",
        "t1": { "predicted": 0.999, "actual": 0.717, "doneNow": 1289, "forecastAdditional": 506, "predictedTotal": 1795 },
        "t2": { ... }, "r2s": { ... } }
    ]
  },
  "defect": { "totals": {...}, "snapshots": [...] },
  "docs":   { "abd": {...}, "omm": {...}, "warranty": {...}, "sparePart": {...} },
  "punch":  { "totals": {...}, "snapshots": [...] }
}
```
선택되지 않은 모듈/섹션 키는 생략한다.

## 구현 (기술 세부)
1. `src/lib/report-builder.ts`
   - 현재 `buildTncSection / buildDefectSection / buildDocsSection / buildPunchSection`가 계산 후 곧바로 Markdown 문자열을 만든다. 각 함수에서 **계산 결과 객체**를 먼저 만들고, 그 객체로 Markdown을 렌더링하도록 내부 리팩터링.
   - 신규 export:
     - `interface ReportData { meta, tnc?, defect?, docs?, punch? }`
     - `async function buildReport(opts: ReportOptions): Promise<{ markdown: string; data: ReportData }>`
   - 기존 `buildReportMarkdown`은 내부적으로 `buildReport`를 호출해 `markdown`만 반환 (호환 유지).
   - `simulateAllTncStages` / `simulateAllDefectStages` 결과를 한 번만 계산해서 두 산출물이 동일 값을 갖도록 한다.
   - T&C Raw Data Guide(Appendix A)는 Markdown 전용 — JSON에는 포함하지 않음.

2. `src/pages/admin/ReportTab.tsx`
   - `markdown` state 옆에 `reportJson: ReportData | null` state 추가.
   - `handleGenerate`는 `buildReport(opts)` 호출 후 `setMarkdown(md)` + `setReportJson(data)`.
   - 미리보기 영역을 `Tabs` (Markdown / JSON) 으로 교체.
   - JSON 탭에 Copy / Download `.json` 버튼 (`JSON.stringify(data, null, 2)`).
   - LLM 호출(`runLlm`)은 기존대로 Markdown 사용 — 변경 없음.

3. 동작 검증
   - Generate 후 두 탭이 같은 스냅샷 수치를 보이는지 확인.
   - JSON 다운로드 파일이 유효한 JSON인지(브라우저에서 파싱) 검증.

## 범위 외
- LLM 입력을 JSON으로 바꾸는 작업.
- 새로운 계산/지표 추가 (현재 Markdown에 있는 값만 구조화).
- 백엔드/Edge function 변경 (`report-llm`은 그대로).
