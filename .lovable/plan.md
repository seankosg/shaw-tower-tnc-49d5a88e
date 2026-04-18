

## Enable → Visible 의미 재정의 (UI 표시 여부만 제어)

### 핵심 아이디어
사용자 제안 채택: **Enable 토글 = "UI에 보일지 여부"** 로 의미를 명확히 합니다. DB 컬럼/저장 로직은 그대로 유지하고, SubtestList 컬럼과 SubtestDetail 표시 필드만 숨깁니다. MOS Code 같은 키 컬럼도 자유롭게 숨김 가능 — 데이터는 그대로 살아있고 Subtest ID로 식별 가능하기 때문에 안전합니다.

### 변경 방안

**1. `useFieldConfig.ts` — 키 컬럼 강제 표시 정책 제거**
- `ALWAYS_VISIBLE_FIELDS` 세트 제거 (또는 `subtest_id` 1개만 최소 보호 — 식별 불가능 방지)
- `isFieldVisible()`은 순수하게 `field_config.is_enabled` 값만 반영
- Import / Save / DB 쓰기 로직은 영향 없음 (이 훅은 표시 전용)

**2. AdminPage > FieldConfigTab — 라벨/설명 보강**
- 컬럼 헤더 `Enable` → `Visible` 로 변경
- 상단에 안내 문구 한 줄 추가: "Visible 토글은 화면 표시 여부만 제어합니다. 데이터는 항상 저장됩니다."

**3. SubtestList / SubtestDetail — 변경 불필요**
- 이미 `isFieldVisible()`로 분기되어 있음
- 정책 변경만으로 자동 반영됨

### 안전장치 (1개만 최소 보호 권장)
- `subtest_id` 만 항상 표시 보호 (행을 식별/클릭 불가능해지는 것 방지)
- `system`, `item_no`, `mos_code` 는 모두 숨김 가능

만약 "완전히 자유롭게, 전부 숨김 가능" 원하시면 `ALWAYS_VISIBLE_FIELDS` 를 빈 세트로 두면 됩니다.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/hooks/useFieldConfig.ts` | `ALWAYS_VISIBLE_FIELDS` 를 `{'subtest_id'}` 만 남김 (또는 빈 세트) |
| `src/pages/AdminPage.tsx` | FieldConfigTab 컬럼 헤더 `Enable`→`Visible` + 안내 문구 1줄 추가 |

DB / Import / Save 로직 변경 없음.

