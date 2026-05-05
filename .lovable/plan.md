## 배경

오늘 master 등록 시 자동 생성한 6명 중 일부는 이미 다른 login_id 로 존재하는 인물입니다. 원인은 `auto-create-master-user` 의 중복 검사가 `profiles.hdec_pic_name` / `hdec_eng_name` 만 비교하는데, 기존 HDEC 계정 다수가 이 두 컬럼이 NULL 이라 매칭 실패했기 때문입니다. `name` 컬럼을 추가로 비교하면 막을 수 있습니다.

---

## 1. 사용자별 처리 (수정됨)

### 신규 생성된 6명

| Master 이름 | 신규 계정 | 동일 인물 기존 계정 | 처리 |
|---|---|---|---|
| JW Park | `jw_pa2` | `jw_park` (name='JW Park', PIC=NULL) | **`jw_pa2` 삭제**, `jw_park.hdec_pic_name='JW Park'` 백필 |
| KY Kim | `ky_ki2` | `ky_kim` (name='KI YEOL KIM', PIC=NULL) | **`ky_ki2` 삭제**, `ky_kim.hdec_pic_name='KY Kim'` 백필 |
| Lee Jung Hyun | `lee_jung_hyun` | `jh_lee` (name='JH Lee', PIC='JH Lee') | **`lee_jung_hyun` 삭제만**. `jh_lee` profile 은 **기존 유지** (PIC='JH Lee' 그대로) |
| Cha Min Chul | `cha_min_chul` | `mc_cha` (name='MC Cha', PIC='MC Cha') | **`cha_min_chul` 삭제만**. `mc_cha` profile 은 **기존 유지** (PIC='MC Cha' 그대로) |
| YS Kim | `ys_kim` | `ys_lee` (name='YS KIM', PIC=NULL) — 동일인이지만 현상유지 | **`ys_kim` 삭제만**. `ys_lee` profile 은 건드리지 않음 |
| ST JEON | `st_jeon` | 없음 | **유지** |

→ **삭제 5건**: `jw_pa2`, `ky_ki2`, `lee_jung_hyun`, `cha_min_chul`, `ys_kim`
→ **profile 백필 2건**: `jw_park`, `ky_kim`

### 기존 HDEC profile 추가 백필 (재발 방지용 사전 정리)

이름이 master 와 정확히 일치하지만 PIC/ENG 컬럼이 NULL 인 경우:

- `st_kim` (name='ST Kim') → `hdec_pic_name='ST Kim'`
- `darwin` (name='Darwin') → `hdec_eng_name='Darwin'`

(`jw_park`, `ky_kim` 은 위 표에서 이미 처리)

---

## 2. Edge Function 보강 (`auto-create-master-user`)

`findExistingMasterUser` 의 HDEC 분기 변경:

- 현재: `hdec_pic_name.ilike.{n}` OR `hdec_eng_name.ilike.{n}`
- 변경: 위 두 조건에 **`name.ilike.{n}`** 을 OR 로 추가

PIC/ENG 컬럼이 비어있는 기존 HDEC 계정도 같은 인물로 인식되어 중복 생성이 방지됩니다. 매칭된 후 PIC/ENG 컬럼이 비어 있으면 기존 backfill 로직(`patch.hdec_pic_name = trimmedName`)이 자동으로 채워줍니다.

> 단, `jh_lee`/`mc_cha` 처럼 PIC 컬럼이 이미 다른 값으로 채워진 경우에는 backfill 조건(`!existing.hdec_pic_name`)에서 자동으로 건너뛰므로 사용자 의도(JH Lee, MC Cha 표기 유지)와 일치합니다. 결과적으로 `Lee Jung Hyun` / `Cha Min Chul` 이름으로 import 가 들어와도 새 계정은 만들지 않고 기존 `jh_lee` / `mc_cha` 를 그대로 재사용하게 됩니다.

Subcontractor / Subsub 분기는 변경하지 않습니다.

---

## 3. 실행 순서

1. **데이터 변경 (마이그레이션 / insert 도구):**
   - `auth.users` 5건 삭제 → cascade 로 `profiles`, `user_roles` 정리
     - `jw_pa2`, `ky_ki2`, `lee_jung_hyun`, `cha_min_chul`, `ys_kim`
   - `profiles` update 4건:
     - `jw_park.hdec_pic_name = 'JW Park'`
     - `ky_kim.hdec_pic_name = 'KY Kim'`
     - `st_kim.hdec_pic_name = 'ST Kim'`
     - `darwin.hdec_eng_name = 'Darwin'`

2. **Edge function 수정 (자동 배포):**
   - `supabase/functions/auto-create-master-user/index.ts` 의 `findExistingMasterUser` HDEC 분기에 `name.ilike` OR 조건 추가

3. **검증:**
   - profiles 조회로 5건 삭제 + 4건 백필 확인
   - master 이름 6개로 다시 호출 시 모두 `already_exists: true` 응답 확인

---

## 영향받는 파일

- `supabase/functions/auto-create-master-user/index.ts` (1곳 수정)
- 데이터: `auth.users` 5건 삭제(cascade), `profiles` 4건 update

승인해 주시면 진행하겠습니다.