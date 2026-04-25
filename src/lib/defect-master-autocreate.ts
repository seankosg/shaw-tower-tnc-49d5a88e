import type { SupabaseClient } from '@supabase/supabase-js';
import { suggestOwnerCode } from '@/lib/defect-utils';

type MasterType = 'subcontractor' | 'subsub' | 'hdec_pic' | 'hdec_eng';

type MasterRow = {
  id: string;
  name: string;
  type?: string | null;
  parent_subcontractor_id?: string | null;
  owner_code?: string | null;
  is_active?: boolean | null;
};

type ProfileRow = {
  user_type: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
};

export type DefectMasterRowInput = {
  subcontractor_name?: string | null;
  subsub_name?: string | null;
  hdec_pic_name?: string | null;
  hdec_eng_name?: string | null;
};

export type DefectMasterEnsurer = {
  warnings: string[];
  ensureForRow: (row: DefectMasterRowInput) => Promise<void>;
};

const normalizeName = (value?: string | null) => value?.trim() || null;
const keyOf = (value: string) => value.toLowerCase().trim();
const subsubKey = (parentName: string, name: string) => `${keyOf(parentName)}::${keyOf(name)}`;

export async function createDefectMasterEnsurer(supabase: SupabaseClient): Promise<DefectMasterEnsurer> {
  const warnings: string[] = [];
  const { data: subData, error: subError } = await supabase
    .from('subcontractor_master')
    .select('id, name, type, parent_subcontractor_id, is_active');
  const { data: hdecData, error: hdecError } = await supabase
    .from('hdec_pic_master')
    .select('id, name, is_active');
  const { data: hdecEngData, error: hdecEngError } = await supabase
    .from('hdec_eng_master')
    .select('id, name, is_active');
  const { data: profileData } = await supabase
    .from('profiles')
    .select('user_type, subcontractor_name, subsub_name, hdec_pic_name, hdec_eng_name');

  if (subError) warnings.push(`Master lookup failed (subcontractor): ${subError.message}`);
  if (hdecError) warnings.push(`Master lookup failed (HDEC PIC): ${hdecError.message}`);
  if (hdecEngError) warnings.push(`Master lookup failed (HDEC Eng): ${hdecEngError.message}`);

  const subcontractors = new Map<string, { id: string; name: string }>();
  const subIdToName = new Map<string, string>();
  const subsubs = new Set<string>();
  const hdecPics = new Set<string>();
  const hdecEngs = new Set<string>();
  const profileKeys = new Set<string>();

  (subData as MasterRow[] | null || []).forEach((master) => {
    const name = normalizeName(master.name);
    if (!name) return;
    if ((master.type ?? 'sub') === 'sub') {
      subcontractors.set(keyOf(name), { id: master.id, name });
      subIdToName.set(master.id, name);
    }
  });

  (subData as MasterRow[] | null || []).forEach((master) => {
    const name = normalizeName(master.name);
    if (!name || master.type !== 'subsub') return;
    const parentName = master.parent_subcontractor_id ? subIdToName.get(master.parent_subcontractor_id) : null;
    if (parentName) subsubs.add(subsubKey(parentName, name));
  });

  (hdecData as Array<{ name: string }> | null || []).forEach((master) => {
    const name = normalizeName(master.name);
    if (name) hdecPics.add(keyOf(name));
  });

  (hdecEngData as Array<{ name: string }> | null || []).forEach((master) => {
    const name = normalizeName(master.name);
    if (name) hdecEngs.add(keyOf(name));
  });

  (profileData as ProfileRow[] | null || []).forEach((profile) => {
    if (profile.user_type === 'subcontractor' && profile.subcontractor_name) {
      profileKeys.add(`sub:${keyOf(profile.subcontractor_name)}`);
    }
    if (profile.user_type === 'subsub' && profile.subsub_name && profile.subcontractor_name) {
      profileKeys.add(`subsub:${subsubKey(profile.subcontractor_name, profile.subsub_name)}`);
    }
    if (profile.user_type === 'hdec' && profile.hdec_pic_name) {
      profileKeys.add(`hdec:${keyOf(profile.hdec_pic_name)}`);
    }
    if (profile.user_type === 'hdec' && profile.hdec_eng_name) {
      profileKeys.add(`hdec_eng:${keyOf(profile.hdec_eng_name)}`);
    }
  });

  async function createMasterUser(type: MasterType, name: string, parentName?: string | null) {
    const profileKey = type === 'subcontractor'
      ? `sub:${keyOf(name)}`
      : type === 'subsub' && parentName
        ? `subsub:${subsubKey(parentName, name)}`
        : type === 'hdec_pic'
          ? `hdec:${keyOf(name)}`
          : type === 'hdec_eng'
            ? `hdec_eng:${keyOf(name)}`
            : null;

    if (profileKey && profileKeys.has(profileKey)) return;

    const { data, error } = await supabase.functions.invoke('auto-create-master-user', {
      body: {
        name,
        master_type: type,
        subcontractor_name: type === 'subcontractor' ? name : parentName ?? null,
        subsub_name: type === 'subsub' ? name : null,
        hdec_pic_name: type === 'hdec_pic' ? name : null,
        hdec_eng_name: type === 'hdec_eng' ? name : null,
      },
    });

    const functionError = (data as { error?: string } | null)?.error;
    if (error || functionError) {
      warnings.push(`${name} (${type}): ${error?.message ?? functionError}`);
      return;
    }
    if (profileKey) profileKeys.add(profileKey);
  }

  async function ensureSubcontractor(value?: string | null): Promise<string | null> {
    const name = normalizeName(value);
    if (!name) return null;
    const key = keyOf(name);
    const existing = subcontractors.get(key);
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from('subcontractor_master')
      .insert({ name, type: 'sub', owner_code: suggestOwnerCode(name) })
      .select('id')
      .single();

    if (error || !data) {
      warnings.push(`${name} (subcontractor): ${error?.message ?? 'master insert failed'}`);
      return null;
    }

    subcontractors.set(key, { id: data.id, name });
    subIdToName.set(data.id, name);
    await createMasterUser('subcontractor', name, name);
    return data.id;
  }

  async function ensureSubsub(value?: string | null, parentValue?: string | null): Promise<void> {
    const name = normalizeName(value);
    if (!name) return;
    const parentName = normalizeName(parentValue);
    if (!parentName) {
      warnings.push(`${name} (subsub): parent subcontractor is required`);
      return;
    }

    const key = subsubKey(parentName, name);
    if (subsubs.has(key)) return;

    const parentId = await ensureSubcontractor(parentName);
    if (!parentId) {
      warnings.push(`${name} (subsub): parent subcontractor could not be resolved`);
      return;
    }

    const { data, error } = await supabase
      .from('subcontractor_master')
      .insert({ name, type: 'subsub', parent_subcontractor_id: parentId, owner_code: suggestOwnerCode(name) })
      .select('id')
      .single();

    if (error || !data) {
      warnings.push(`${name} (subsub): ${error?.message ?? 'master insert failed'}`);
      return;
    }

    subsubs.add(key);
    await createMasterUser('subsub', name, parentName);
  }

  async function ensureHdecPic(value?: string | null): Promise<void> {
    const name = normalizeName(value);
    if (!name) return;
    const key = keyOf(name);
    if (hdecPics.has(key)) return;

    const { data, error } = await supabase
      .from('hdec_pic_master')
      .insert({ name })
      .select('id')
      .single();

    if (error || !data) {
      warnings.push(`${name} (hdec_pic): ${error?.message ?? 'master insert failed'}`);
      return;
    }

    hdecPics.add(key);
    await createMasterUser('hdec_pic', name, null);
  }

  async function ensureHdecEng(value?: string | null): Promise<void> {
    const name = normalizeName(value);
    if (!name) return;
    const key = keyOf(name);
    if (hdecEngs.has(key)) return;

    const { data, error } = await supabase
      .from('hdec_eng_master')
      .insert({ name })
      .select('id')
      .single();

    if (error || !data) {
      warnings.push(`${name} (hdec_eng): ${error?.message ?? 'master insert failed'}`);
      return;
    }

    hdecEngs.add(key);
  }

  return {
    warnings,
    ensureForRow: async (row) => {
      await ensureSubcontractor(row.subcontractor_name);
      await ensureSubsub(row.subsub_name, row.subcontractor_name);
      await ensureHdecPic(row.hdec_pic_name);
      await ensureHdecEng(row.hdec_eng_name);
    },
  };
}
