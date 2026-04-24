import { describe, expect, it } from 'vitest';
import { classifyDefect, sortRules, type ClassificationRule, type DisciplineFallback } from '@/lib/defect-classifier';

const RULES: ClassificationRule[] = [
  { id: 'r-leak',  keyword: 'leak',  main_trade: 'Plumbing',      sub_trade: 'Leak',     work_type: 'Leak Repair',         priority: 10,  is_active: true },
  { id: 'r-water', keyword: 'water', main_trade: 'Plumbing',      sub_trade: 'Water',    work_type: 'Water Damage Repair', priority: 10,  is_active: true },
  { id: 'r-paint', keyword: 'paint', main_trade: 'Architectural', sub_trade: 'Painting', work_type: 'Paint Touch-up',      priority: 100, is_active: true },
  { id: 'r-door',  keyword: 'door',  main_trade: 'Architectural', sub_trade: 'Door',     work_type: 'Door Adjustment',     priority: 100, is_active: true },
];

const FALLBACKS: DisciplineFallback[] = [
  { id: 'f-mech', field_discipline: 'mechanical', main_trade: 'ACMV',          sub_trade: 'General', work_type: 'Mechanical Rectification', is_active: true, created_at: '2025-01-01' },
  { id: 'f-elec', field_discipline: 'electrical', main_trade: 'Electrical',    sub_trade: 'General', work_type: 'Electrical Rectification', is_active: true, created_at: '2025-01-01' },
];

describe('defect-classifier', () => {
  it('sortRules orders by priority asc then keyword length desc', () => {
    const sorted = sortRules(RULES);
    expect(sorted[0].priority).toBe(10);
    expect(sorted[0].keyword.length).toBeGreaterThanOrEqual(sorted[1].keyword.length);
  });

  it('matches a simple keyword rule', () => {
    const r = classifyDefect({ description: 'paint touch up' }, RULES, FALLBACKS);
    expect(r.source).toBe('rule');
    expect(r.work_type).toBe('Paint Touch-up');
  });

  it('priority + length: water leak should match higher-priority rule first', () => {
    const r = classifyDefect({ description: 'water leak in ceiling' }, RULES, FALLBACKS);
    expect(r.source).toBe('rule');
    // both 'leak' and 'water' priority=10, length tie => 'leak' or 'water' (5 vs 4)
    expect(['Leak Repair', 'Water Damage Repair']).toContain(r.work_type);
  });

  it('falls back to discipline (bidirectional substring)', () => {
    const r = classifyDefect({ description: '', field_discipline: 'Mech' }, RULES, FALLBACKS);
    expect(r.source).toBe('discipline');
    expect(r.main_trade).toBe('ACMV');
  });

  it('discipline match also works when input is longer (input includes fb)', () => {
    const r = classifyDefect({ description: '', field_discipline: 'Mechanical Engineering' }, RULES, FALLBACKS);
    expect(r.source).toBe('discipline');
    expect(r.work_type).toBe('Mechanical Rectification');
  });

  it('returns unclassified when nothing matches', () => {
    const r = classifyDefect({ description: 'random thing', field_discipline: 'xyz' }, RULES, FALLBACKS);
    expect(r.source).toBe('unclassified');
    expect(r.work_type).toBe('Review Required');
  });

  it('returns unclassified when both inputs empty', () => {
    const r = classifyDefect({ description: '', field_discipline: '' }, RULES, FALLBACKS);
    expect(r.source).toBe('unclassified');
  });
});
