/**
 * DDN DOCX generator: RenderedLetter → .docx Blob, with Storage upload helper.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageOrientation, LevelFormat, BorderStyle,
} from 'docx';
import { supabase } from '@/integrations/supabase/client';
import type { RenderedLetter } from './mapping-types';

const FONT = 'Times New Roman';

function p(text: string, opts: { bold?: boolean; size?: number; align?: AlignmentType } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 22, font: FONT })],
  });
}

export function buildDocx(letter: RenderedLetter): Document {
  const children: Paragraph[] = [];

  // header
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Ref: ', bold: true, font: FONT, size: 20 }),
        new TextRun({ text: letter.letterNo, font: FONT, size: 20 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: 'Date: ', bold: true, font: FONT, size: 20 }),
        new TextRun({ text: letter.date, font: FONT, size: 20 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      children: [new TextRun({
        text: `Subject: Daily Default Notice${letter.dayN != null ? ` — Day ${letter.dayN}` : ''}`,
        bold: true, font: FONT, size: 26,
      })],
    }),
  );

  letter.sections.forEach((sec, idx) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
      children: [new TextRun({ text: `${idx + 1}. ${sec.titleEn}`, bold: true, font: FONT, size: 24 })],
    }));
    for (const b of sec.blocks) {
      if (b.kind === 'heading') {
        children.push(p(b.text, { bold: true, size: 22 }));
      } else if (b.kind === 'paragraph') {
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: [new TextRun({ text: b.html, font: FONT, size: 22 })],
        }));
      } else if (b.kind === 'bullet') {
        for (const it of b.items) {
          children.push(new Paragraph({
            numbering: { reference: 'ddn-bullets', level: 0 },
            spacing: { after: 60 },
            children: [new TextRun({ text: it, font: FONT, size: 22 })],
          }));
        }
      }
    }
  });

  children.push(
    new Paragraph({ spacing: { before: 480, after: 60 }, children: [new TextRun({ text: 'Yours faithfully,', font: FONT, size: 22 })] }),
    new Paragraph({ spacing: { before: 480, after: 60 }, children: [new TextRun({ text: '________________________', font: FONT, size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: 'HDEC Singapore Project Director', font: FONT, size: 22 })] }),
  );

  return new Document({
    creator: 'HDEC Singapore Project',
    title: `DDN ${letter.letterNo}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: {
      config: [{
        reference: 'ddn-bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT }, // A4
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children,
    }],
  });
}

export async function renderDocxBlob(letter: RenderedLetter): Promise<Blob> {
  const doc = buildDocx(letter);
  return Packer.toBlob(doc);
}

/** Upload to storage and update ddn_entries.generated_docx_path + status='finalized'. */
export async function generateAndUploadDocx(args: {
  entryId: string | null;
  entryDate: string;
  letter: RenderedLetter;
  letterNo: string;
}): Promise<{ path: string; blob: Blob }> {
  const { entryDate, letter, letterNo } = args;
  const blob = await renderDocxBlob(letter);
  const safeNo = letterNo.replace(/[^\w.-]+/g, '_');
  const path = `${entryDate.slice(0, 7)}/${entryDate}_${safeNo}_${Date.now()}.docx`;

  const { error: upErr } = await supabase.storage
    .from('daily-notices')
    .upload(path, blob, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase
    .from('ddn_entries')
    .update({
      generated_docx_path: path,
      letter_no: letterNo,
      status: 'finalized',
    })
    .eq('entry_date', entryDate);
  if (dbErr) throw dbErr;

  return { path, blob };
}

export async function downloadDocxFromStorage(path: string, suggestedName?: string) {
  const { data, error } = await supabase.storage.from('daily-notices').download(path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName ?? path.split('/').pop() ?? 'notice.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
