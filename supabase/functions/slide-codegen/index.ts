import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const InputSchema = z.object({
  title: z.string().min(1).max(200),
  position: z.number().int().min(1).max(50),
  dataSources: z.array(z.enum(['tnc', 'defect', 'docs', 'punch'])).min(1),
  description: z.string().min(5).max(4000),
  // existing slide registry keys (string list) to avoid collisions
  existingKeys: z.array(z.string()).max(200).optional(),
});

// ─── SlideSpec schema (mirrors src/lib/custom-slide-spec.ts) ─────────
const BaseBlock = z.object({
  x: z.number().optional(), y: z.number().optional(),
  w: z.number().optional(), h: z.number().optional(),
});
const KpiCardBlock = BaseBlock.extend({
  type: z.literal('kpi-card'),
  title: z.string(), valuePath: z.string(),
  unit: z.string().optional(), decimals: z.number().int().min(0).max(4).optional(),
  barPath: z.string().optional(), subtitle: z.string().optional(), color: z.string().optional(),
});
const BarRowBlock = BaseBlock.extend({
  type: z.literal('bar-row'),
  label: z.string(), pctPath: z.string(), color: z.string().optional(),
});
const MetricGridBlock = BaseBlock.extend({
  type: z.literal('metric-grid'),
  columns: z.number().int().min(1).max(4).optional(),
  items: z.array(z.object({
    label: z.string(), valuePath: z.string(),
    unit: z.string().optional(), decimals: z.number().int().min(0).max(4).optional(),
    color: z.string().optional(),
  })).min(1).max(8),
});
const TextBlock = BaseBlock.extend({
  type: z.literal('text-block'),
  text: z.string(), fontSize: z.number().optional(),
  bold: z.boolean().optional(), color: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});
const BulletListBlock = BaseBlock.extend({
  type: z.literal('bullet-list'),
  title: z.string().optional(), items: z.array(z.string()).min(1).max(12),
});
const SimpleTableBlock = BaseBlock.extend({
  type: z.literal('simple-table'),
  title: z.string().optional(), headers: z.array(z.string()).min(1).max(8),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
  rowsPath: z.string().optional(), columnPaths: z.array(z.string()).optional(),
  colWidths: z.array(z.number()).optional(),
});
const ChartSeriesRef = z.object({
  name: z.string(), valuesPath: z.string(),
  valueField: z.string().optional(), color: z.string().optional(),
});
const BarChartBlock = BaseBlock.extend({
  type: z.literal('bar-chart'), title: z.string().optional(),
  orientation: z.enum(['col', 'bar']).optional(),
  labelsPath: z.string(), labelField: z.string().optional(),
  series: z.array(ChartSeriesRef).min(1).max(4),
});
const LineChartBlock = BaseBlock.extend({
  type: z.literal('line-chart'), title: z.string().optional(),
  labelsPath: z.string(), labelField: z.string().optional(),
  series: z.array(ChartSeriesRef).min(1).max(4),
});
const PieChartBlock = BaseBlock.extend({
  type: z.literal('pie-chart'), title: z.string().optional(),
  doughnut: z.boolean().optional(),
  labelsPath: z.string(), labelField: z.string().optional(),
  valuesPath: z.string(), valueField: z.string().optional(),
});
const StackedBarBlock = BaseBlock.extend({
  type: z.literal('stacked-bar'), title: z.string().optional(),
  orientation: z.enum(['col', 'bar']).optional(),
  labelsPath: z.string(), labelField: z.string().optional(),
  series: z.array(ChartSeriesRef).min(2).max(6),
});
const BlockSchema = z.discriminatedUnion('type', [
  KpiCardBlock, BarRowBlock, MetricGridBlock, TextBlock, BulletListBlock,
  SimpleTableBlock, BarChartBlock, LineChartBlock, PieChartBlock, StackedBarBlock,
]);
const SlideSpecSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string(),
  subtitle: z.string().optional(),
  layout: z.enum(['single', 'two-column', 'three-column', 'free']).default('single'),
  blocks: z.array(BlockSchema).min(1).max(12),
});

const ResultSchema = z.object({
  spec: SlideSpecSchema,
  suggestedKey: z.string().regex(/^[a-z][a-z0-9_]*$/).min(3).max(60),
  suggestedLabel: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
});

