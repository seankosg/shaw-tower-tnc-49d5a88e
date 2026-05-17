## 배경

Slide 11 (Close Out Documents)의 현재 문제:

1. **데이터 변경 요청**: Warranty Deeds 카드의 첫 행이 "Draft Issued"(`draft_actual_date` 기반)로 표시되고 있음. 이를 "Subcon Signed"(`subcon_signing_actual_date` 기반)로 교체.
2. **슬라이드 영역 초과**: 슬라이드 캔버스는 LAYOUT_WIDE = 13.33 × 7.5 inch, 푸터는 y=7.1에 배치됨. 현재 카드 배치는
   - row1 y=1.55, row2 y=4.90, cH=3.20 → row2 하단 = **8.10"**
   - 즉 카드 하단이 슬라이드 밖으로 **약 1.1" 튀어나오고 푸터까지 가림**.

## 변경 대상

**파일**: `src/lib/ppt-builder.ts` — `buildDocsSnapshot()` 함수 (라인 1013–1112)

### 1) 데이터 소스 변경 (Warranty)

`subcon_signing_actual_date`는 이미 `report-builder.ts`의 `WARR_COLS`에 포함되어 `docsKPI.warranty.pcts`에 집계되어 있으므로 신규 쿼리는 불필요.

```ts
// before (line 1032)
const warSub    = docsKPI.warranty.pcts['draft_actual_date']        ?? 0;

// after
const warSubcon = docsKPI.warranty.pcts['subcon_signing_actual_date'] ?? 0;
```

Warranty rows 정의 (line 1078):
```ts
// before
{ label: 'Draft Issued', val: warSub.toFixed(1), unit: '%', color: C.textSecondary, isPct: true, pct: warSub },

// after
{ label: 'Subcon Signed', val: warSubcon.toFixed(1), unit: '%', color: C.textSecondary, isPct: true, pct: warSubcon },
```

`HDEC Signed`, `Final Submission` 두 행은 그대로 유지.

### 2) 카드 높이/배치 재조정

가용 수직 공간: y=1.55 (헤드라인 하단) ~ y=7.0 (푸터 직전) = **5.45"**
2행 카드 + 행간 0.15" → 카드 높이 **cH = 2.65**

```ts
// before (line 1055-1056)
const cW = 5.9, cH = 3.2;
const positions: [number,number][] = [[0.5, 1.55], [6.9, 1.55], [0.5, 4.9], [6.9, 4.9]];

// after
const cW = 5.9, cH = 2.65;
const positions: [number,number][] = [[0.5, 1.55], [6.9, 1.55], [0.5, 4.35], [6.9, 4.35]];
```
→ 하단 = 4.35 + 2.65 = **7.00"** ✓ 푸터(7.1)와 안 겹침.

### 3) 카드 내부 행 간격 미세 조정

새 cH=2.65에 맞추기 위해 행 시작점과 간격을 약간 줄임 (line 1099–1107):

```ts
// before
let ry = cy + 0.78;
m.rows.forEach(row => {
  kpiRow(cx, ry, cW, row.label, row.val, row.unit, row.color);
  if (row.isPct && 'pct' in row) {
    barRow(cx+0.15, ry+0.3, cW-0.3, row.pct as number, row.color);
    ry += 0.62;
  } else {
    ry += 0.5;
  }
});

// after
let ry = cy + 0.72;
m.rows.forEach(row => {
  kpiRow(cx, ry, cW, row.label, row.val, row.unit, row.color);
  if (row.isPct && 'pct' in row) {
    barRow(cx+0.15, ry+0.28, cW-0.3, row.pct as number, row.color);
    ry += 0.56;
  } else {
    ry += 0.44;
  }
});
```

각 카드의 마지막 행 하단 검증 (cy 기준 상대):
- **ABD** (4 non-pct rows): 0.72 + 4×0.44 = 2.48 ≤ 2.65 ✓
- **OMM** (2 pct rows): 0.72 + 2×0.56 + 0.1 (bar) = 1.94 ≤ 2.65 ✓
- **Warranty** (3 pct rows): 0.72 + 3×0.56 + 0.1 = 2.50 ≤ 2.65 ✓
- **Spare Parts** (3 pct rows): 동일 2.50 ≤ 2.65 ✓

헤더 영역(name, subtitle)도 그대로 cy+0.1 / cy+0.46에 들어가 ry=cy+0.72와 충돌 없음.

## 변경하지 않는 것

- 카드 너비/가로 배치, 색상 토큰, 헤드라인/푸터 코드
- `report-builder.ts` (이미 `subcon_signing_actual_date` 집계됨)
- 다른 슬라이드, text overrides 등록 (이미 동적 라벨 미적용 행이므로 기존 override 키 영향 없음)

## 검증

1. 빌드 통과 확인.
2. Admin → Report → PPT 다운로드 → 11페이지 열어서:
   - Warranty Deeds 카드 첫 행이 "Subcon Signed XX.X%"로 표시되는지
   - 4개 카드 모두 슬라이드 안에 들어오고 푸터("SHAW · Status Report" / "Page 11")가 가려지지 않는지
   - 카드 내부 KPI 행과 진행 바가 잘리지 않는지
