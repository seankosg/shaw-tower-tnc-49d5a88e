import { describe, expect, it } from 'vitest';
import { parseArea, reconcileAreaFields, isLevelToken, canonicalLevel } from '@/lib/defect-parser';

describe('isLevelToken', () => {
  it.each([
    ['Level 1', true], ['Level 07', true], ['LEVEL 12', true], ['Level-3', true], ['Level 2A', true],
    ['L7', true], ['L07', true], ['Lvl 12', true],
    ['B1', true], ['Basement', true], ['Basement 2', true],
    ['Roof', true], ['Roof Top', true], ['RF', true],
    ['Ground', true], ['Ground Floor', true], ['GF', true],
    ['Mezzanine', true], ['Penthouse', true],
    // Negatives
    ['STR', false], ['MEP', false], ['Office Area', false],
    ['Shaw Tower Redevelopment', false], ['Corridor 1', false],
    ['Closed By Organization', false], ['', false],
  ])('isLevelToken(%j) → %s', (input, expected) => {
    expect(isLevelToken(input)).toBe(expected);
  });
});

describe('canonicalLevel', () => {
  it('zero-pads numeric levels', () => {
    expect(canonicalLevel('Level 7')).toBe('Level 07');
    expect(canonicalLevel('level 7')).toBe('Level 07');
    expect(canonicalLevel('L7')).toBe('Level 07');
    expect(canonicalLevel('Lvl 12')).toBe('Level 12');
    expect(canonicalLevel('Level 07')).toBe('Level 07');
  });
  it('preserves named levels', () => {
    expect(canonicalLevel('Roof')).toBe('Roof');
    expect(canonicalLevel('Ground Floor')).toBe('Ground Floor');
  });
});

describe('parseArea', () => {
  it('extracts level and leaves location empty when raw ends at level', () => {
    // Previously: type=Project, level=STR, location=Level 24 (BUG)
    expect(parseArea('Shaw Tower Redevelopment > STR > Level 24')).toEqual({
      area_type: 'STR',
      area_level: 'Level 24',
      area_location: null,
    });
  });

  it('puts detail after the level into location, not the level itself', () => {
    expect(parseArea('Shaw Tower Redevelopment > STR > Level 07 > Office Area')).toEqual({
      area_type: 'STR',
      area_level: 'Level 07',
      area_location: 'Office Area',
    });
  });

  it('joins multiple location segments after the level', () => {
    expect(parseArea('Project > MEP > Level 12 > Lift Lobby > North')).toEqual({
      area_type: 'MEP',
      area_level: 'Level 12',
      area_location: 'Lift Lobby > North',
    });
  });

  it('removes duplicate level token from the location tail', () => {
    expect(parseArea('Project > STR > Level 08 > Level 08 > Corridor')).toEqual({
      area_type: 'STR',
      area_level: 'Level 08',
      area_location: 'Corridor',
    });
  });

  it('canonicalizes level format', () => {
    expect(parseArea('Project > STR > Level 7 > Office')).toEqual({
      area_type: 'STR',
      area_level: 'Level 07',
      area_location: 'Office',
    });
  });

  it('handles single-token area', () => {
    expect(parseArea('Shaw Tower Redevelopment')).toEqual({
      area_type: 'Shaw Tower Redevelopment',
      area_level: null,
      area_location: null,
    });
  });

  it('returns nulls for empty input', () => {
    expect(parseArea(null)).toEqual({ area_type: null, area_level: null, area_location: null });
    expect(parseArea('')).toEqual({ area_type: null, area_level: null, area_location: null });
  });

  it('does NOT promote a non-level token (STR/MEP) into level when no level exists', () => {
    expect(parseArea('Shaw Tower Redevelopment > STR > Office Area')).toEqual({
      area_type: 'STR',
      area_level: null,
      area_location: 'Office Area',
    });
  });
});

describe('reconcileAreaFields', () => {
  const parsed = { area_type: 'STR', area_level: 'Level 07', area_location: 'Office Area' };

  it('drops explicit Location that equals the level', () => {
    const r = reconcileAreaFields(parsed, null, 'Level 07');
    expect(r.area_location).toBe('Office Area'); // keeps parsed; explicit rejected
  });

  it('drops explicit Location that is just a level token', () => {
    const r = reconcileAreaFields(parsed, null, 'Level 7');
    expect(r.area_location).toBe('Office Area');
  });

  it('drops explicit Location that contains another raw path', () => {
    const r = reconcileAreaFields(parsed, null, 'Shaw Tower > STR > Level 12 > Fire Lift Lobby 2');
    expect(r.area_location).toBe('Office Area');
  });

  it('drops explicit Location that is a status string', () => {
    const r = reconcileAreaFields(parsed, null, 'Closed By Organization');
    expect(r.area_location).toBe('Office Area');
  });

  it('drops explicit Location that is just a number', () => {
    const r = reconcileAreaFields(parsed, null, '1746');
    expect(r.area_location).toBe('Office Area');
  });

  it('accepts a sane explicit Location', () => {
    const r = reconcileAreaFields(parsed, null, 'Server Room A');
    expect(r.area_location).toBe('Server Room A');
  });

  it('only adopts explicit Level when it looks like a level', () => {
    const r1 = reconcileAreaFields({ area_type: null, area_level: null, area_location: null }, 'STR', null);
    expect(r1.area_level).toBe('STR'); // short alphanumeric label fallback when raw had nothing
    const r2 = reconcileAreaFields(parsed, 'L9', null);
    expect(r2.area_level).toBe('Level 09'); // canonicalized
  });

  it('final guard: never lets location duplicate level even if parsed says so', () => {
    const r = reconcileAreaFields(
      { area_type: 'STR', area_level: 'Level 07', area_location: 'Level 07' },
      null,
      null,
    );
    expect(r.area_location).toBeNull();
  });
});
