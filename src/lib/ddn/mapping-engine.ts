/**
 * DDN mapping engine: inputs + schema + rules + settings + computed → RenderedLetter.
 */
import type { DdnInputs, DdnSettings, DdnField, DdnFieldOption } from './schema-types';
import { COMPUTED, type DdnComputedContext } from './computed';
import type {
  DdnConditionNode,
  DdnMappingRule,
  RenderedBlock,
  RenderedLetter,
  RenderedSection,
} from './mapping-types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown): number => {
  if (isNum(v)) return v;
  const x = parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};

interface Scope {
  inputs: DdnInputs;
  settings: DdnSettings | null;
  computed: Record<string, string>;
  entryDate: string;
  dayN: number | null;
  letterNo: string;
  /** Optional row scope inside {{loop:...}} */
  row?: Record<string, unknown>;
  warnings: string[];
  optionLabelByFieldKey: Map<string, Map<string, string>>;
}

/** Resolve "settings.x" | "computed.x" | "<field_key>" | row-scoped key */
function resolve(path: string, scope: Scope): unknown {
  if (path.startsWith('settings.')) {
    const k = path.slice('settings.'.length) as keyof DdnSettings;
    return scope.settings?.[k] ?? '';
  }
  if (path.startsWith('computed.')) {
    const k = path.slice('computed.'.length);
    return scope.computed[k] ?? '';
  }
  if (path === 'entry_date') return scope.entryDate;
  if (path === 'day_n') return scope.dayN ?? '';
  if (path === 'letter_no') return scope.letterNo;
  if (scope.row && Object.prototype.hasOwnProperty.call(scope.row, path)) {
    return scope.row[path];
  }
  return scope.inputs[path];
}

// ───────────────────────── condition ─────────────────────────
export function evaluateCondition(cond: DdnConditionNode, scope: Scope): boolean {
  try {
    switch (cond.type) {
      case 'always': return true;
      case 'and': return cond.of.every((c) => evaluateCondition(c, scope));
      case 'or':  return cond.of.some((c) => evaluateCondition(c, scope));
      case 'not': return !evaluateCondition(cond.of, scope);
      case 'eq':  return String(resolve(cond.field, scope) ?? '') === String(cond.value);
      case 'neq': return String(resolve(cond.field, scope) ?? '') !== String(cond.value);
      case 'gt':  return num(resolve(cond.field, scope)) > num(cond.value);
      case 'lt':  return num(resolve(cond.field, scope)) < num(cond.value);
      case 'contains': {
        const v = resolve(cond.field, scope);
        if (Array.isArray(v)) return v.map(String).includes(String(cond.value));
        return String(v ?? '').includes(String(cond.value));
      }
      case 'exists': {
        const v = resolve(cond.field, scope);
        if (Array.isArray(v)) return v.length > 0;
        if (v === null || v === undefined || v === '') return false;
        return true;
      }
      default: return false;
    }
  } catch (e) {
    scope.warnings.push(`condition error: ${(e as Error).message}`);
    return false;
  }
}

// ───────────────────────── formatting ─────────────────────────
function formatDate(iso: unknown): string {
  if (!iso) return '';
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'number') return v.toLocaleString('en-US');
  return String(v);
}

function listLabels(fieldKey: string, scope: Scope): string {
  const v = resolve(fieldKey, scope);
  if (!Array.isArray(v) || v.length === 0) return '';
  const map = scope.optionLabelByFieldKey.get(fieldKey);
  return v.map((x) => map?.get(String(x)) ?? String(x)).join(', ');
}

// ───────────────────────── template render ─────────────────────────
const LOOP_RE = /\{\{loop:([\w.]+)\}\}([\s\S]*?)\{\{\/loop\}\}/g;
const TAG_RE  = /\{\{([^}]+)\}\}/g;

