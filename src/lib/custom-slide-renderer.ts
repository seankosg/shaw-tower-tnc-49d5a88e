/**
 * Custom slide renderer — interprets a SlideSpec at PPT export time.
 *
 * Called from ppt-builder.ts when a slide key in the config is not a
 * built-in slide.
 */
import type pptxgen from 'pptxgenjs';
import { resolvePath, fmtValue, type KpiBag, type SlideBlock, type SlideSpec } from '@/lib/custom-slide-spec';
import { SLIDE_W, SLIDE_H, layoutBlocks } from '@/lib/custom-slide-layout';

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function extractField(arr: unknown[], field?: string): unknown[] {
  if (!field) return arr;
  return arr.map((row) =>
    row && typeof row === 'object' ? (row as Record<string, unknown>)[field] : undefined,
  );
}

interface RenderCtx {
  pres: pptxgen;
  slide: pptxgen.Slide;
  kpis: KpiBag;
  C: Record<string, string>;
  FONT: string;
  FONT_MONO: string;
}

function renderBlock(ctx: RenderCtx, b: SlideBlock, frame: { x: number; y: number; w: number; h: number }) {
  const { pres, slide, kpis, C, FONT } = ctx;
  const { x, y, w, h } = frame;

  // Background card (subtle)
  const cardBg = () => {
    slide.addShape(pres.ShapeType.rect, {
      x, y, w, h,
      fill: { color: C.cardBody ?? '152C5E' },
      line: { color: C.cardBorder ?? '1E3A7A', width: 0.75 },
    });
  };

  try {
    switch (b.type) {
      case 'kpi-card': {
        cardBg();
        const raw = resolvePath(kpis, b.valuePath);
        const valueText = fmtValue(raw, { unit: b.unit, decimals: b.decimals });
        slide.addText(b.title, {
          x: x + 0.25, y: y + 0.25, w: w - 0.5, h: 0.35,
          fontFace: FONT, fontSize: 12, color: C.textMuted ?? '8B9BB8',
        });
        slide.addText(valueText, {
          x: x + 0.25, y: y + 0.6, w: w - 0.5, h: 1.0,
          fontFace: FONT, fontSize: 44, bold: true,
          color: b.color ?? C.textPrimary ?? 'FFFFFF', valign: 'middle',
        });
        if (b.barPath) {
          const pct = Math.max(0, Math.min(100, num(resolvePath(kpis, b.barPath))));
          const barY = y + h - 0.55;
          const barX = x + 0.25;
          const barW = w - 0.5;
          slide.addShape(pres.ShapeType.rect, {
            x: barX, y: barY, w: barW, h: 0.1,
            fill: { color: C.cardBorder ?? '1E3A7A' }, line: { color: C.cardBorder ?? '1E3A7A', width: 0 },
          });
          slide.addShape(pres.ShapeType.rect, {
            x: barX, y: barY, w: Math.max(0.02, (pct / 100) * barW), h: 0.1,
            fill: { color: b.color ?? C.cyan ?? '67E8F9' }, line: { color: b.color ?? C.cyan ?? '67E8F9', width: 0 },
          });
        }
        if (b.subtitle) {
          slide.addText(b.subtitle, {
            x: x + 0.25, y: y + h - 0.35, w: w - 0.5, h: 0.3,
            fontFace: FONT, fontSize: 11, color: C.textMuted ?? '8B9BB8',
          });
        }
        break;
      }

      case 'bar-row': {
        cardBg();
        const pct = Math.max(0, Math.min(100, num(resolvePath(kpis, b.pctPath))));
        slide.addText(b.label, {
          x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.35,
          fontFace: FONT, fontSize: 13, color: C.textSecondary ?? 'CADCFC',
        });
        slide.addText(`${pct.toFixed(1)}%`, {
          x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.35,
          fontFace: FONT, fontSize: 13, bold: true, color: C.textPrimary ?? 'FFFFFF', align: 'right',
        });
        const barY = y + 0.7;
        const barX = x + 0.25;
        const barW = w - 0.5;
        slide.addShape(pres.ShapeType.rect, {
          x: barX, y: barY, w: barW, h: 0.18,
          fill: { color: C.cardBorder ?? '1E3A7A' }, line: { color: C.cardBorder ?? '1E3A7A', width: 0 },
        });
        slide.addShape(pres.ShapeType.rect, {
          x: barX, y: barY, w: Math.max(0.02, (pct / 100) * barW), h: 0.18,
          fill: { color: b.color ?? C.cyan ?? '67E8F9' }, line: { color: b.color ?? C.cyan ?? '67E8F9', width: 0 },
        });
        break;
      }

      case 'metric-grid': {
        const cols = b.columns ?? Math.min(b.items.length, 4);
        const rows = Math.ceil(b.items.length / cols);
        const gap = 0.15;
        const cellW = (w - gap * (cols - 1)) / cols;
        const cellH = (h - gap * (rows - 1)) / rows;
        b.items.forEach((it, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const cx = x + c * (cellW + gap);
          const cy = y + r * (cellH + gap);
          slide.addShape(pres.ShapeType.rect, {
            x: cx, y: cy, w: cellW, h: cellH,
            fill: { color: C.cardBody ?? '152C5E' }, line: { color: C.cardBorder ?? '1E3A7A', width: 0.75 },
          });
          slide.addText(it.label, {
            x: cx + 0.15, y: cy + 0.15, w: cellW - 0.3, h: 0.3,
            fontFace: FONT, fontSize: 11, color: C.textMuted ?? '8B9BB8',
          });
          slide.addText(fmtValue(resolvePath(kpis, it.valuePath), { unit: it.unit, decimals: it.decimals }), {
            x: cx + 0.15, y: cy + 0.45, w: cellW - 0.3, h: cellH - 0.55,
            fontFace: FONT, fontSize: 28, bold: true,
            color: it.color ?? C.textPrimary ?? 'FFFFFF', valign: 'middle',
          });
        });
        break;
      }

      case 'text-block': {
        slide.addText(b.text, {
          x, y, w, h,
          fontFace: FONT,
          fontSize: b.fontSize ?? 14,
          bold: b.bold ?? false,
          color: b.color ?? C.textSecondary ?? 'CADCFC',
          align: b.align ?? 'left',
          valign: 'top',
        });
        break;
      }

      case 'bullet-list': {
        cardBg();
        let cursorY = y + 0.2;
        if (b.title) {
          slide.addText(b.title, {
            x: x + 0.25, y: cursorY, w: w - 0.5, h: 0.35,
            fontFace: FONT, fontSize: 14, bold: true, color: C.textPrimary ?? 'FFFFFF',
          });
          cursorY += 0.4;
        }
        slide.addText(
          b.items.map((t) => ({ text: t, options: { bullet: true } })),
          {
            x: x + 0.35, y: cursorY, w: w - 0.6, h: y + h - cursorY - 0.2,
            fontFace: FONT, fontSize: 12, color: C.textSecondary ?? 'CADCFC',
            paraSpaceAfter: 4,
          },
        );
        break;
      }

      case 'simple-table': {
        let cursorY = y;
        if (b.title) {
          slide.addText(b.title, {
            x, y: cursorY, w, h: 0.35,
            fontFace: FONT, fontSize: 14, bold: true, color: C.textPrimary ?? 'FFFFFF',
          });
          cursorY += 0.4;
        }
        // Resolve rows
        let dataRows: (string | number | null)[][];
        if (b.rows && b.rows.length) {
          dataRows = b.rows;
        } else if (b.rowsPath && b.columnPaths) {
          const arr = asArray(resolvePath(kpis, b.rowsPath));
          dataRows = arr.slice(0, 10).map((row) =>
            b.columnPaths!.map((cp) => {
              const v = row && typeof row === 'object' ? (row as Record<string, unknown>)[cp] : undefined;
              return v == null ? '' : typeof v === 'number' ? v : String(v);
            }),
          );
        } else {
          dataRows = [];
        }
        const headerRow = b.headers.map((h2) => ({
          text: h2,
          options: { bold: true, color: 'FFFFFF', fill: { color: C.cardBorder ?? '1E3A7A' } },
        }));
        const bodyRows = dataRows.map((r) =>
          r.map((c) => ({ text: String(c ?? ''), options: { color: C.textSecondary ?? 'CADCFC' } })),
        );
        slide.addTable([headerRow, ...bodyRows] as never, {
          x, y: cursorY, w, h: y + h - cursorY,
          fontFace: FONT, fontSize: 10,
          colW: b.colWidths,
          border: { type: 'solid', pt: 0.5, color: C.cardBorder ?? '1E3A7A' },
        });
        break;
      }

      case 'bar-chart':
      case 'line-chart':
      case 'stacked-bar': {
        const labelsRaw = resolvePath(kpis, b.labelsPath);
        const labels = extractField(asArray(labelsRaw), b.labelField).map((v) => String(v ?? ''));
        const chartData = b.series.map((s) => {
          const arr = extractField(asArray(resolvePath(kpis, s.valuesPath)), s.valueField).map(num);
          return { name: s.name, labels, values: arr };
        });
        const colors = b.series.map((s) => s.color ?? C.cyan ?? '67E8F9');
        const chartType =
          b.type === 'line-chart'
            ? pres.ChartType.line
            : (b.orientation === 'bar' ? pres.ChartType.bar : pres.ChartType.bar);
        const isStacked = b.type === 'stacked-bar';
        if (b.title) {
          slide.addText(b.title, {
            x, y, w, h: 0.35,
            fontFace: FONT, fontSize: 14, bold: true, color: C.textPrimary ?? 'FFFFFF',
          });
        }
        slide.addChart(chartType as never, chartData as never, {
          x, y: b.title ? y + 0.4 : y, w, h: b.title ? h - 0.4 : h,
          chartColors: colors,
          showLegend: chartData.length > 1, legendPos: 'b', legendColor: C.textSecondary ?? 'CADCFC',
          catAxisLabelColor: C.textMuted ?? '8B9BB8',
          valAxisLabelColor: C.textMuted ?? '8B9BB8',
          barDir: b.type === 'line-chart' ? undefined : (('orientation' in b && b.orientation === 'bar') ? 'bar' : 'col'),
          barGrouping: isStacked ? 'stacked' : 'clustered',
        });
        break;
      }

      case 'pie-chart': {
        const labels = extractField(asArray(resolvePath(kpis, b.labelsPath)), b.labelField).map((v) => String(v ?? ''));
        const values = extractField(asArray(resolvePath(kpis, b.valuesPath)), b.valueField).map(num);
        if (b.title) {
          slide.addText(b.title, {
            x, y, w, h: 0.35,
            fontFace: FONT, fontSize: 14, bold: true, color: C.textPrimary ?? 'FFFFFF',
          });
        }
        const pieType = b.doughnut ? pres.ChartType.doughnut : pres.ChartType.pie;
        slide.addChart(pieType as never, [{ name: 'Series 1', labels, values }] as never, {
          x, y: b.title ? y + 0.4 : y, w, h: b.title ? h - 0.4 : h,
          showLegend: true, legendPos: 'r', legendColor: C.textSecondary ?? 'CADCFC',
          dataLabelColor: C.textPrimary ?? 'FFFFFF',
          showPercent: true,
        });
        break;
      }
    }
  } catch (err) {
    // Fallback: draw an error label inside the frame so export never fails.
    slide.addText(`Render error: ${(err as Error).message}`, {
      x, y, w, h,
      fontFace: FONT, fontSize: 10, color: 'F87171', valign: 'middle', align: 'center',
    });
  }
}

