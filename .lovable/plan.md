## 문제 상황

Defect Raw Data 화면에서:
1. 헤더는 가운데 정렬, 본문 셀은 왼쪽 정렬 → 시각적으로 어긋남
2. 필터를 걸면 필터 아이콘이 활성화되어 헤더 내용물 폭이 변하면서 어긋남이 더 심해짐
3. 정렬 화살표(▲▼)와 멀티소트 인덱스(¹²)도 헤더에만 추가되어 같은 문제 발생

## 원인

`src/pages/DefectRawDataPage.tsx`의 `renderHeader` (1192–1221줄):
- `TableHead`에 `text-center`
- 내부 `<span>`에 `inline-flex items-center justify-center gap-1 w-full`
- 그 안에 [라벨] + [정렬 아이콘] + [필터 아이콘]이 순서대로 배치됨

본문 `<TableCell>` (1244, 1275줄):
- 정렬 클래스 없음 → 기본 왼쪽 정렬

→ 헤더는 [라벨+아이콘] 묶음을 가운데로 밀고, 값은 왼쪽에 붙으므로 컬럼 폭이 클수록, 라벨이 짧을수록 어긋남이 커집니다. 필터/정렬이 적용되면 아이콘이 추가/강조되어 묶음 폭이 변하고 가운데 위치도 함께 이동합니다.

## 수정 방안

`renderHeader`를 본문과 동일한 **왼쪽 정렬** 기준으로 통일하되, 컬럼 폭 안에서 라벨은 왼쪽, 정렬·필터 아이콘은 오른쪽 끝에 두는 표준 데이터 그리드 레이아웃을 적용합니다.

### `src/pages/DefectRawDataPage.tsx` `renderHeader` 변경

1. `TableHead`의 className에서 `text-center` → `text-left` (본문 셀과 동일하게 왼쪽 정렬, 본문 셀에 적용된 `px-4`와 헤더의 패딩을 맞춤)
2. 내부 컨테이너를 다음 구조로 변경:
   ```
   <div className="flex w-full items-center justify-between gap-1">
     <span className="truncate">{label + sort arrow + sort index}</span>
     {filter icon}  // 항상 오른쪽 끝 고정 위치
   </div>
   ```
   - 라벨과 정렬 화살표는 왼쪽에 붙이고 `truncate`로 길이 보호
   - 필터 아이콘은 `flex-shrink-0`으로 항상 같은 자리에 고정 → 필터 활성화 여부와 무관하게 컬럼 내용물 위치가 변하지 않음

이렇게 하면:
- 헤더 라벨이 본문 셀의 시작 위치와 동일하게 왼쪽에 정렬됨
- 필터를 걸어도 라벨 위치가 흔들리지 않음 (아이콘은 오른쪽 고정)
- 멀티 정렬 인덱스도 라벨 옆에 붙어서 정렬 상태 변화에도 안정적

## 영향 범위

- 고정(frozen) 영역 헤더와 스크롤 영역 헤더 모두 같은 `renderHeader`를 쓰므로 함께 수정됨
- 컬럼 너비, 정렬·필터 동작, 본문 셀, 공용 `table.tsx`는 변경하지 않음
- 다른 화면(SubtestList, ScheduleMatrix 등)은 영향 없음