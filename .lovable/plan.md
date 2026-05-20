# §1 시스템명 표시 오류 수정

## 증상
`/ddn/input` Auto-fill 결과에서 Pred/T1/T2/R1S/R2S 시스템 요약이
- 시스템명 자리에 `(unknown)`만 표시
- 레벨이 압축되지 않고 `(L5, L6, Lv26, Lv27, …, L32RF/LMR)` 전부 나열
- 너무 길어서 T2/R1S/R2S는 `… +1 more`로 잘림

## 원인
1. `system_master.system_name_std` 는 거의 비어 있고 실제 이름은 `system_code` 컬럼에 저장돼 있음 → `auto-fill.ts`가 항상 `''` 를 받아 `summarizeSystems`가 `(unknown)` 으로 폴백.
2. `system-summary.ts` 의 `levelNum` 정규식 `/^L?(\d+)$/` 는 `Lv26`, `L32RF/LMR` 같은 표기를 인식하지 못함. 한 시스템 안에 하나라도 비숫자가 섞이면 numeric 압축 경로를 통째로 포기하고 모든 레벨을 그대로 나열함.

## 수정 범위 (프론트엔드 한정)

### A. `src/lib/ddn/auto-fill.ts`
- `system_master` SELECT에 `system_code` 추가
- `sysName.set(id, system_name_std || system_code || '')` 로 폴백
- §3 T&C Reject 쪽 동일 매핑에도 같은 폴백 적용

### B. `src/lib/ddn/system-summary.ts`
- `levelNum` 을 `Lv26`, `L26` 둘 다 받도록 `/^L[vV]?(\d+)$/i` 로 확장
- 출력 표기는 기존 `L{n}` 유지(데이터에 `Lv` 와 `L` 가 섞여 들어와도 결과는 통일)
- 일부만 숫자인 경우에도 가능한 한 압축: 숫자형 레벨끼리는 범위로 합치고, 비숫자 레벨(`L32RF/LMR`, `RF` 등)은 정렬해서 뒤에 부착
  - 예: 입력 `[L21..L31, L32RF/LMR]` → `(L21–L31, L32RF/LMR)`

### C. 검증
- `src/test/` 에 `system-summary.test.ts` 한 파일 추가
  - 순수 숫자 압축
  - `Lv` 접두사 혼합
  - 비숫자 레벨 혼합 (`L32RF/LMR`)
  - 시스템명 폴백 케이스(빈 문자열은 `(unknown)` 유지)

## 비범위
- DB 마이그레이션 없음 (시스템명 정합화는 별도 주제)
- Auto-fill 적용 로직/배너/UI 변경 없음
