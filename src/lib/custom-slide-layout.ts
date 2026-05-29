/**
 * Shared layout helper for custom slides.
 *
 * Both the PPT renderer (custom-slide-renderer.ts) and the in-browser
 * preview component (SlideSpecPreview.tsx) use this so the on-screen
 * preview matches the exported PPT exactly.
 *
 * All coordinates are in inches at 16:9 / 13.33" × 7.5".
 */
import type { SlideBlock, SlideSpec } from '@/lib/custom-slide-spec';

export const SLIDE_W = 13.33;
export const SLIDE_H = 7.5;
export const BODY_X = 0.5;
export const BODY_Y = 1.0;
export const BODY_W = 12.33;
export const BODY_H = 5.9;

/** Pixel canvas size used by the HTML preview (96 DPI × inches). */
export const PREVIEW_W_PX = Math.round(SLIDE_W * 96); // 1280
export const PREVIEW_H_PX = Math.round(SLIDE_H * 96); // 720

export interface BlockFrame { x: number; y: number; w: number; h: number }
export interface PlacedBlock { block: SlideBlock; frame: BlockFrame }

/**
 * Auto-stack blocks without explicit coordinates.
 * Splits remaining body height equally among unpositioned blocks.
 */
export function layoutBlocks(spec: SlideSpec): PlacedBlock[] {
  const out: PlacedBlock[] = [];
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
