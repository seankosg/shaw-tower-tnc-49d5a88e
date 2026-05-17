import { supabase } from '@/integrations/supabase/client';

export type SlideDataSource = 'tnc' | 'defect' | 'docs' | 'punch';

export interface SlideCodegenInput {
  title: string;
  position: number;
  dataSources: SlideDataSource[];
  description: string;
  slideRegistry: string;
}

export interface SlideCodegenResult {
  functionCode: string;
  suggestedKey: string;
  suggestedLabel: string;
}

export async function generateSlideCode(input: SlideCodegenInput): Promise<SlideCodegenResult> {
  const { data, error } = await supabase.functions.invoke<SlideCodegenResult>('slide-codegen', {
    body: input,
  });
  if (error) throw new Error(error.message || 'Edge function failed');
  if (!data) throw new Error('Empty response from slide-codegen');
  return data;
}
