// Loader for the v2 classifier context (workscopes + work types + aliases + legacy rules)
import { supabase } from '@/integrations/supabase/client';
import type {
  AliasRow,
  ClassificationContextV2,
  ClassificationRule,
  DisciplineFallback,
  WorkscopeRow,
  WorkTypeRow,
} from '@/lib/defect-classifier';

export async function loadClassificationContextV2(): Promise<ClassificationContextV2> {
  const [wsRes, wtRes, alRes, ruRes, fbRes] = await Promise.all([
    (supabase as any).from('defect_subcontractor_workscope').select('*').eq('is_active', true),
    (supabase as any).from('defect_work_types').select('*').eq('is_active', true),
    (supabase as any).from('defect_classification_alias').select('*').eq('is_active', true),
    (supabase as any).from('defect_classification_rules').select('*').eq('is_active', true),
    (supabase as any).from('defect_discipline_fallback').select('*').eq('is_active', true),
  ]);
  return {
    workscopes: (wsRes.data ?? []) as WorkscopeRow[],
    workTypes: (wtRes.data ?? []) as WorkTypeRow[],
    aliases: (alRes.data ?? []) as AliasRow[],
    legacyRules: (ruRes.data ?? []) as ClassificationRule[],
    legacyFallbacks: (fbRes.data ?? []) as DisciplineFallback[],
  };
}
