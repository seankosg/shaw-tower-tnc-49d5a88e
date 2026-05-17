import { supabase } from '@/integrations/supabase/client';
import { SlideSpecSchema, type SlideSpec } from '@/lib/custom-slide-spec';
import { insertCustomSlide } from '@/lib/custom-slides-cache';
import { appendSlideKey } from '@/lib/slide-config';

export type SlideDataSource = 'tnc' | 'defect' | 'docs' | 'punch';

export interface SlideCodegenInput {
  title: string;
  position: number;
  dataSources: SlideDataSource[];
  description: string;
  existingKeys?: string[];
}

export interface SlideCodegenResult {
  spec: SlideSpec;
  suggestedKey: string;
  suggestedLabel: string;
  summary: string;
}

export async function generateSlideSpec(input: SlideCodegenInput): Promise<SlideCodegenResult> {
  const { data, error } = await supabase.functions.invoke<unknown>('slide-codegen', { body: input });
  if (error) throw new Error(error.message || 'Edge function failed');
  if (!data) throw new Error('Empty response from slide-codegen');
  const obj = data as { spec: unknown; suggestedKey: string; suggestedLabel: string; summary: string };
  const spec = SlideSpecSchema.parse(obj.spec);
  return {
    spec,
    suggestedKey: obj.suggestedKey,
    suggestedLabel: obj.suggestedLabel,
    summary: obj.summary,
  };
}

/**
 * Persist a generated SlideSpec to `custom_slides` and append the key to
 * the global slide config so it shows up in Slide Composer and PPT exports
 * immediately — no code change, no redeploy.
 */
export async function addSlideToReport(params: {
  spec: SlideSpec;
  suggestedKey: string;
  suggestedLabel: string;
}): Promise<void> {
  await insertCustomSlide({
    key: params.suggestedKey,
    label: params.suggestedLabel,
    spec: params.spec,
  });
  await appendSlideKey(params.suggestedKey);
}
