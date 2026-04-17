

## "Puretec" 사용자 미등록 원인 분석

### 가설
`ImportContext.tsx`의 `ensureSubcontractor` 로직 검토:
```ts
async function ensureSubcontractor(name) {
  const key = name.toLowerCase().trim();
  if (subconCache.has(key)) return;  // ← 이미 캐시에 있으면 스킵
  const { data: ins } = await supabase.from('subcontractor_master').insert({...}).select('id').single();
  if (!ins) return;
  subconCache.set(key, { id: ins.id, active: true });
  supabase.functions.invoke('auto-create-master-user', {...}).catch(() => {});  // ← 여기서만 호출
}
```

**문제점**: `auto-create-master-user`는 **이번 import 실행에서 새로 INSERT된 마스터에 대해서만** 호출됨. 

Puretec이 다음 중 하나의 경로로 들어왔다면 사용자 생성이 트리거되지 않음:
1. **이전에 Admin이 수동으로** subcontractor_master에 등록 (사용자 생성 로직 없는 경로)
2. **자동 등록 기능이 추가되기 전**의 import 실행에서 마스터만 등록됨
3. 자동 사용자 생성 호출은 했지만 **edge function이 실패**(login_id 충돌 등) → `.catch(() => {})`로 silent 무시됨

또한 INSERT 직후 `auto-create-master-user` 호출에 `await`가 없음 → import 종료 후 호출이 in-flight 상태로 끊길 가능성도 있음.

### 확인 필요 (실행 시)
1. `subcontractor_master`에서 Puretec 행의 `created_at` 확인 → import 시점 vs 자동등록 기능 추가 시점 비교
2. `profiles` 테이블에서 login_id `purete*` 또는 name `Puretec` 검색 → 진짜 없는지 확인
3. `auto-create-master-user` edge function 로그에서 Puretec 관련 호출/에러 검색

### 해결 플랜

**A. 즉시 진단 (코드 변경 없이 DB/로그 조회)**
- subcontractor_master / profiles / edge function logs 조회로 정확한 원인 특정

**B. 코드 수정 — 누락 보강 (Sync Users 기능)**
Admin Masters 탭에 **"Sync Missing Users"** 버튼 추가:
- 모든 활성 subcontractor_master / hdec_pic_master 행을 순회
- 각 마스터의 이름과 매칭되는 profiles 행이 있는지 확인 (subcontractor_name / subsub_name / hdec_pic_name 컬럼)
- 없으면 `auto-create-master-user` 호출 → 누락된 계정 일괄 생성
- 결과 toast: "12 users created, 3 failed"

**C. 코드 수정 — 향후 누락 방지**
1. `ImportContext.tsx`의 `ensureSubcontractor/Subsub/HdecPic`에서 `auto-create-master-user` 호출에 `await` 추가 + `.catch`에서 toast 경고
2. Admin Masters 탭에서 **수동으로 마스터 추가**할 때도 (`addSub`, `addSubsub`, `addPic` 함수) `auto-create-master-user` 호출하도록 후크 추가
3. 마스터 행에 "사용자 계정 있음/없음" 배지 표시 + 없으면 "Create User" 버튼

### 변경 파일
| 파일 | 변경 |
|------|------|
| `src/pages/AdminPage.tsx` | "Sync Missing Users" 버튼 + 마스터 행에 user 존재 배지/Create 버튼, 마스터 추가 함수에 자동 사용자 생성 호출 추가 |
| `src/contexts/ImportContext.tsx` | `auto-create-master-user` 호출에 `await` + 실패 시 toast 누적 |

DB 변경 없음. Edge function 변경 없음 (기존 `auto-create-master-user` 그대로 사용).

