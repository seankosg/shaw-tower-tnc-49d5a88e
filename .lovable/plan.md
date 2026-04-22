
## 원인

`Field Config`에서 `level` 필드를 활성화해도 `Raw Data` 화면에 컬럼이 보이지 않는 이유는, 현재 `Raw Data` 테이블(`src/pages/SubtestList.tsx`)의 컬럼 정의에 **Level 컬럼 자체가 등록되어 있지 않기 때문**입니다.

데이터 조회에는 이미 `level`이 포함되어 있습니다.

```text
subtests.select(... level, equipment, description ...)
```

하지만 화면 테이블 컬럼 목록에는 아래 컬럼들이 있고:

```text
Item No
Progress
System
Team
Equipment
Subtest ID
MOS Code
Description
...
```

정작 `level` 컬럼 정의가 빠져 있습니다.

따라서 `Field Config`에서 `level`을 켜도 제어할 대상 컬럼이 없어 화면에 나타나지 않습니다.

## 구현 계획

### 1. Raw Data 테이블에 Level 컬럼 추가

`src/pages/SubtestList.tsx`의 `columns` 정의에 `level` 컬럼을 추가합니다.

추가 위치는 데이터 흐름상 자연스럽게 다음 위치로 하겠습니다.

```text
System / Team 다음, Equipment 앞
```

변경 후 기본 표시 순서 예시는 다음과 같습니다.

```text
Item No
Progress
System
Team
Level
Equipment
Subtest ID
MOS Code
Description
...
```

컬럼 설정:

```text
accessorKey: level
header: Level
filter: text search
size: 약 90px
empty value: —
```

### 2. Field Config와 연동

이미 `useFieldConfig()`가 `field_name = level`을 기준으로 컬럼 표시 여부를 판단하고 있으므로, 컬럼만 추가하면 기존 로직이 그대로 작동합니다.

```text
Field Config > level Visible ON  → Raw Data에 Level 표시
Field Config > level Visible OFF → Raw Data에서 Level 숨김
```

추가 DB 변경은 필요 없습니다.

```text
새 테이블 생성 없음
컬럼 추가 없음
RLS 변경 없음
Backend Function 변경 없음
```

### 3. 컬럼 순서 적용 확인

현재 Raw Data는 `field_config.sort_order`를 이용해 동적 컬럼 순서를 구성합니다.

`level` 컬럼이 추가되면 `Field Config`의 정렬 순서에도 자동으로 반응하게 됩니다.

즉, Admin에서 Level의 순서를 위/아래로 이동하면 Raw Data 컬럼 순서에도 반영됩니다.

### 4. Export 영향 확인

Raw Data Export는 현재 테이블의 visible columns와 Field Config를 기준으로 동작합니다.

Level 컬럼이 Raw Data 테이블에 추가되면, Level이 visible 상태일 때 Excel export에도 포함되도록 확인하겠습니다.

### 5. 검증 항목

구현 후 다음을 확인하겠습니다.

```text
1. Field Config에서 Level Visible ON
2. Raw Data 화면에 Level 컬럼 표시
3. Level 컬럼 검색 필터 동작
4. Field Config에서 Level Visible OFF
5. Raw Data 화면에서 Level 컬럼 숨김
6. Level 표시 상태에서 Excel Export 포함 여부 확인
```

## 수정 대상 파일

```text
src/pages/SubtestList.tsx
```
