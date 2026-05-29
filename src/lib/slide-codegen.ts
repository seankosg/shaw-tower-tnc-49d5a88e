import { supabase } from '@/integrations/supabase/client';
import { SlideSpecSchema, type SlideSpec } from '@/lib/custom-slide-spec';
import {
  insertCustomSlide,
  promoteDraftToActive as promoteDraftToActiveRow,
  type CustomSlide,
} from '@/lib/custom-slides-cache';
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
 * Save the preview as a DRAFT immediately after generation so the user can
 * leave the page and come back to it. Draft rows are NOT exposed in Composer
 * or PPT Export until promoted via `promoteDraftToReport`.
 */
export async function saveSlideDraft(params: {
  spec: SlideSpec;
  suggestedKey: string;
  suggestedLabel: string;
}): Promise<CustomSlide> {
  return insertCustomSlide({
    key: params.suggestedKey,
    label: params.suggestedLabel,
    spec: params.spec,
    status: 'draft',
  });
}

/** Promote an existing draft row to active and register its key. */
export async function promoteDraftToReport(draftId: string): Promise<void> {
  const row = await promoteDraftToActiveRow(draftId);
  await appendSlideKey(row.key);
}

/**
 * Legacy one-shot: insert as active and register. Kept for callers that don't
 * use the draft flow.
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
    status: 'active',
  });
  await appendSlideKey(params.suggestedKey);
}
