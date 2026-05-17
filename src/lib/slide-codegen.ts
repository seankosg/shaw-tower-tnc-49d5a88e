import { supabase } from '@/integrations/supabase/client';
import {
  downloadActiveCodeFile,
  saveCodeVersion,
} from '@/lib/code-editor';

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
  summary?: string;
}

export async function generateSlideCode(input: SlideCodegenInput): Promise<SlideCodegenResult> {
  const { data, error } = await supabase.functions.invoke<SlideCodegenResult>('slide-codegen', {
    body: input,
  });
  if (error) throw new Error(error.message || 'Edge function failed');
  if (!data) throw new Error('Empty response from slide-codegen');
  return data;
}

const PPT_BUILDER_FILE = 'ppt-builder.ts';

export interface AddSlideToReportResult {
  appendedToVersion: string;
  newLineCount: number;
}

/**
 * Append a generated slide function to the active ppt-builder.ts in Storage
 * and save it as a new active version. This does NOT touch the codebase —
 * the user must still ask Lovable chat to sync Storage → codebase and register
 * the new slide key in SLIDE_REGISTRY.
 */
export async function addSlideToReport(params: {
  functionCode: string;
  suggestedKey: string;
  suggestedLabel: string;
  title: string;
}): Promise<AddSlideToReportResult> {
  const { functionCode, suggestedKey, suggestedLabel, title } = params;
  const active = await downloadActiveCodeFile(PPT_BUILDER_FILE);
  if (!active) {
    throw new Error(
      `Storage에 ${PPT_BUILDER_FILE}의 활성 버전이 없습니다. Code Editor의 "Sync from codebase"를 먼저 실행해 주세요.`,
    );
  }
  const existing = active.content;
  if (existing.includes(`function buildSlide_${suggestedKey}`)) {
    throw new Error(`이미 같은 키(${suggestedKey})를 가진 슬라이드 함수가 있습니다. 다른 제목으로 다시 만들어 주세요.`);
  }

  const banner = `\n\n// ─── New slide: ${suggestedLabel} (${suggestedKey}) ───────────────\n// Added via New Slide Generator: "${title.replace(/\*\//g, '*\\/')}"\n`;
  const trimmed = existing.replace(/\s+$/, '');
  const merged = `${trimmed}${banner}${functionCode.trim()}\n`;

  const saved = await saveCodeVersion({
    fileName: PPT_BUILDER_FILE,
    content: merged,
    changeSummaryKo: `슬라이드 추가: ${suggestedLabel} (${suggestedKey})`,
    instruction: `New Slide Generator: ${title}`,
  });

  return {
    appendedToVersion: saved.id,
    newLineCount: merged.split('\n').length,
  };
}
