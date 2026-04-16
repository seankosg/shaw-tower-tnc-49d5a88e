

# 헤더 매핑 추가: T1 Date / T2 Date

## 원인 확정
업로드한 엑셀의 날짜 컬럼 헤더가 `T1 Date`, `T2 Date`인데, 현재 `HEADER_MAP`에는 `t1 planned`, `t1 status` 등만 등록되어 있어 매핑이 안 됨 → `row.t1_planned_date`가 `undefined` → DB에 `null` 저장.

## 수정 (`src/lib/import-parser.ts`)

`HEADER_MAP`에 다음 키 추가:

```text
't1 date'      → 't1_planned_date'
't1date'       → 't1_planned_date'
't2 date'      → 't2_planned_date'
't2date'       → 't2_planned_date'
```

기존 `t1 planned`, `t2 planned` 매핑은 그대로 유지 (다른 템플릿 호환성).

## 수정 파일
| 파일 | 변경 |
|------|------|
| `src/lib/import-parser.ts` | `HEADER_MAP`에 `t1 date` / `t2 date` 변형 추가 |

