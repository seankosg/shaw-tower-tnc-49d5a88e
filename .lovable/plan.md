

## Import 헤더 줄바꿈 처리 — "Pre\ndecessor\nStatus" 매핑

### 문제
Excel 셀 안에서 헤더가 줄바꿈으로 끊긴 경우 (예: `"Pre\ndecessor\nStatus"`) `normalizeHeader()`가 `predecessor status`로 정상 변환됩니다 — 이미 `\r\n` → space 처리 + 공백 정규화 로직 있음.

**진짜 문제**: 줄바꿈 제거 후 결과가 `"predecessor status"` 인데, `HEADER_MAP`에는 `'predecessor status'` 키가 **없음**. 현재 등록된 키:
- `'predecessor status'` ❌ (없음)
- `'precessor status'` ✓
- `'predecessor'` ✓
- `'predecessor_status_raw'` ✓

따라서 `"Pre\ndecessor\nStatus"` → `"predecessor status"` → 매핑 실패 → 그대로 `"predecessor status"`로 남아 `parseStandard/parseLegacy`에서 `row.predecessor_status_raw`로 못 읽음.

### 해결
`src/lib/import-parser.ts`의 `HEADER_MAP`에 누락된 별칭 추가:
- `'predecessor status'` → `'predecessor_status_raw'`
- `'pre decessor status'` → `'predecessor_status_raw'` (혹시 공백이 다르게 합쳐질 경우 대비)
- `'pre decessor'` → `'predecessor_status_raw'`

추가로 헤더 정규화에 **이미 있는** `\r\n` → space 처리가 모든 줄바꿈 (`\n`, `\r\n`, `\v`, `\f`)을 잡는지 확인 — 현재 `/[\r\n]+/g`로 `\n`도 처리됨 ✓.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/import-parser.ts` | `HEADER_MAP`에 줄바꿈으로 분리되는 케이스의 별칭 3개 추가 |

DB / Edge function 변경 없음.

