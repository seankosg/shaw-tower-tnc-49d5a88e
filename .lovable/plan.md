## 문제
스크린샷에서 좌측 frozen 컬럼 영역 위로 우측 스크롤 컬럼의 텍스트가 비쳐 보입니다 (예: "External Stairs (Driveway)" 같은 비고/위치 텍스트가 Issue No / Progress / Subcontractor 칸 위로 겹쳐 보임).

## 근본 원인
`src/pages/DefectRawDataPage.tsx`의 `stickyBgFor()`가 sticky 셀에 **반투명 색**을 그대로 사용하고 있습니다.

```ts
if (hoveredIndex === index) return 'hsl(var(--muted) / 0.95)';
if (overdue && !closed)     return 'hsl(var(--destructive) / 0.06)';
if (closed)                 return 'hsl(var(--muted) / 0.45)';
return 'hsl(var(--background))';
```

- closed 행: `muted / 0.45` → 55% 투명 → 뒤의 우측 셀이 비침
- overdue 행: `destructive / 0.06` → 거의 100% 투명 → 그대로 비침
- hover 행: `muted / 0.95` → 5% 투명 → 약하게 비침

`position: sticky`는 z-index만 올릴 뿐 셀 자체가 불투명하지 않으면 **스크롤로 지나가는 다른 셀의 내용이 그대로 통과**합니다.

## 해결책
sticky 셀의 배경을 항상 **불투명한 base background 위에 row tint를 얹은 2단 레이어**로 구성합니다. CSS `background` 속성에 두 레이어를 쉼표로 쌓아서 기본 background를 보장합니다.

```ts
const base = 'hsl(var(--background))';
if (hoveredIndex === index)
  return `linear-gradient(${base}, ${base}), hsl(var(--muted) / 0.95)`;
if (overdue && !closed)
  return `linear-gradient(${base}, ${base}), hsl(var(--destructive) / 0.06)`;
if (closed)
  return `linear-gradient(${base}, ${base}), hsl(var(--muted) / 0.45)`;
return base;
```

이렇게 하면 첫 번째 layer(opaque base)가 뒤 컨텐츠를 완전히 가리고, 두 번째 layer(상태 tint)는 시각적 의미를 그대로 유지합니다.

추가로 안전장치로 헤더의 frozen 셀에도 동일 원리를 적용해 두겠습니다 (헤더는 이미 `hsl(var(--background))`를 사용 중이라 현 시점은 OK이지만 명시적으로 유지).

## 수정 파일
- `src/pages/DefectRawDataPage.tsx` — `stickyBgFor` 함수 1곳만 수정

## 기대 결과
- 좌측 frozen 컬럼 위로 우측 셀 텍스트가 비치는 현상 제거
- closed/overdue/hover 시각 표시는 그대로 유지
- 행 정렬, 헤더, 상단 스크롤바 등 다른 부분은 영향 없음