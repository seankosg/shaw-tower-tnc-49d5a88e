
네, 가능합니다. 다만 말씀하신 대로 `Team` 컬럼만으로 `Standard Import`를 판단하면 위험합니다. `Team` 컬럼은 부가 정보일 뿐이고, 실제 파일 구조를 판단하는 핵심 근거는 `MOS Code`, `MOS-1~5`, `Subtest ID`, 단계별 일정/상태 컬럼 조합이어야 합니다.

## 변경 목표

Excel 파일 업로드 시 헤더를 먼저 읽어 파일별로 Import Type을 자동 판별합니다.

- `Standard Import`: 1 row = 1 Subtest 구조
- `Legacy Import`: 1 row = 1 Test, `MOS-1~5`를 여러 Subtest로 분해하는 구조
- 사용자 안내 문구 추가는 하지 않습니다.
- 기존 Import Type 선택 UI는 제거하거나 자동 판별 결과 표시 중심으로 단순화합니다.

## 자동 판별 기준

### 1. Legacy Import 판별 근거

다음 조건 중 핵심 조건을 만족하면 `Legacy Import`로 판별합니다.

```text
Legacy Import 핵심 근거
- MOS-1, MOS-2, MOS-3, MOS-4, MOS-5 중 하나 이상 존재
```

추가 보조 근거:

```text
- MOS Code 컬럼이 없음
- Subtest ID 컬럼이 없음
- 1개의 Item No에 여러 MOS 컬럼이 붙는 구조
```

우선순위:

```text
MOS-1~5 컬럼이 있으면 Legacy Import로 우선 판정
```

이유는 Legacy 양식의 가장 명확한 특징이 `MOS-1~5` 컬럼이기 때문입니다.

### 2. Standard Import 판별 근거

`Team` 컬럼만으로 판단하지 않고, 다음 조건을 조합해서 판단합니다.

```text
Standard Import 핵심 근거
- MOS Code 컬럼이 존재
- MOS-1~5 컬럼이 존재하지 않음
```

추가 보조 근거:

```text
- Subtest ID 컬럼 존재
- T1 Planned / T1 Status 컬럼 존재
- T2 Planned / T2 Status 컬럼 존재
- Team 컬럼 존재
- Raw Data Export에서 나오는 Source / Updated 같은 관리성 컬럼 존재
```

권장 판별 방식:

```text
Standard 점수 방식
+3: MOS Code 존재
+2: Subtest ID 존재
+1: T1 Planned 또는 T1 Status 존재
+1: T2 Planned 또는 T2 Status 존재
+1: Team 존재
+1: Source 또는 Updated 존재

단, MOS-1~5가 있으면 Standard 점수와 무관하게 Legacy 우선
```

최종 기준:

```text
- MOS-1~5 있음 → Legacy
- MOS Code 있음 + Standard 보조 근거 1개 이상 있음 → Standard
- MOS Code만 있고 보조 근거가 전혀 없음 → Unknown
- 둘 다 애매하면 Unknown
```

## 구현 계획

### 1. `src/lib/import-parser.ts` 수정

헤더 정규화 대상에 필요한 컬럼을 추가합니다.

추가 예정:

```text
Team → team
Source → source
Updated → updated_at
```

`Team`은 Import 저장 대상이고, `Source`, `Updated`는 Standard 판별 근거로만 사용합니다. 기존 시스템 관리 컬럼이므로 Import 저장값으로는 반영하지 않습니다.

### 2. Import Type 자동 감지 함수 추가

`src/lib/import-parser.ts`에 다음 형태의 함수를 추가합니다.

```ts
export type DetectedImportType = 'legacy' | 'standard' | 'unknown';

export function detectImportType(mappedHeaders: string[]): {
  type: DetectedImportType;
  reasons: string[];
}
```

판별 로직:

```text
1. MOS-1~5 컬럼 존재 여부 확인
2. MOS Code 컬럼 존재 여부 확인
3. Standard 보조 컬럼 존재 여부 확인
4. 우선순위에 따라 legacy / standard / unknown 반환
```

### 3. 파일별 Import Type 저장

현재는 `ImportContext` 전체에 하나의 `importType`이 있습니다.

이를 파일별 속성으로 바꿉니다.

```ts
ImportFileItem {
  detectedImportType?: 'legacy' | 'standard' | 'unknown';
  detectionReasons?: string[];
}
```

업로드된 파일마다 독립적으로 판별합니다.

예:

