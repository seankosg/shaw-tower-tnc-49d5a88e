

# Import 날짜 파싱 수정

## 원인
1. `parseExcelFile`이 모든 값을 `String()`으로 변환 → Excel serial number(예: 45678)가 문자열 `"45678"`이 됨
2. `normalizeDate`는 `typeof val === 'number'`일 때만 serial date 파싱 → 문자열이므로 건너뜀
3. `dd-MMM` 형식(예: `15-Jan`, `03-Feb`)도 처리 로직 없음

## 수정 (`src/lib/import-parser.ts`)

### `normalizeDate` 함수 개선
- 문자열이 순수 숫자(`/^\d+$/`)이면 Excel serial date로 파싱 시도
- `dd-MMM` 형식(예: `15-Jan`, `03-Feb`) 정규식 추가: `/^(\d{1,2})-(Jan|Feb|Mar|...)\b/i`
- `dd-MMM-YYYY` 형식도 함께 지원

```text
normalizeDate 흐름:
1. null/빈값 → null
2. typeof number → XLSX.SSF.parse_date_code
3. 문자열 순수 숫자 → parseFloat 후 XLSX.SSF.parse_date_code
4. YYYY-MM-DD → 그대로 반환
5. dd-MMM 또는 dd-MMM-YYYY → 월 약어 매핑 후 변환
6. new Date() fallback → ISO 변환
7. 모두 실패 → null
```

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/lib/import-parser.ts` | `normalizeDate` 함수에 숫자 문자열 및 dd-MMM 형식 처리 추가 |

