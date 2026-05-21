import { describe, it, expect } from 'vitest';
import { summarizeSystemNames } from '@/lib/ddn/system-summary';

describe('summarizeSystemNames', () => {
  it('returns empty for no rows', () => {
    expect(summarizeSystemNames([])).toBe('');
  });

  it('dedupes and sorts system names', () => {
    const out = summarizeSystemNames([
      { system: 'Sprinkler', level: 'L21' },
      { system: 'Chiller Plant', level: 'L5' },
      { system: 'Sprinkler', level: 'L22' },
      { system: 'Chiller Plant', level: 'L6' },
      { system: 'Lighting', level: 'L1' },
    ]);
    expect(out).toBe('Chiller Plant, Lighting, Sprinkler');
  });

  it('ignores empty/whitespace system values', () => {
    expect(
      summarizeSystemNames([
        { system: '', level: 'L1' },
        { system: '   ', level: 'L2' },
        { system: 'Genset', level: null },
      ]),
    ).toBe('Genset');
  });

  it('truncates with "+K systems" when exceeding maxLen', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      system: `System ${String(i).padStart(2, '0')}`,
      level: null,
    }));
    const out = summarizeSystemNames(rows, { maxLen: 60 });
    expect(out).toMatch(/… \+\d+ systems$/);
    expect(out.length).toBeLessThanOrEqual(60);
  });
});
