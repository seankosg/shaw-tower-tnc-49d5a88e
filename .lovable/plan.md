

## Import 매핑 확장: 5개 추가 컬럼

### 1. `src/lib/import-parser.ts`
**HEADER_MAP 추가** (각 컬럼에 대해 일반적인 변형 포함):
```ts
'r1 status': 'r1_status', 'r1status': 'r1_status', 'r1_status': 'r1_status',
'r2 status': 'r2_status', 'r2status': 'r2_status', 'r2_status': 'r2_status',
'aconex': 'aconex_ref_no', 'aconex ref': 'aconex_ref_no',
'aconex ref no': 'aconex_ref_no', 'aconex_ref_no': 'aconex_ref_no',
'aconex no': 'aconex_ref_no',
'remarks': 'remarks', 'remark': 'remarks', 'note': 'remarks', 'notes': 'remarks',
'punchlist': 'punchlist_comments', 'punch list': 'punchlist_comments',
'punchlist comments': 'punchlist_comments', 'punch list comments': 'punchlist_comments',
'punchlist_comments': 'punchlist_comments',
```

**`ParsedSubtest` 인터페이스 확장**: 5개 필드 추가 (모두 `string | null`).

**`parseLegacy` / `parseStandard`**: base 객체에 5개 필드 추출 추가
- `r1_status`, `r2_status`: 그냥 `?.trim() || null` (자유 텍스트로 보존, 정규화 안 함)
- `aconex_ref_no`, `remarks`, `punchlist_comments`: `?.trim() || null`

### 2. `src/contexts/ImportContext.tsx`
**update fields 배열에 5개 추가** (blank=keep, "clear"=null 로직 그대로 적용):
```ts
['r1_status', row.r1_status],
['r2_status', row.r2_status],
['aconex_ref_no', row.aconex_ref_no],
['remarks', row.remarks],
['punchlist_comments', row.punchlist_comments],
```

**insert payload에도 5개 추가**.

### 3. 영향 없음 (확인만)
- DB 스키마: 5개 컬럼 모두 이미 `subtests` 테이블에 존재 → 마이그레이션 불필요
- 표시 화면: SubtestDetail/Mobile/Export에 이미 표시되고 있으므로 import 후 자동 반영
- `t1_actual_date`, `t2_actual_date`: import 매핑 제외 (모바일에서 status='Done' 시 자동 채움 로직 유지)

### 변경 파일
| 파일 | 변경 |
|------|------|
| `src/lib/import-parser.ts` | HEADER_MAP +15 alias, 인터페이스 +5 필드, parseLegacy/parseStandard에 5개 추출 |
| `src/contexts/ImportContext.tsx` | update fields 배열 +5, insert payload +5 |

### 사용자 시나리오
엑셀에 `R1 Status`, `R2 Status`, `Aconex Ref No`, `Remarks`, `Punchlist Comments` 컬럼이 있으면 → 자동 인식 → subtests에 저장 → SubtestDetail/Export에서 표시