/**
 * Auto-stack blocks that don't have explicit coordinates.
 * Splits remaining body height equally among unpositioned blocks.
 */
function layoutBlocks(spec: SlideSpec): { block: SlideBlock; frame: { x: number; y: number; w: number; h: number } }[] {
  const out: { block: SlideBlock; frame: { x: number; y: number; w: number; h: number } }[] = [];
  const unpositioned: SlideBlock[] = [];
  for (const b of spec.blocks) {
    if (b.x != null && b.y != null && b.w != null && b.h != null) {
      out.push({ block: b, frame: { x: b.x, y: b.y, w: b.w, h: b.h } });
    } else {
      unpositioned.push(b);
    }
  }
  if (unpositioned.length === 0) return out;

  if (spec.layout === 'two-column' && unpositioned.length >= 2) {
    const gap = 0.2;
    const colW = (BODY_W - gap) / 2;
    const half = Math.ceil(unpositioned.length / 2);
    const left = unpositioned.slice(0, half);
    const right = unpositioned.slice(half);
    const stack = (list: SlideBlock[], cx: number) => {
      const eachH = BODY_H / list.length;
      list.forEach((b, i) => {
        out.push({ block: b, frame: { x: cx, y: BODY_Y + i * eachH, w: colW, h: eachH - 0.15 } });
      });
    };
    stack(left, BODY_X);
    stack(right, BODY_X + colW + gap);
    return out;
  }

  if (spec.layout === 'three-column' && unpositioned.length >= 3) {
    const gap = 0.2;
    const colW = (BODY_W - 2 * gap) / 3;
    const per = Math.ceil(unpositioned.length / 3);
    for (let c = 0; c < 3; c++) {
      const col = unpositioned.slice(c * per, (c + 1) * per);
      const eachH = BODY_H / Math.max(1, col.length);
      col.forEach((b, i) => {
        out.push({
          block: b,
          frame: { x: BODY_X + c * (colW + gap), y: BODY_Y + i * eachH, w: colW, h: eachH - 0.15 },
        });
      });
    }
    return out;
  }

  // single column auto-stack
  const eachH = BODY_H / unpositioned.length;
  unpositioned.forEach((b, i) => {
    out.push({ block: b, frame: { x: BODY_X, y: BODY_Y + i * eachH, w: BODY_W, h: eachH - 0.15 } });
  });
  return out;
}

