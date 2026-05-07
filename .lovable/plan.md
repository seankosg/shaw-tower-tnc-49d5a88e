## 문제
이전 마이그레이션은 `warranty_threads`만 보정했지만, 화면(상세페이지 Comments)은 `warranty_comments` 테이블을 표시. 두 테이블이 분리되어 있어 댓글 작성일이 그대로 남아있음.

## 매핑 방식
`warranty_comments.message` 끝에 `<!-- migrated_from_thread:<thread_id> -->` 마커가 포함되어 있어, 이를 통해 원본 thread의 `thread_date`로 보정 가능.

## SQL (1회성)
```sql
UPDATE public.warranty_comments AS c
SET created_at = (t.thread_date::timestamp AT TIME ZONE 'UTC'),
    updated_at = (t.thread_date::timestamp AT TIME ZONE 'UTC')
FROM public.warranty_threads AS t
WHERE c.created_at >= '2026-05-01'
  AND t.thread_date IS NOT NULL
  AND c.message ~ ('migrated_from_thread:' || t.id::text);
```

## 범위 외
- 마커가 없거나 `thread_date`가 없는 댓글은 그대로
- `warranty_threads`는 이전에 이미 보정 완료
- 코드 변경 없음