function renderInner(tpl: string, scope: Scope): string {
  return tpl.replace(TAG_RE, (_m, raw: string) => {
    const expr = raw.trim();
    try {
      if (expr.startsWith('date:')) return formatDate(resolve(expr.slice(5), scope));
      if (expr.startsWith('list:')) return listLabels(expr.slice(5), scope);
      const val = resolve(expr, scope);
      if (val === '' || val === null || val === undefined) {
        scope.warnings.push(`empty value: {{${expr}}}`);
      }
      return formatValue(val);
    } catch (e) {
      scope.warnings.push(`render error: {{${expr}}}: ${(e as Error).message}`);
      return '';
    }
  });
}

export function renderTemplate(template: string, scope: Scope): string {
  // loops first
  const expanded = template.replace(LOOP_RE, (_m, fieldKey: string, body: string) => {
    const arr = resolve(fieldKey, scope);
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr
      .map((row) => renderInner(body, { ...scope, row: row as Record<string, unknown> }))
      .join('\n');
  });
  return renderInner(expanded, scope);
}

// ───────────────────────── orchestration ─────────────────────────

export interface BuildLetterArgs {
  inputs: DdnInputs;
  settings: DdnSettings | null;
  fields: DdnField[];
  rules: DdnMappingRule[];
  sections: { id: string; title_en: string | null; display_order: number }[];
  entryDate: string;
  dayN: number | null;
  letterNo: string;
  history?: DdnComputedContext['history'];
}

function buildOptionMap(fields: DdnField[]): Map<string, Map<string, string>> {
  const m = new Map<string, Map<string, string>>();
  for (const f of fields) {
    if (!f.options?.length) continue;
    const inner = new Map<string, string>();
    for (const o of f.options as DdnFieldOption[]) {
      inner.set(o.value, o.label_en ?? o.label_ko);
    }
    m.set(f.field_key, inner);
  }
  return m;
}

function computeAll(ctx: DdnComputedContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(COMPUTED)) {
    try { out[k] = COMPUTED[k](ctx); }
    catch { out[k] = ''; }
  }
  return out;
}

export function buildLetter(args: BuildLetterArgs): RenderedLetter {
  const { inputs, settings, fields, rules, sections, entryDate, dayN, letterNo, history } = args;
  const computed = computeAll({ inputs, settings, today: entryDate, history });
  const scope: Scope = {
    inputs,
    settings,
    computed,
    entryDate,
    dayN,
    letterNo,
    warnings: [],
    optionLabelByFieldKey: buildOptionMap(fields),
  };

  const rulesBySection = new Map<string, DdnMappingRule[]>();
  for (const r of rules.filter((r) => r.is_active)) {
    const arr = rulesBySection.get(r.section_id) ?? [];
    arr.push(r);
    rulesBySection.set(r.section_id, arr);
  }
  for (const arr of rulesBySection.values()) arr.sort((a, b) => a.display_order - b.display_order);

  const orderedSections = [...sections].sort((a, b) => a.display_order - b.display_order);
  const out: RenderedSection[] = [];

  for (const sec of orderedSections) {
    const sRules = rulesBySection.get(sec.id) ?? [];
    const blocks: RenderedBlock[] = [];
    for (const r of sRules) {
      if (!evaluateCondition(r.condition, scope)) continue;
      const rendered = renderTemplate(r.template, scope).trim();
      if (!rendered) continue;
      if (r.style === 'heading') {
        blocks.push({ kind: 'heading', text: rendered, ruleKey: r.rule_key });
      } else if (r.style === 'bullet') {
        const items = rendered.split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
        blocks.push({ kind: 'bullet', items, ruleKey: r.rule_key });
      } else {
        blocks.push({ kind: 'paragraph', html: rendered, ruleKey: r.rule_key });
      }
    }
    if (blocks.length > 0) {
      out.push({ id: sec.id, titleEn: sec.title_en ?? sec.id, blocks });
    }
  }

  return {
    letterNo,
    date: formatDate(entryDate),
    dayN,
    sections: out,
    warnings: scope.warnings,
  };
}
