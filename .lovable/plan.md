## 목적

Defect Simulation의 `Chart Range` 옵션을 `-14, -7, -3, +3, +7, +14, +21`로 교체하고, 기본값을 `+7`로 설정합니다.

## 의미 정의

차트 X축 윈도우는 `dataDate` 기준 signed offset N으로 정의:

```text
N > 0  →  rangeStart = dataDate,      rangeEnd = dataDate + N
N < 0  →  rangeStart = dataDate + N,  rangeEnd = dataDate
```

기존의 "고정 -14일 floor + 가변 +N" 로직을 위 단일 offset 로직으로 대체.

## 파일 변경

`src/pages/DefectSimulationPage.tsx` 한 파일:

1. `useState<number>(Number(searchParams.get('range') || 90))` → 기본값 `7`
2. `setOrDel('range', String(rangeDays), '90')` → 디폴트 `'7'`
3. `rangeStart`/`rangeEnd` useMemo를 signed offset 규칙으로 교체:
   ```ts
   const rangeStart = useMemo(
     () => (rangeDays >= 0 ? dataDate : addDays(dataDate, rangeDays)),
     [dataDate, rangeDays],
   );
   const rangeEnd = useMemo(
     () => (rangeDays >= 0 ? addDays(dataDate, rangeDays) : dataDate),
     [dataDate, rangeDays],
   );
   ```
4. `<SelectContent>` 옵션 7개로 교체:
   - `-14 days` (-14), `-7 days` (-7), `-3 days` (-3), `+3 days` (3), `+7 days` (7), `+14 days` (14), `+21 days` (21)

## 비범위

- 시뮬레이션 로직, 카드, 테이블, Excel export 변경 없음
- Target Date / Team / Stage 필터 동작 유지
