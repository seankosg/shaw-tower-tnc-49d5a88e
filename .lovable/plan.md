# 스냅샷 버튼 에러("Failed to start snapshot") 복구

## 원인

Edge Function 로그:
```
ReferenceError: isCronCall is not defined
  at .../auto-snapshot/index.ts:205:7
```

로컬 소스는 이미 `isAutoInitCall`로 정리되어 있지만, 배포된 번들에 옛 `isCronCall` 참조가 남아 있어 함수가 진입 즉시 throw → 5xx 반환 → UI 토스트 "Edge Function returned a non-2xx status code". 5/7 이후 자동 백업이 `database_snapshots`에 안 들어온 침묵 실패도 같은 깨진 배포 상태의 결과입니다.

## 조치 (최소 변경, 빠른 복구)

1. **`auto-snapshot` 강제 재배포**
   - `supabase--deploy_edge_functions(["auto-snapshot"])` 로 현재 로컬(이미 `isAutoInitCall`로 통일된) 소스를 재배포.
2. **재배포 후 즉시 검증**
   - `supabase--curl_edge_functions` 로 `POST /auto-snapshot { mode: "manual" }` 호출 → 200 + `status: "initialized"` 확인.
   - 30초 후 `supabase--edge_function_logs auto-snapshot` 다시 조회 → `ReferenceError` 사라졌는지, 후속 stage 진행 로그가 있는지 확인.
   - `database_snapshots`에 신규 manual 행이 들어오는지 polling.
3. **방어 코드 한 줄 추가** (재발 방지)
   - `auto-snapshot/index.ts` 상단에 `// @ts-check` 의도로, `if (isAutoInitCall)` 사용처 주변에 명확한 가드 주석/타입 좁히기. 변수명 grep 어서션은 변경 안 함(이미 일관됨).
   - 만약 재배포 후에도 동일 에러가 나오면 그 시점에 파일 전체를 한 번 더 보여드리고 추가 수정 결정.

## 이 작업이 아닌 것 (별도 작업)

- 큰 테이블(`event_log`, `*_change_log`, `*_row_logs`)의 chunked 안정화, Schedule UI, 복원 트랜잭션화 등 직전 계획 A/B/C 그룹은 **이번에 건드리지 않음**. 우선 함수 자체가 정상 부팅돼야 그 위의 흐름을 검증할 수 있기 때문.

## 예상 결과

- "Save Current Data" 버튼이 다시 200 응답을 받고, `manual/...` 폴더와 `database_snapshots` 행이 생성되어 목록에 즉시 노출.
- 오늘 23:50 SGT 자동 cron이 정상 부팅(과거 큰 테이블 stage에서 또 끊길 가능성은 별개 — 그 부분은 다음 작업에서 다룸).

승인하시면 재배포 → 검증까지 한 번에 진행하겠습니다.
