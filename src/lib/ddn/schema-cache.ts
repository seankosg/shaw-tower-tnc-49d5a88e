/**
 * Fetches DDN schema (sections + fields + options) and settings via react-query.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  DdnSection,
  DdnField,
  DdnFieldOption,
  DdnSettings,
  DdnEntry,
} from './schema-types';

export function useDdnSchema() {
  return useQuery({
    queryKey: ['ddn-schema'],
    staleTime: 60_000,
    queryFn: async () => {
      const [sectionsRes, fieldsRes, optionsRes] = await Promise.all([
        supabase.from('ddn_sections').select('*').eq('is_active', true).order('display_order'),
        supabase.from('ddn_fields').select('*').eq('is_active', true).order('display_order'),
        supabase.from('ddn_field_options').select('*').eq('is_active', true).order('display_order'),
      ]);
      if (sectionsRes.error) throw sectionsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      const optionsByField = new Map<string, DdnFieldOption[]>();
      for (const o of (optionsRes.data ?? []) as unknown as DdnFieldOption[]) {
        const arr = optionsByField.get(o.field_id) ?? [];
        arr.push(o);
        optionsByField.set(o.field_id, arr);
      }
      const fields = ((fieldsRes.data ?? []) as unknown as DdnField[]).map((f) => ({
        ...f,
        options: optionsByField.get(f.id) ?? [],
      }));
      return {
        sections: (sectionsRes.data ?? []) as unknown as DdnSection[],
        fields,
      };
    },
  });
}

export function useDdnSettings() {
  return useQuery({
    queryKey: ['ddn-settings'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ddn_settings')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle();
      if (error) throw error;
      return data as DdnSettings | null;
    },
  });
}

export function useDdnEntry(entryDate: string) {
  return useQuery({
    queryKey: ['ddn-entry', entryDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ddn_entries')
        .select('*')
        .eq('entry_date', entryDate)
        .maybeSingle();
      if (error) throw error;
      return data as DdnEntry | null;
    },
  });
}

export function useDdnEntryHistory() {
  return useQuery({
    queryKey: ['ddn-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ddn_entries')
        .select('id, entry_date, letter_no, day_n, status, updated_at')
        .order('entry_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });
}
