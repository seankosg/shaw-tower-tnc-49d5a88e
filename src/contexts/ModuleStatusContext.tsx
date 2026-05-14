import { useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ModuleStatusContext,
  type ModuleKey,
  type ModuleStatus,
} from './module-status-context';

export type { ModuleStatus, ModuleKey } from './module-status-context';

const KEY_MAP: Record<ModuleKey, string> = {
  tnc: 'module_tnc_status',
  defect: 'module_defect_status',
  docs: 'module_docs_status',
};

const DEFAULT_STATUS: ModuleStatus = { enabled: true };

function parseValue(v: unknown): ModuleStatus {
  if (!v || typeof v !== 'object') return DEFAULT_STATUS;
  const obj = v as Record<string, unknown>;
  return {
    enabled: obj.enabled !== false,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    message: typeof obj.message === 'string' ? obj.message : undefined,
    expectedResumeAt: typeof obj.expected_resume_at === 'string' ? obj.expected_resume_at : undefined,
    pausedAt: typeof obj.paused_at === 'string' ? obj.paused_at : undefined,
    pausedByUserId: typeof obj.paused_by_user_id === 'string' ? obj.paused_by_user_id : undefined,
    pausedByName: typeof obj.paused_by_name === 'string' ? obj.paused_by_name : undefined,
  };
}

function serializeStatus(s: ModuleStatus): Record<string, unknown> {
  return {
    enabled: s.enabled,
    ...(s.reason !== undefined ? { reason: s.reason } : {}),
    ...(s.message !== undefined ? { message: s.message } : {}),
    ...(s.expectedResumeAt !== undefined ? { expected_resume_at: s.expectedResumeAt } : {}),
    ...(s.pausedAt !== undefined ? { paused_at: s.pausedAt } : {}),
    ...(s.pausedByUserId !== undefined ? { paused_by_user_id: s.pausedByUserId } : {}),
    ...(s.pausedByName !== undefined ? { paused_by_name: s.pausedByName } : {}),
  };
}

export function ModuleStatusProvider({ children }: { children: ReactNode }) {
  const [tnc, setTnc] = useState<ModuleStatus>(DEFAULT_STATUS);
  const [defect, setDefect] = useState<ModuleStatus>(DEFAULT_STATUS);
  const [docs, setDocs] = useState<ModuleStatus>(DEFAULT_DOCS_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [KEY_MAP.tnc, KEY_MAP.defect, KEY_MAP.docs]);
    if (data) {
      for (const row of data) {
        if (row.key === KEY_MAP.tnc) setTnc(parseValue(row.value));
        if (row.key === KEY_MAP.defect) setDefect(parseValue(row.value));
        if (row.key === KEY_MAP.docs) setDocs(parseValue(row.value));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel('module-status-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string } | null;
          if (!row?.key) return;
          if (row.key === KEY_MAP.tnc || row.key === KEY_MAP.defect || row.key === KEY_MAP.docs) {
            void refresh();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const setStatus = useCallback(async (module: ModuleKey, status: ModuleStatus) => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: KEY_MAP[module],
        value: serializeStatus(status) as never,
        updated_at: new Date().toISOString(),
      });
    if (!error) {
      if (module === 'tnc') setTnc(status);
      else if (module === 'defect') setDefect(status);
      else setDocs(status);
    }
    return { error: error as Error | null };
  }, []);

  return (
    <ModuleStatusContext.Provider value={{ tnc, defect, docs, loading, refresh, setStatus }}>
      {children}
    </ModuleStatusContext.Provider>
  );
}

export function useModuleStatus() {
  const ctx = useContext(ModuleStatusContext);
  if (!ctx) throw new Error('useModuleStatus must be used within ModuleStatusProvider');
  return ctx;
}
