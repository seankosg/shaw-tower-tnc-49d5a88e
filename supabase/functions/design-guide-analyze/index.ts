import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const InputSchema = z.object({
  oldYaml: z.string(),
  newYaml: z.string(),
});

const AnalysisSchema = z.object({
  summaryKo: z.string(),
  colorTokens: z.record(z.string()),
  fontTokens: z
    .object({
      body: z.string().optional(),
      mono: z.string().optional(),
    })
    .optional(),
  structuralChanges: z.array(z.string()),
  codeSuggestion: z.string().optional(),
});

const SYSTEM_PROMPT = `You are a design system analyst. Compare two YAML design guides and return a JSON object only, no markdown.
Schema:
{
  "summaryKo": string,           // 2-3 sentence Korean summary
  "colorTokens": Record<string, string>,  // changed hex values only (6-digit hex without #)
  "fontTokens": {                // only if changed
    "body"?: string,
    "mono"?: string
  },
  "structuralChanges": string[], // list of non-token changes
  "codeSuggestion"?: string      // TypeScript snippet if needed
}
Return JSON only. No code fences. No explanation text.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth: admin only
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

    // Validate input
    const body = await req.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { oldYaml, newYaml } = parsed.data;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Anthropic
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `OLD YAML:\n\`\`\`yaml\n${oldYaml}\n\`\`\`\n\nNEW YAML:\n\`\`\`yaml\n${newYaml}\n\`\`\``,
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error('[design-guide-analyze] Anthropic error:', anthropicResp.status, errText);
      return new Response(
        JSON.stringify({ error: 'Anthropic API error', status: anthropicResp.status, details: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const anthropicData = await anthropicResp.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? '';

    // Strip code fences if present
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Claude returned invalid JSON', raw: rawText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const validated = AnalysisSchema.safeParse(parsedJson);
    if (!validated.success) {
      return new Response(
        JSON.stringify({
          error: 'Analysis schema validation failed',
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
    console.error('[design-guide-analyze] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