```text
A.xlsx → Standard
B.xlsx → Legacy
C.xlsx → Unknown
```

### 4. 파일 업로드 시 자동 파싱

`src/contexts/ImportContext.tsx`의 `addFiles()` 흐름을 변경합니다.

현재:

```text
화면 전체 importType 기준으로 parseLegacy 또는 parseStandard 실행
```

변경 후:

```text
1. parseExcelFile()로 헤더와 row 읽기
2. detectImportType(mappedHeaders) 실행
3. legacy면 parseLegacy(rows)
4. standard면 parseStandard(rows)
5. unknown이면 failed 처리
```

`Unknown`인 경우는 Import 실행 대상에서 제외합니다.

### 5. 저장 로직에서 파일별 Import Type 사용

현재 저장 로직은 `importTypeRef.current`를 사용합니다.

변경 후에는 각 파일의 `detectedImportType`을 기준으로 처리합니다.

```text
Legacy 파일:
- data_source_type = legacy_import_inherited
- 파일 단위 Team 선택값 사용

Standard 파일:
- data_source_type = standard_import
- row별 Team 컬럼 사용
```

### 6. Standard Import의 Team 컬럼 처리

`ParsedSubtest` 타입에 `team` 필드를 추가합니다.

```ts
team: string | null;
```

Standard Import에서는 Excel row의 `Team` 컬럼을 읽습니다.

허용 값:

```text
Mech, Mechanical → Mech
Elec, Electrical → Elec
Arch, Architecture → Arch
Supp, Support → Supp
```

처리 규칙:

```text
빈칸 → 기존 값 유지
clear → Team 삭제
유효한 값 → Team 업데이트
잘못된 값 → 해당 row rejected 또는 team 미반영
```

신규 insert 시:

```text
row.team 값이 있으면 저장
row.team 값이 없으면 null
```

기존 update 시:

```text
row.team 빈칸 → 기존 team 유지
row.team clear → team null
row.team 유효값 → team 업데이트
```

### 7. Import Page UI 조정

`src/pages/ImportPage.tsx`에서 전체 Import Type 선택 UI는 제거하거나 비활성화합니다.

파일별로 내부 상태는 표시할 수 있습니다.

```text
Standard Import
Legacy Import
Unknown Format
```

단, 별도의 긴 사용자 안내 문구는 추가하지 않습니다.

Team 선택 UI는 파일 타입별로 다르게 처리합니다.

```text
Standard Import:
- Team 선택 UI 숨김
- 파일의 Team 컬럼 사용

Legacy Import:
- 기존처럼 Team 선택 필요

Unknown:
- Team 선택 불필요
- Import 불가
```

### 8. Ready Count 조건 변경

현재:

```ts
files.filter(f => f.status === 'ready' && f.team).length
```

변경 후:

```text
Standard:
- status === ready 이면 Import 가능

Legacy:
- status === ready && team 선택됨 이면 Import 가능
```

즉:

```ts
const readyCount = files.filter(f => {
  if (f.status !== 'ready') return false;
  if (f.detectedImportType === 'standard') return true;
  if (f.detectedImportType === 'legacy') return Boolean(f.team);
  return false;
}).length;
```

### 9. Import 실행 큐 조건 변경

`startImport()`에서도 동일한 기준을 적용합니다.

```text
Standard ready 파일 → 실행
Legacy ready + team 선택 파일 → 실행
Unknown 파일 → 제외
```

### 10. 데이터베이스 변경 여부

데이터베이스 변경은 필요 없습니다.

기존 컬럼을 그대로 사용합니다.

```text
subtests.team
upload_batches.import_type
subtests.data_source_type
```

단, `upload_batches.import_type` 저장 시 전체 import type이 아니라 파일별 감지 결과를 저장하도록 수정합니다.

## 최종 동작

```text
Raw Data Export 파일 업로드
→ MOS Code + Subtest ID/T1/T2/Team/Source/Updated 근거로 Standard 자동 판별
→ Team 컬럼 기준으로 row별 Team 반영
→ 별도 Team 선택 없이 Import 가능

Legacy 양식 업로드
→ MOS-1~5 근거로 Legacy 자동 판별
→ 기존처럼 파일 단위 Team 선택 후 Import 가능

애매한 파일 업로드
→ Unknown 처리
→ Import 실행 제외
```

## 수정 예상 파일

```text
src/lib/import-parser.ts
src/contexts/ImportContext.tsx
src/pages/ImportPage.tsx
```
