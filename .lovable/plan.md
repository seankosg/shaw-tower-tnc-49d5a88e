

## System Master Code 수정 기능 추가 계획

### 핵심 분석
- **자동 반영됨**: `subtests.system_id`는 `system_master.id` (uuid FK)를 참조 → `system_code` 텍스트 변경 시 모든 조회 화면(Dashboard, SubtestList, SubtestDetail, Export)에서 **자동으로 새 코드 표시됨**. DB 레벨 추가 작업 불필요.
- **Import 영향**: `ImportContext`는 `system_code.toLowerCase()`로 매칭 → 기존 raw_system_name이 옛 코드와 일치하면 매칭 실패할 수 있음 → **`system_alias_map`에 옛 코드를 alias로 자동 등록**하면 import 호환성 유지.
- **Unique 제약**: 동일한 system_code 중복 방지 필요.

### 구현 범위 (`AdminPage.tsx` SystemsTab만 수정)

**1. UI 변경**
- "Code" 컬럼을 클릭 가능한 inline-edit으로 변경 (연필 아이콘 + 클릭 시 Input + Save/Cancel)
- 또는 "Edit" 다이얼로그 (Code, Name, Discipline 함께 수정 가능)
- → **선호: Edit 다이얼로그** (Name/Discipline도 함께 관리할 수 있어 UX 일관성)

**2. 저장 로직**
```ts
async function saveSystem(s, newCode, newName, newDiscipline) {
  const trimmed = newCode.trim();
  // 1) 중복 체크 (자기 자신 제외)
  const dup = await supabase.from('system_master')
    .select('id').eq('system_code', trimmed).neq('id', s.id).maybeSingle();
  if (dup.data) { toast error; return; }
  
  // 2) 코드가 실제로 바뀐 경우 → 기존 코드를 alias로 등록 (import 호환성)
  if (trimmed !== s.system_code) {
    // project_id는 system_master row에서 조회 필요
    await supabase.from('system_alias_map').insert({
      project_id: s.project_id, system_id: s.id,
      alias_name: s.system_code, is_active: true
    }); // 중복 시 무시
  }
  
  // 3) system_master 업데이트
  await supabase.from('system_master').update({
    system_code: trimmed,
    system_name_std: newName || null,
    discipline: newDiscipline || null,
  }).eq('id', s.id);
}
```

**3. SystemRow 타입 + select에 `project_id` 추가** (alias 등록용)

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/pages/AdminPage.tsx` | `SystemRow`에 `project_id` 추가, SystemsTab select에 `project_id` 포함, "Edit" 버튼 + EditSystemDialog 컴포넌트 신규, alias 자동 등록 로직 |

### 영향받는 화면 (자동 반영, 코드 변경 불필요)
- Dashboard, SubtestList, SubtestDetail, Export — 모두 `system_master(system_code)` join으로 조회하므로 **수정 즉시 반영**
- 기존 import한 raw_system_name 매칭 — **alias_map 자동 등록으로 호환 유지**

### 사용자 시나리오
1. Admin → Systems 탭 → 행의 "Edit" 클릭
2. 다이얼로그에서 Code/Name/Discipline 수정 → Save
3. 중복 체크 통과 시 저장 + 옛 코드는 alias로 보존
4. 모든 페이지에서 새 코드로 표시됨