export interface RenderCustomSlideArgs {
  pres: pptxgen;
  spec: SlideSpec;
  kpis: KpiBag;
  C: Record<string, string>;
  FONT: string;
  FONT_MONO: string;
}

export function renderCustomSlide(args: RenderCustomSlideArgs): void {
  const { pres, spec, kpis, C, FONT, FONT_MONO } = args;
  const slide = pres.addSlide();
  slide.background = { color: C.bgBody ?? '0A1A40' };

  // Title bar
  slide.addText(spec.title, {
    x: 0.5, y: 0.3, w: SLIDE_W - 1, h: 0.5,
    fontFace: FONT, fontSize: 24, bold: true, color: C.textPrimary ?? 'FFFFFF',
  });
  if (spec.subtitle) {
    slide.addText(spec.subtitle, {
      x: 0.5, y: 0.75, w: SLIDE_W - 1, h: 0.3,
      fontFace: FONT, fontSize: 13, color: C.textMuted ?? '8B9BB8',
    });
  }

  const placed = layoutBlocks(spec);
  const ctx: RenderCtx = { pres, slide, kpis, C, FONT, FONT_MONO };
  for (const { block, frame } of placed) {
    renderBlock(ctx, block, frame);
  }

  // Footer
  slide.addText('SHAW · Custom Slide', {
    x: 0.5, y: SLIDE_H - 0.4, w: 5, h: 0.3,
    fontFace: FONT_MONO, fontSize: 10, color: C.cyan ?? '67E8F9',
  });
}
