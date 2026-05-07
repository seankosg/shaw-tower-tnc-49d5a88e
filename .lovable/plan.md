## 목표
Warranty raw data의 comment(`warranty_threads`)에서 `created_at`을 comment 내용에서 파싱된 `thread_date`로 보정 (1회성 마이그레이션).

## 범위
- 테이블: `warranty_threads`
- 조건: `created_at >= '2026-05-01'` AND `thread_date IS NOT NULL`
- 그 외(2026-05-01 이전 생성, 또는 `thread_date` 없음)는 건드리지 않음

## SQL
```sql
UPDATE public.warranty_threads
SET created_at = (thread_date::timestamp AT TIME ZONE 'UTC'),
    updated_at = (thread_date::timestamp AT TIME ZONE 'UTC')
WHERE created_at >= '2026-05-01'
  AND thread_date IS NOT NULL;
```
- 시각은 해당 날짜 00:00 UTC로 설정
- `updated_at`도 함께 맞춤

## 범위 외
- `warranty_items` 등 다른 테이블 변경 없음
- 스키마/코드/RLS 변경 없음
- 이후 import 동작 변경 없음 (1회성)

## 확인
시간대를 Asia/Singapore 등으로 바꿔야 하면 알려주세요. 기본은 00:00 UTC입니다.
