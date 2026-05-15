import { createContext } from 'react';

export type ModuleStatus = {
  enabled: boolean;
  reason?: string;
  message?: string;
  expectedResumeAt?: string;
  pausedAt?: string;
  pausedByUserId?: string;
  pausedByName?: string;
};

export type ModuleKey = 'tnc' | 'defect' | 'docs' | 'punch';

export interface ModuleStatusContextValue {
  tnc: ModuleStatus;
  defect: ModuleStatus;
  docs: ModuleStatus;
  punch: ModuleStatus;
  loading: boolean;
  refresh: () => Promise<void>;
  setStatus: (module: ModuleKey, status: ModuleStatus) => Promise<{ error: Error | null }>;
}

export const ModuleStatusContext = createContext<ModuleStatusContextValue | null>(null);
