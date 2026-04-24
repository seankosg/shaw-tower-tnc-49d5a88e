

## Defect Dashboard 최상단 KPI 카드 재배치 + 명칭 변경

### 변경 내용

```text
[1단 (6칸 → 5칸)]
  Total Defects | Completion Done | Open Defect (NEW) | Closure Done | Remain Inspection (이름변경)
  - Open Defect = Total - Completion Done (= 미완료 결함)
  - Difference 카드의 라벨을 "Difference" → "Remain Inspection" 으로 변경
  - 서브텍스트 "검측 대기" 는 그대로 유지
  - Overall Progress 카드는 1단에서 제거 (2단으로 이동)

[2단]
  Overdue (1단에서 이동) | Overall Progress (1단에서 이동)
  - 기존 grid-cols-2 의 Stage Card 영역이 아닌, KPI 그리드 2단에 배치
  - 1단 5칸 → md:grid-cols-5, 2단 2칸 → md:grid-cols-2
```

### 구체적 변경

```text
[수정] src/pages/DefectDashboardPage.tsx (라인 180-192)

  현재 1단 1줄(6칸):
    Total / Completion Done / Closure Done / Difference / Overall Progress / Overdue
  변경 후:
    1단 (md:grid-cols-5):
      Total Defects
      Completion Done
      Open Defect           ← 신규 추가
        - icon: Clock 또는 ListChecks 계열
        - value: kpis.total - kpis.actualDone
        - sub: "Total − Completion"
        - onClick: goRaw({ actualComplete: 'false' })
      Closure Done
      Remain Inspection     ← Difference 라벨 변경
        - value: kpis.difference (= actualDone - closureDone) 그대로
        - sub: "검측 대기" 유지
        - onClick: goRaw({ actualComplete: 'true', closureComplete: 'false' }) 유지

    2단 (md:grid-cols-2):
      Overdue
      Overall Progress 카드 (Progress bar 포함)
```

### 변경하지 않는 항목

```text
- KPI 계산 로직 (kpis useMemo) — 신규 값은 kpis.total - kpis.actualDone 으로 인라인 계산
- KpiCard 컴포넌트 시그니처
- 그 아래 Stage Card (Completion/Closure 2칸) 영역
- Alert Banner, Plan vs Actual 표, S-Curve, Pie 등 하단 영역
- Difference 행의 표 동작 (라벨은 카드만 변경, 표는 별개)
```

### 검증

```text
1. 1단에 5개 카드 표시: Total / Completion Done / Open Defect / Closure Done / Remain Inspection
2. Open Defect 값 = Total Defects − Completion Done
3. Remain Inspection 카드 값/클릭 동작 = 기존 Difference 와 동일
4. 2단에 Overdue + Overall Progress 표시
5. 모바일(grid-cols-2)에서도 자연스럽게 wrap
```