const DATA_PATHS = `
Single values (numbers):
- tnc.total, tnc.preTest.pct, tnc.preTest.done, tnc.official.pct, tnc.official.done,
  tnc.testReport.pct, tnc.testReport.done, tnc.daysToPC
- defect.total, defect.completion.pct, defect.completion.done, defect.closure.pct, defect.closure.done
- docs.abd.total, docs.omm.total, docs.warranty.total, docs.sparePart.total
- punch.total, punch.completion.pct, punch.completion.done

Arrays (for charts/tables; use with labelsPath/valuesPath/rowsPath + field names):
- tnc.scurve            (items have: weekLabel, plannedPct, actualPct)
- defect.scurve         (items have: weekLabel, plannedPct, actualPct)
- defect.actionPlanTriggers (items have: status, name, ...)
- punch.latestItems     (items have: itemNo, description, status, completionDate)
- punch.completionDateBreakdown.monthlyBeyondSc  (items have: month, count)
- tnc.actionPlanTriggers
`.trim();

const BLOCK_CATALOG = `
Available block types:
- kpi-card     : { type, title, valuePath, unit?, decimals?, barPath?, subtitle?, color? }
- bar-row      : { type, label, pctPath, color? }
- metric-grid  : { type, columns?, items:[{label, valuePath, unit?, decimals?, color?}] }
- text-block   : { type, text, fontSize?, bold?, color?, align? }
- bullet-list  : { type, title?, items:[string] }
- simple-table : { type, title?, headers:[string], rows:[[...]] OR (rowsPath + columnPaths:[string]), colWidths? }
- bar-chart    : { type, title?, orientation?('col'|'bar'), labelsPath, labelField?, series:[{name, valuesPath, valueField?, color?}] }
- line-chart   : { type, title?, labelsPath, labelField?, series:[{name, valuesPath, valueField?, color?}] }
- pie-chart    : { type, title?, doughnut?, labelsPath, labelField?, valuesPath, valueField? }
- stacked-bar  : { type, title?, orientation?, labelsPath, labelField?, series:[2..6] }

Coordinates (x,y,w,h in inches) are OPTIONAL — omit to auto-layout.
Slide is 13.33 x 7.5 inches. Body area roughly x=0.5..12.83, y=1.0..6.9.
`.trim();

const SYSTEM_PROMPT = `You design PowerPoint slides as STRUCTURED JSON specs (NOT code).

Output a single SlideSpec object that the renderer will turn into a real PPT slide.

${BLOCK_CATALOG}

Data binding — every *Path field is a dotted path into the KPI bag:
${DATA_PATHS}

Rules:
1. Pick 2-6 blocks that clearly answer the user's description.
2. Prefer concise visuals: KPI cards for single numbers, charts for time series, tables for itemised lists.
3. Use layout 'single' for stacked sections, 'two-column' or 'three-column' for side-by-side comparison.
4. Omit explicit x/y/w/h unless you need precise positioning — auto-layout handles the rest.
5. suggestedKey: short snake_case, prefix with "custom_" (e.g. "custom_tnc_vs_defect").
6. suggestedLabel: short Human Readable English (e.g. "T&C vs Defect Progress").
7. summary: 2-3 Korean sentences explaining what the slide shows and which data it uses.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "spec": { "version": 1, "title": "...", "subtitle": "...", "layout": "single", "blocks": [ ... ] },
  "suggestedKey": "custom_xxx",
  "suggestedLabel": "Human Readable Label",
  "summary": "한국어 요약 2~3문장"
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;
    // Allow D.Super User, Superuser, or Admin to generate slides.
    const [{ data: isAdmin }, { data: isSuper }, { data: isDSuper }] = await Promise.all([
      supabase.rpc('has_role', { _user_id: userId, _role: 'admin' }),
      supabase.rpc('has_role', { _user_id: userId, _role: 'superuser' }),
      supabase.rpc('has_role', { _user_id: userId, _role: 'd_superuser' }),
    ]);
    if (!isAdmin && !isSuper && !isDSuper) {
      return new Response(JSON.stringify({ error: 'Forbidden: D.Super User or higher required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { title, dataSources, description, existingKeys } = parsed.data;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = `Slide title: ${title}
Data sources to use: ${dataSources.join(', ')}
${existingKeys && existingKeys.length ? `Existing slide keys (avoid collisions):\n${existingKeys.join(', ')}` : ''}

User description:
${description}

Generate the SlideSpec JSON now.`;

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error('[slide-codegen] Anthropic error:', anthropicResp.status, errText);
      return new Response(
        JSON.stringify({ error: 'AI API error', status: anthropicResp.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicResp.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? '';
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: 'AI가 잘못된 JSON을 반환했습니다. 다시 시도해 주세요.', raw: rawText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const validated = ResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      return new Response(
        JSON.stringify({
          error: '생성된 spec이 스키마와 맞지 않습니다. 다시 시도해 주세요.',
          details: validated.error.flatten(),
          raw: rawText,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Avoid key collisions
    if (existingKeys && existingKeys.includes(validated.data.suggestedKey)) {
      validated.data.suggestedKey = `${validated.data.suggestedKey}_${Date.now().toString(36)}`;
    }

    return new Response(JSON.stringify(validated.data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[slide-codegen] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
