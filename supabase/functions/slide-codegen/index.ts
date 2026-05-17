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
  slideRegistry: z.string().max(8000),
});

const ResultSchema = z.object({
  functionCode: z.string().min(20),
  suggestedKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
  suggestedLabel: z.string().min(1).max(120),
});

const SYSTEM_PROMPT = `You are a TypeScript developer working on a pptxgenjs slide builder.
Generate ONE TypeScript function that builds a single PowerPoint slide following these rules:

1. Function signature:
   function buildSlide_[KEY](ctx: SlideBuildCtx): void
   where SlideBuildCtx = { pptx, data, C, tFace, tFaceMono, opts }

2. Design tokens are in ctx.C object:
   C.bgBody, C.cardBody, C.cardBorder, C.cardAlert,
   C.textPrimary, C.textSecondary, C.textMuted,
   C.stagePreTest, C.stageOfficial, C.stageTestReport,
   C.green, C.amber, C.magentaBright, C.cyan

3. Always start with:
   const s = ctx.pptx.addSlide();
   s.background = { color: ctx.C.bgBody };

4. Use ctx.tFace for body font, ctx.tFaceMono for mono font.

5. Always end with drawFooter(ctx.pptx, s, 'XX') where XX is the slide number.

6. Access data via ctx.data (ReportData type):
   ctx.data.tnc, ctx.data.defect, ctx.data.docs, ctx.data.punch

7. Layout is LAYOUT_WIDE (13.33 x 7.5 inches). Keep within bounds.

Respond with ONLY a JSON object (no markdown, no code fences) matching:
{
  "functionCode": "function buildSlide_xxx(ctx: SlideBuildCtx): void { ... }",
  "suggestedKey": "snake_case_key",
  "suggestedLabel": "Human Readable Label"
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
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin_or_superuser', {
      _user_id: userId,
    });
    if (rpcError || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
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
    const { title, position, dataSources, description, slideRegistry } = parsed.data;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = `Title: ${title}
Insert after slide number: ${position}
Data sources to use: ${dataSources.join(', ')}

Description:
${description}

Existing SLIDE_REGISTRY keys (avoid collisions):
${slideRegistry}`;

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
        JSON.stringify({ error: 'Anthropic API error', status: anthropicResp.status, details: errText }),
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
        JSON.stringify({ error: 'Claude returned invalid JSON', raw: rawText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const validated = ResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      return new Response(
        JSON.stringify({
          error: 'Result schema validation failed',
          details: validated.error.flatten(),
          raw: rawText,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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
