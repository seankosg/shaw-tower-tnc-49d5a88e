

## R1/R2 헤더 별칭 추가 — 줄바꿈 + 괄호 포함 케이스

### 문제
Excel 헤더가 셀 안에서 줄바꿈되어 있고 부가 설명이 괄호로 붙은 케이스:
- `"R1\n(Report Review)"` → 정규화 후 `"r1 (report review)"`
- `"R2\n(Review by Consultant)"` → 정규화 후 `"r2 (review by consultant)"`

현재 `HEADER_MAP`에 위 키가 없어 미매핑됨.

### 해결
`src/lib/import-parser.ts`의 `HEADER_MAP`에 별칭 추가:

```ts
'r1 (report review)': 'r1_status',
'r2 (review by consultant)': 'r2_status',
```

기존 정규화 로직 (`\r\n` → space, 연속 공백 압축, lowercase)이 이미 줄바꿈/대소문자를 처리하므로 위 두 키만 추가하면 매핑 성공.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/import-parser.ts` | `HEADER_MAP`에 R1/R2 괄호 부가설명 별칭 2개 추가 |

DB / 다른 파일 변경 없음.

