## 점검 결과 요약

`buildDocsSnapshot` 직전·직후 슬라이드(3~12)와 종합 대시보드(2)의 카드/콘텐츠 영역을 슬라이드 캔버스(13.33 × 7.5 inch, 푸터 y=7.1) 기준으로 검산했습니다.

| 슬라이드 | 함수 | 콘텐츠 최하단 y | 결과 |
|---|---|---|---|
| 02 Dashboard | `buildDashboard` | **7.50 (카드 박스) / ~7.17 (텍스트)** | ❌ 푸터 침범 |
| 03 T&C Snapshot | `buildSnapshot` | 4.20 | ✓ |
| 04 T&C S-Curve | `buildPlanVsActual` | 6.65 | ✓ |
| 05 T&C Forecast | `buildForecast` | 6.90 | ✓ |
| 06 T&C Action Plan | `buildActionPlan` | 6.75 | ✓ |
| 07 Defect Snapshot | `buildDefectSnapshot` | 5.90 | ✓ |
| 08 Defect S-Curve | `buildDefectPlanVsActual` | 6.45 | ✓ |
| 09 Defect Forecast | `buildDefectForecast` | 7.00 | ✓ (한계) |
| 10 Defect Action Plan | `buildDefectActionPlan` | 6.75 | ✓ |
| 11 Close Out (직전 수정) | `buildDocsSnapshot` | 7.00 | ✓ |
| 12 Punch List | `buildPunchSnapshot` | 6.70 | ✓ |

→ **Slide 02만** 카드 박스(tier2)가 y=7.50까지 내려가 푸터(7.1)와 슬라이드 하단(7.5)을 침범합니다.

## 문제 상세 (Slide 02)

```ts
const tier1H = 2.35, tier2H = 3.45;
const row1 = 1.5, row2 = row1 + tier1H + gapY; // = 4.05
// row2 bottom = 4.05 + 3.45 = 7.50  ← 슬라이드 끝과 일치, 푸터 위에 겹침
```

- 왼쪽 Close Out Document 카드: 6개 progressRow가 ry=row2+0.72=4.77부터 +0.42 간격 → 마지막 행 시작 6.87, 텍스트 하단 약 7.17 ❌
- 오른쪽 Punch List 카드: mini status(row2+0.73~1.36) + timeline 3행(rowH=0.30, rowGap=0.22) → 마지막 행 하단 row2+3.07 ≈ 7.12 ❌

## 변경안 (`src/lib/ppt-builder.ts` · `buildDashboard`)

### 1) tier2 카드 박스 높이 축소 (line 388)

```ts
// before
const tier1H = 2.35, tier2H = 3.45;

// after
const tier1H = 2.35, tier2H = 2.95;
```
→ row2 bottom = 4.05 + 2.95 = **7.00** ✓ (푸터 7.1과 안전 0.10 여백)

### 2) 왼쪽 Close Out Document 카드 행 간격 축소 (line 424, 432)

```ts
// before
ry = row2 + 0.72;
// ...
].forEach(r => { progressRow(col1, ry, cardW, r.label, r.pct, r.color, null); ry += 0.42; });

// after
ry = row2 + 0.62;
// ...
].forEach(r => { progressRow(col1, ry, cardW, r.label, r.pct, r.color, null); ry += 0.36; });
```
→ 6행 종료 y = 0.62 + 5×0.36 + 0.3 ≈ row2+2.72 ≤ 2.95 ✓

### 3) 오른쪽 Punch List 타임라인 행 컴팩트화 (line 477)

```ts
// before
const rowH2 = 0.3, rowGap2 = 0.22;

// after
const rowH2 = 0.28, rowGap2 = 0.18;
```
→ 마지막 row3 종료 y ≈ row2+2.93 ≤ 2.95 ✓
(mini status, axis 위치는 변경 불필요)

## 변경하지 않는 것

- 슬라이드 3~12 (이번 점검에서 안전 마진 확보 확인됨)
- 카드 색상·라벨·폰트 크기·헤드라인
- `progressRow` 내부 구현 (외부에서 y 간격만 조절)

## 검증

1. 빌드 통과 확인
2. PPT 다운로드 → 2페이지에서:
   - Close Out Document 카드의 6개 progress 행이 카드 박스 안에 모두 들어오는지
   - Punch List 카드의 3행 타임라인(Within / Beyond / No Plan)이 박스 안에 들어오는지
   - 두 카드 박스 하단이 푸터("SHAW · Status Report")와 겹치지 않는지
