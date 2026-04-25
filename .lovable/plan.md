## 목표

Defect 엑셀 import 시 **Area 값을 Level 필드와 Location 필드로 안정적으로 분류**하고, **Level을 의미하는 토큰이 Location에 중복 저장되지 않도록** 분류 로직을 재설계합니다.

## 현재 로직과 실제 데이터 분석

### 현재 코드 (`src/lib/defect-parser.ts`)

```ts
export function parseArea(area: string | null) {
  const parts = area.split('>').map(s => s.trim()).filter(Boolean);
  const useful = parts.length >= 4 ? parts.slice(1) : parts;  // ← 위치 기반 가정
  return {
    area_type:     useful[0] ?? null,
    area_level:    useful[1] ?? null,           // ← 항상 인덱스 1
    area_location: useful.length > 2 ? useful.slice(2).join(' > ') : null,
  };
}
// 그리고:
area_level    = explicitLevel    ?? parsedArea.area_level;     // 엑셀에 Level 컬럼 있으면 우선
area_location = explicitLocation ?? parsedArea.area_location;  // Location/Location Detail 컬럼 우선
```

### 실제 DB 샘플에서 발견된 문제

| `area_raw` | 현재 결과 | 문제 |
|---|---|---|
| `Shaw Tower Redevelopment > STR > Level 24` | type=Project, level=**STR**, loc=**Level 24** | parts<4라 분기 실패. Discipline이 Level로, Level이 Location으로 들어감 (사용자가 우려한 바로 그 케이스) |
| `Shaw Tower > STR > Level 07 > Office Area` (엑셀에 Location="Level 07"도 있음) | type=STR, level=Level 07, loc=**Level 07** | explicitLocation이 우선되어 Level 값이 Location에 중복 |
| `Shaw Tower > STR > Level 14 > Lift Lobby (Low Zone)` (엑셀에 Location=다른 area 전체 경로) | level=Level 14, loc=`Shaw Tower > STR > Level 12 > Fire Lift Lobby 2` | LL "Location" 컬럼이 신뢰 못 할 자유 입력. 다른 area의 raw를 그대로 받기도 함 |
| `Shaw Tower > STR > Level 17` + Location="Closed By Organization" | loc="Closed By Organization" | 상태 정보가 Location에 |
| `Shaw Tower Redevelopment` (parts=1) | level=null, loc=null | 정상 |

### 패턴 정리

LL 엑셀의 area는 일관되게 **`Project > Discipline > Level XX [> Detail Location...]`** 구조입니다. 즉:
- **마지막 토큰이 "Level NN" 형태이면 Level만 있고 Location은 없음**
- **"Level NN" 다음 토큰들이 진짜 Location**
- 별도 "Level"/"Location" 컬럼은 **신뢰성이 낮음** (자유 입력, 다른 area의 raw, 상태 텍스트 등)

## 새 분류 로직

### 1. Area_raw 우선 파싱 (구조 인식 기반)

```ts
function parseArea(area: string | null) {
  if (!area) return { area_type: null, area_level: null, area_location: null };
  const parts = area.split('>').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return { area_type: null, area_level: null, area_location: null };

  // Level 토큰 탐지 — "Level 5", "L05", "Lvl 12", "B1", "Basement 1", "Roof",
  // "Mezzanine", "Ground", "GF", "M&E Floor" 등
  const levelIdx = parts.findIndex(isLevelToken);

  let area_type: string | null = null;
  let area_level: string | null = null;
  let area_location: string | null = null;

  if (levelIdx >= 0) {
    // type = level 직전 토큰 (Discipline). 없으면 첫 번째 토큰.
    area_type = levelIdx > 0 ? parts[levelIdx - 1] : null;
    area_level = canonicalLevel(parts[levelIdx]);
    // location = level 이후 모든 토큰을 join. Level과 동일하면 비움.
    const tail = parts.slice(levelIdx + 1)
      .filter(p => !isLevelToken(p))                        // 뒤에 또 Level이 와도 제외
      .filter(p => normalizeForCompare(p) !== normalizeForCompare(area_level)); // 중복 제거
    area_location = tail.length > 0 ? tail.join(' > ') : null;
  } else {
    // Level 토큰이 없는 경우: 기존 인덱스 기반 fallback
    const useful = parts.length >= 4 ? parts.slice(1) : parts;
    area_type = useful[0] ?? null;
    area_level = null;                                       // Discipline을 Level로 잘못 넣지 않음
    area_location = useful.length > 1 ? useful.slice(1).join(' > ') : null;
  }
  return { area_type, area_level, area_location };
}
```

