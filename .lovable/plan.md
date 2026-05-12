## Stage Card에 "To Achieve" 강조 블록 추가

### 대상
- `src/pages/DefectSimulationPage.tsx`
- `src/pages/TncSimulationPage.tsx`

두 페이지의 Stage 카드 내 `Done now` 와 `Plan` Stat 사이에 새 블록 삽입.

### 표시 내용 (To Achieve)
Data Date 현재 → Target 시점의 Predicted 까지 도달하기 위해 추가로 필요한 양:

- **Δ Items**: `r.predicted - r.doneActual` (음수면 0으로 clamp)
- **Δ %**: `r.predictedPct - r.actualPct` (소수 1자리)
- **Per-day**: `Δ Items / max(1, daysBetween(dataDate, targetIso))` (올림, "/day" 접미)
  - target ≤ dataDate 인 경우: "—" 표시

### 디자인
- 2열 grid 안에 들어가지 않고, 그 위에 **별도 강조 줄** 로 배치 (col-span-2)
- 배경: `bg-muted/40`, 좌측 색 바: stage 색
- 라벨 `To Achieve` (uppercase, 11px)
- 메인 값: `text-base font-semibold tabular-nums` — 다른 Stat (`font-medium`, 기본 크기) 보다 명확히 큼
  - 예: `+12 items · +8.4% · ~3 / day`
- 작은 sub: `from {dataDate} → {targetIso} ({N} days)`

### 코드 위치
```
<Stat Done now />
<<< 새 To Achieve 블록 (col-span-2) >>>
<Stat Plan />
<Stat Gap vs Plan />
<Stat Forecast new />
```
2열 grid 안에서 `<div className="col-span-2 ...">` 로 감싸 한 줄 차지.

### 헬퍼
- 일수 계산: 두 ISO 날짜 차이 = `Math.max(0, Math.round((Date(target) - Date(dataDate)) / 86400000))`
- 두 페이지 동일 로직이므로 각 파일 내 inline 함수로 처리 (또는 작은 helper). 우선 inline 으로 단순 유지.

### 범위 외
- 비즈니스 로직 (`stageResults` 계산) 변경 없음
- 다른 카드/테이블/차트 변경 없음
