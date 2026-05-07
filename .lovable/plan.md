## 1회성 마이그레이션 계획

### 1단계 — 2026년 5월 6일 작성 코멘트 일괄 삭제
- `warranty_comments`에서 `created_at >= '2026-05-06' AND created_at < '2026-05-07'` 조건의 행 삭제
- 영향: **19행** (모두 `Tread 2-2 Action party` 마이그레이션 잔재로 확인됨)

### 2단계 — 마이그레이션 흔적 제거 (실제 내용만 노출)
대상: `warranty_comments` 중 message에 `<!-- migrated_from_thread:... -->` 마커가 포함된 행 (1단계 후 약 130행)

각 코멘트 message에서 다음을 정규식으로 제거:
1. **선두 thread 헤더 줄**: `**Tread …**` 로 시작하는 첫 줄
2. **선두 Action 줄**: 그 다음에 오는 `_Action: …_` 한 줄 (있을 때만)
3. **말미 HTML 주석 마커**: `<!-- migrated_from_thread:UUID -->`
4. 결과 양 끝의 공백/빈 줄을 `trim`

남는 본문(실제 내용)만 저장됩니다.

### 기술 메모 (실행 SQL)
```sql
-- 1단계
DELETE FROM warranty_comments
WHERE created_at >= '2026-05-06' AND created_at < '2026-05-07';

-- 2단계
UPDATE warranty_comments
SET message = btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(message,
        '^\*\*Tread[^\n]*\n', '', 'i'),         -- 선두 Tread 헤더
      '^_Action:[^\n]*_\s*\n', '', 'i'),         -- 선두 Action 줄
    '\s*<!--\s*migrated_from_thread:[^>]+-->\s*$', '', 'i'  -- 말미 마커
  ),
  E' \t\n\r'
),
updated_at = updated_at  -- created_at/updated_at는 변경하지 않음
WHERE message ~ 'migrated_from_thread';
```

### 범위 외
- `warranty_threads` 테이블 변경 없음
- 코드 변경 없음, 1회성

승인하시면 실행합니다.