`isLevelToken` 패턴:
- `^level\s*\d+` (Level 1, Level 07)
- `^l\s*\d+$` / `^lvl\s*\d+` (L1, L05, Lvl 12)
- `^b\s*\d+$` / `^basement\s*\d+?` (B1, Basement 2)
- `^roof(\s|$)` / `^rf$` / `^ground(\s|floor|$)` / `^gf$` / `^mezzanine` / `^attic`

### 2. Explicit "Level"/"Location" 컬럼 안전 병합

엑셀의 별도 컬럼 값을 무조건 우선시키던 동작을 **검증 후 병합**으로 변경:

```ts
function reconcileAreaFields(
  parsedFromRaw: { area_type, area_level, area_location },
  explicitLevel: string | null,
  explicitLocation: string | null,
  areaRaw: string | null,
) {
  // Level: explicit가 진짜 Level 토큰 형태이고 raw에서도 매칭되면 채택, 아니면 raw 우선
  let level = parsedFromRaw.area_level;
  if (explicitLevel && isLevelToken(explicitLevel)) {
    level = canonicalLevel(explicitLevel);
  } else if (!level && explicitLevel) {
    // raw에서 못 찾았고 explicit가 있다면 그래도 사용 (단, "STR"같은 비-level은 거부)
    level = isPlausibleLevel(explicitLevel) ? canonicalLevel(explicitLevel) : null;
  }

  // Location: explicit가 raw 안에 포함된 부분문자열이거나 raw가 비어있을 때만 채택.
  //           Level 값과 동일하면 버림. Status text/숫자만 있으면 버림.
  let location = parsedFromRaw.area_location;
  if (explicitLocation) {
    const same = level && normalizeForCompare(explicitLocation) === normalizeForCompare(level);
    const looksLikeStatus = /^(closed|open|n\/a)/i.test(explicitLocation);
    const looksLikeOtherArea = explicitLocation.includes('>'); // 다른 area의 raw 통째 → 거부
    const isJustNumber = /^\d+$/.test(explicitLocation);
    if (!same && !looksLikeStatus && !looksLikeOtherArea && !isJustNumber) {
      location = explicitLocation;
    }
  }

  // 최종 안전장치: location이 level과 동일하거나 level 토큰만 포함하면 비움
  if (location && level && normalizeForCompare(location) === normalizeForCompare(level)) {
    location = null;
  }
  if (location && isLevelToken(location)) {
    location = null;
  }

  return { area_type: parsedFromRaw.area_type, area_level: level, area_location: location };
}
```

### 3. Canonical Level

`Level 7`, `Level 07`, `LEVEL 7`, `L7`, `L07` → 모두 `Level 07`로 정규화 (2자리 zero-pad). 이렇게 하면 dashboard/grouping에서도 일관됩니다.

### 4. 기존 데이터 마이그레이션 (선택)

새 로직만으로는 이미 잘못 저장된 12,000+ row가 그대로 남습니다. 동일 로직을 SQL/스크립트로 일괄 재처리하는 일회성 마이그레이션을 함께 실행해 모든 기존 row의 `area_type/area_level/area_location`을 `area_raw`로부터 재계산합니다.

## 변경 파일

- `src/lib/defect-parser.ts` — `parseArea` 재작성, `isLevelToken`/`canonicalLevel`/`reconcileAreaFields` 신규, 호출부(line 281–299) 갱신
- `src/test/defect-parser.test.ts` (신규 또는 기존 확장) — 위 표의 케이스들을 회귀 테스트로 추가
- 일회성 데이터 정리 — 새 로직을 노드 스크립트로 실행하여 기존 `defect_items`의 area_* 3개 컬럼 재계산 후 update (사용자가 원하면 진행)

## 적용되지 않는 것

- `area_raw` 컬럼 자체는 변경하지 않음 (원본 보존).
- 미래 import의 분류만 바꾸는 것이 우선; 기존 데이터 재처리는 사용자 승인 후 별도 단계로.
