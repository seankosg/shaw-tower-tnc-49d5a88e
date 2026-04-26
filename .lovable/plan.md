## 목적

T&C Raw Data(Subtest)와 Defect Management의 코멘트/Instruction 중 **Administrator(login_id='admin')**가 작성한 것으로 기록된 항목을 정리합니다.
- 작성자(`author_user_id`)를 해당 Subtest/Defect의 **HDEC PIC** 사용자로 변경
- 대상자(`recipients`)를 해당 Subtest/Defect의 **Subcontractor**로 설정 (`['subcontractor']`)

## 사전 조사 결과

- 대상 Administrator 계정: `Administrator (login_id=admin)` — 단 1명
- **subtest_comments**: Administrator 작성 코멘트 **27건**
  - 모두 해당 Subtest에 `hdec_pic_name`과 `subcontractor_name`이 채워져 있음
  - 등장 PIC: HT Kim, JH Lee, JH Seo, YS Lee → 모두 `profiles`에 active HDEC 사용자로 매칭됨
- **defect_comments**: Administrator 작성 코멘트 **0건** (변경 없음, 그러나 안전을 위해 동일 로직 포함)

## 마이그레이션 SQL (data-only, INSERT 도구로 실행)

`UPDATE` 쿼리를 두 단계로 실행합니다.

**Step 1 — `subtest_comments` 업데이트**

각 코멘트별로:
1. 해당 Subtest의 `hdec_pic_name`과 일치하는 active HDEC profile의 `user_id`를 찾아 `author_user_id`로 설정
2. `recipients = ARRAY['subcontractor']`
3. 매칭되는 PIC 프로필이 없으면 해당 행은 **건너뜀** (현재 데이터상 0건)

```sql
UPDATE public.subtest_comments sc
SET author_user_id = matched.user_id,
    recipients = ARRAY['subcontractor']::text[]
FROM (
  SELECT sc2.id,
         (SELECT p.user_id
            FROM public.profiles p
           WHERE p.is_active = true
             AND p.user_type = 'hdec'
             AND lower(btrim(p.hdec_pic_name)) = lower(btrim(st.hdec_pic_name))
           LIMIT 1) AS user_id
  FROM public.subtest_comments sc2
  JOIN public.subtests st ON st.id = sc2.subtest_id
  WHERE sc2.author_user_id = '5633327d-5c37-4188-b96d-7814bc83ef42'
    AND st.hdec_pic_name IS NOT NULL
) matched
WHERE sc.id = matched.id
  AND matched.user_id IS NOT NULL;
```

**Step 2 — `defect_comments` 업데이트** (현재 0건이지만 안전망으로 실행)

```sql
UPDATE public.defect_comments dc
SET author_user_id = matched.user_id,
    recipients = ARRAY['subcontractor']::text[]
FROM (
  SELECT dc2.id,
         (SELECT p.user_id
            FROM public.profiles p
           WHERE p.is_active = true
             AND p.user_type = 'hdec'
             AND lower(btrim(p.hdec_pic_name)) = lower(btrim(di.hdec_pic_name))
           LIMIT 1) AS user_id
  FROM public.defect_comments dc2
  JOIN public.defect_items di ON di.id = dc2.defect_id
  WHERE dc2.author_user_id = '5633327d-5c37-4188-b96d-7814bc83ef42'
    AND di.hdec_pic_name IS NOT NULL
) matched
WHERE dc.id = matched.id
  AND matched.user_id IS NOT NULL;
```

## 주의사항

- `subtest_comments`/`defect_comments`의 `updated_at` 트리거가 작동하여 `updated_at`이 갱신되고 message가 바뀌지 않으므로 `edited` 플래그는 `false`로 유지됩니다.
- RLS는 admin 권한으로 실행되므로 `can_modify_subtest_comment` 정책을 통과합니다.
- 일회성 데이터 보정이므로 마이그레이션 파일이 아닌 **데이터 INSERT/UPDATE 도구**로 실행합니다.
- 이후 새로 생성되는 코멘트에는 영향 없음.

## 검증

실행 직후 다음 쿼리로 검증:

```sql
SELECT count(*) FROM public.subtest_comments
WHERE author_user_id = '5633327d-5c37-4188-b96d-7814bc83ef42'; -- 0이어야 함

SELECT count(*) FROM public.subtest_comments
WHERE recipients = ARRAY['subcontractor']::text[]
  AND author_user_id <> '5633327d-5c37-4188-b96d-7814bc83ef42';
```
