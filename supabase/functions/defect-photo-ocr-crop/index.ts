// Pass 2 of Photo OCR — receives ONE cropped image (a single WhatsApp photo group)
// and returns the single issue_no caption it contains.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are given ONE cropped section of a WhatsApp chat screenshot containing a single photo (or photo collage) followed by a numeric caption (1–5 digits) that is the Issue Number.

Return exactly ONE entry via the extract_one tool:
- issue_no: the numeric caption (digits only, leading zeros stripped). If a caption is "Defect 2221 - ..." style, extract the leading number (2221).
- caption_raw: the full caption text as shown.
- confidence: 1.0 = sharp digital text; 0.7–0.9 = readable; <0.7 = blurry / partial / ambiguous.

If you cannot find a numeric caption at all, return issue_no="" with confidence=0.`;

const EXTRACT_ONE_TOOL = {
  type: 'function',
  function: {
    name: 'extract_one',
    description: 'Return the single numeric caption visible in this cropped photo group.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        issue_no: { type: 'string', description: 'Numeric only, leading zeros stripped. Empty string if none found.' },
        caption_raw: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['issue_no', 'confidence'],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) throw new Error('LOVABLE_API_KEY not configured');

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => null);
    const imageDataUrl: string | undefined = body?.image_data_url;
    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
      return new Response(JSON.stringify({ error: 'invalid_image' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (imageDataUrl.length > 12_000_000) {
      return new Response(JSON.stringify({ error: 'image_too_large', detail: 'Crop should be < 8MB' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Pass 2 favors speed/cost since the crop is small and contains one caption.
    const model: string = body?.model || 'google/gemini-2.5-flash';

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read the single numeric caption in this crop. Respond ONLY via the extract_one tool call.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools: [EXTRACT_ONE_TOOL],
        tool_choice: { type: 'function', function: { name: 'extract_one' } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: 'rate_limited', detail: 'Lovable AI rate limit hit. Try again in a moment.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: 'payment_required', detail: 'Lovable AI workspace credits exhausted.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error('AI gateway error (crop):', aiResp.status, text);
      return new Response(JSON.stringify({ error: 'ai_gateway_error', status: aiResp.status, detail: text.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiResp.json();
    const choice = aiJson?.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.[0];
    if (!toolCall || toolCall?.function?.name !== 'extract_one') {
      return new Response(JSON.stringify({ error: 'no_tool_call', raw_text: choice?.content ?? null }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let parsed: { issue_no: string; caption_raw?: string; confidence: number };
    try {
      parsed = JSON.parse(toolCall.function.arguments ?? '{}');
    } catch (e) {
      return new Response(JSON.stringify({ error: 'tool_args_unparseable', detail: String(e) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const digits = String(parsed.issue_no ?? '').replace(/\D+/g, '').replace(/^0+(\d)/, '$1');
    return new Response(JSON.stringify({
      issue_no: digits,
      caption_raw: String(parsed.caption_raw ?? ''),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
      model,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('defect-photo-ocr-crop error:', e);
    return new Response(JSON.stringify({ error: 'internal_error', detail: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
