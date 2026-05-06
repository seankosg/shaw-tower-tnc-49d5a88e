## 목표
Warranty Raw Data 화면에서 댓글이 1개 이상 있는 항목 옆에 말풍선 아이콘과 댓글 갯수 배지를 표시합니다 (Defect Raw Data와 동일한 패턴). 클릭 시 해당 항목 상세 페이지의 Comments 섹션으로 이동합니다.

## 변경 사항

### 1. `src/pages/docs/DocsWarrantyRawDataPage.tsx`

**a. 현재 로드된 항목들의 댓글 수 조회**
- 새 state 추가: `commentCounts: Record<string, number>` (key = `warranty_items.id`)
- `items` 로드 후 (그리고 realtime 변경 시) 카운트 조회:
  - 쿼리: `select warranty_item_id from warranty_comments where warranty_item_id in (...)` (500개씩 청크 처리), JS에서 카운트 집계
  - `public.warranty_comments` 테이블에 Supabase realtime 채널 구독 (`*` 이벤트, 400ms debounce)로 자동 갱신
- 언마운트 / `items` 변경 시 구독 해제

**b. `item_no` 셀에 말풍선 표시**
- `item_no` 셀 렌더러에서 `commentCounts[r.id] > 0`일 때 인라인 pill 추가:
  ```
  <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer" title="N comments">
    <MessageSquare className="h-3 w-3" /> {count}
  </span>
  ```
- 클릭 핸들러: `e.stopPropagation()` 후 `navigate('/docs/warranty/${r.id}#comments')`
- `lucide-react`에서 `MessageSquare` import 추가

**c. Realtime publication**
- `warranty_comments`가 `supabase_realtime` publication에 포함되어 있는지 확인. 없으면 마이그레이션 한 줄 추가:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.warranty_comments;
  ```

## 범위 외
- 미확인(unread) / instruction / reply 구분 없음 — 현재 warranty_comments는 `comment` 타입만 있음
- 새 컬럼 추가 없음 — Defect Raw Data와 동일하게 `item_no` 옆 인라인 배지로 표시
- 상세 페이지 변경 없음 — `#comments` 앵커는 이미 동작함
