
## 제안: Team 명칭 정합 기준

현재 T&C Management 구축 시 이미 기 구축된 기준은 다음과 같습니다.

```text
DB 저장값 / 내부 enum:
- Mech
- Elec
- Arch
- Supp

앱 표시명:
- Mechanical
- Electrical
- Architecture
- Support
```

다만 사용자가 선호하신 명칭과 현장 discipline 표현의 일관성을 고려하면, 앱 전체 표시명은 아래처럼 통일하는 것이 가장 적절합니다.

```text
권장 앱 표시명:
- Mechanical
- Electrical
- Architectural
- Support
```

즉, DB에는 기존 T&C 기준인 짧은 enum 값을 유지하고, 화면/엑셀/필터/로그/관리자 UI에는 full label을 일관되게 표시하는 방식입니다.

## 권장 기준

```text
Internal value: Mech
Display label: Mechanical

Internal value: Elec
Display label: Electrical

Internal value: Arch
Display label: Architectural

Internal value: Supp
Display label: Support
```

## DB enum 값을 변경하지 않는 이유

현재 `team_type`은 이미 다음 enum으로 생성되어 있고, T&C `subtests`, Defect `defect_items`, User Management `profiles`, 권한 RPC, 필터, import/export에서 공통 사용 중입니다.

```text
Mech, Elec, Arch, Supp
```

이를 DB 레벨에서 `Mechanical`, `Electrical`, `Architectural`, `Support`로 변경하면 다음 영향이 큽니다.

```text
- 기존 데이터 migration 필요
- database enum rename / cast 처리 필요
- RLS/RPC 권한 로직 재검증 필요
- Import/Export 필터 값 변경 필요
- 기존 URL filter / localStorage 상태와 충돌 가능
```

따라서 안정성을 위해 DB 저장값은 유지하고, 앱 전체 표시명만 통일하는 것을 제안합니다.

## 적용 계획

### 1. 공통 Team label 기준 변경

`src/types/enums.ts`의 `TEAM_LABELS`를 앱 전체 기준으로 사용합니다.

변경 전:

```text
Arch: Architecture
```

변경 후:

```text
Arch: Architectural
```

최종 기준:

```text
Mech → Mechanical
Elec → Electrical
Arch → Architectural
Supp → Support
```

### 2. Team normalization helper 공통화

현재 T&C import와 Defect parser/import에서 Team 판단 로직이 분산되어 있으므로, 공통 helper를 추가하거나 기존 enum 파일에 정리합니다.

예시 기준:

```text
normalizeTeamValue(input) → TeamType | null
formatTeamLabel(team) → Mechanical / Electrical / Architectural / Support
```

이 helper를 다음 영역에서 동일하게 사용합니다.

```text
- T&C Import
- Defect Import
- User Management
- Raw Data filter
- Dashboard filter
- Export filter
- Detail pages
```

### 3. Defect Import 자동 Team 판단 기준

Defect Import의 Field Discipline 기반 판단은 내부 저장값으로는 기존 enum을 사용하고, 사용자에게 보이는 명칭은 full label로 표시합니다.

```text
Architectural 계열 → Arch → Architectural
Electrical 계열    → Elec → Electrical
Mechanical 계열    → Mech → Mechanical
Support 계열       → Supp → Support
```

Electrical 우선 규칙은 유지합니다.

```text
Electrical / ICT / SBT / Vertical Transport → Electrical
```

Mechanical은 다음으로 판단합니다.

```text
Mechanical / ACMV / BMS / Plumbing / Sanitary / Santary / Gas / Fire Protection → Mechanical
```

Architectural은 다음으로 판단합니다.

```text
Architectural / Archtectural / Architecture / Landscaping / Facade / Structural → Architectural
```

### 4. User Management fallback도 동일 기준 사용

Field Discipline으로 Team이 판단되지 않을 경우, User Management의 profile team을 참조합니다.

profile에는 내부값이 저장됩니다.

```text
Mech / Elec / Arch / Supp
```

화면에는 항상 다음처럼 표시합니다.

```text
Mechanical / Electrical / Architectural / Support
```

### 5. Defect Import 화면 변경 시 반영

기존 계획의 Team 수동 선택 제거는 유지합니다.

추가로 Import 결과/로그 문구도 full label 기준으로 표시합니다.

예시:

```text
Resolved Team: Electrical
Team unresolved
```

내부 저장값 `Elec` 같은 약어는 화면에 노출하지 않습니다.

### 6. 앱 전체 표시 점검 대상

다음 화면/기능에서 Team 표시가 모두 동일 label을 쓰도록 점검 및 보강합니다.

```text
- Admin / User Management
- T&C Raw Data
- T&C Detail
- T&C Import
- T&C Dashboard
- Defect Import
- Defect Raw Data
- Defect Detail
- Defect Dashboard / Progress
- Defect Export
- Excel export files
- Import Logs
```

## 최종 제안 기준

```text
DB / internal value는 기존 T&C 기준 유지:
Mech, Elec, Arch, Supp

앱 전체 표시명은 다음으로 통일:
Mechanical, Electrical, Architectural, Support
```

이 방식이 현재 T&C Management의 기 구축 DB/권한/필터 구조와 가장 안전하게 정합되고, 사용자가 선호한 full label 방식도 만족합니다.
