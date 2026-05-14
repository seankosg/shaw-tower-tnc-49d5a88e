// Photo OCR for WhatsApp screenshots — extracts (issue_no + caption) groups via Lovable AI Vision.
// The image is held only in memory and never persisted.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OcrGroup {
  issue_no: string;
  caption_raw: string;
  sender: string | null;
  timestamp_text: string | null;
  confidence: number;
  caption_y_normalized: number | null;
  caption_y_top: number | null;
  caption_y_bottom: number | null;
  notes?: string | null;
}
interface OcrRejected { reason: string; y_range?: [number, number] }

const SYSTEM_PROMPT = `You analyze WhatsApp chat screenshots from a construction site channel where a field engineer (often "Kumar(mep)" or similar mep/elec/mech staff) sends photo groups followed by a numeric caption that is the Issue Number for that defect.

Rules:
- Each "group" = a sender header (e.g. "Kumar(mep)") + 1 or more photos (sometimes a 2x2 collage with "+N" overlay) + a numeric caption (1–5 digits) shown directly below the photos + a timestamp like "PM 2:42" / "AM 10:35" on the right.
- Return ONE entry per group via the extract_groups tool.
- IMPORTANT: Return groups in strict TOP-TO-BOTTOM visual order as they appear on the screenshot.
- If a caption is "Defect 2221 - Light panel..." style, extract the leading number (2221).
- Confidence: 1.0 = caption is sharp digital text; 0.7–0.9 = readable; <0.7 = blurry / partially occluded / ambiguous (still include so a human can review).
- For EACH group, return the bounding box of the NUMERIC CAPTION TEXT itself (not the photos, not the header) using normalized 0..1 coordinates where 0 = top edge, 1 = bottom edge of the FULL screenshot:
  - caption_y_top = top edge of the digits
  - caption_y_bottom = bottom edge of the digits
  - caption_y_normalized = vertical center of the digits (must equal (top+bottom)/2)
  Estimate these as tightly and accurately as you can — they are used to crop the photos that sit ABOVE the caption.
- Reply previews (small inline quoted message at the top of a bubble), forwarded link cards, system messages, and groups from senders other than mep/elec/mech field staff must go into rejected_blocks instead of groups.
- If the screenshot is NOT a WhatsApp chat, return groups=[] and explain in rejected_blocks with reason "not_whatsapp".`;

const EXTRACT_TOOL = {
  type: 'function',
  function: {
    name: 'extract_groups',
    description: 'Return every per-group extraction from the WhatsApp screenshot.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              issue_no: { type: 'string', description: 'Numeric only, leading zeros stripped.' },
              caption_raw: { type: 'string' },
              sender: { type: 'string' },
              timestamp_text: { type: 'string' },
              confidence: { type: 'number' },
              caption_y_normalized: { type: 'number', description: 'Vertical center (0..1) of the numeric caption text.' },
              caption_y_top: { type: 'number', description: 'Top edge (0..1) of the numeric caption text.' },
              caption_y_bottom: { type: 'number', description: 'Bottom edge (0..1) of the numeric caption text.' },
              notes: { type: 'string' },
            },
            required: ['issue_no', 'caption_raw', 'confidence'],
          },
        },
        rejected_blocks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reason: { type: 'string' },
              y_range: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
            },
            required: ['reason'],
          },
        },
      },
      required: ['groups'],
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    // Verify JWT — caller must be authenticated.
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
    // Cap payload at 20MB (~ Edge Functions limit).
    if (imageDataUrl.length > 28_000_000) {
      return new Response(JSON.stringify({ error: 'image_too_large', detail: 'Max ~20MB' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const model: string = body?.model || 'google/gemini-2.5-pro';

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
              { type: 'text', text: 'Extract every group as instructed. Respond ONLY via the extract_groups tool call.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'function', function: { name: 'extract_groups' } },
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
      console.error('AI gateway error:', aiResp.status, text);
      return new Response(JSON.stringify({ error: 'ai_gateway_error', status: aiResp.status, detail: text.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiResp.json();
    const choice = aiJson?.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.[0];
    if (!toolCall || toolCall?.function?.name !== 'extract_groups') {
      return new Response(JSON.stringify({ error: 'no_tool_call', raw_text: choice?.content ?? null }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let parsed: { groups: OcrGroup[]; rejected_blocks?: OcrRejected[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments ?? '{}');
    } catch (e) {
      return new Response(JSON.stringify({ error: 'tool_args_unparseable', detail: String(e) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Light post-processing: strip non-digits from issue_no, drop empties, clamp confidence,
    // clamp caption_y_normalized to [0,1], and sort top-to-bottom.
    const clamp01 = (n: unknown): number | null => (typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(1, n)) : null);
    const cleanGroups: OcrGroup[] = (parsed.groups || [])
      .map((g) => {
        const digits = String(g.issue_no ?? '').replace(/\D+/g, '').replace(/^0+(\d)/, '$1');
        let yTop = clamp01((g as any).caption_y_top);
        let yBottom = clamp01((g as any).caption_y_bottom);
        let yCenter = clamp01((g as any).caption_y_normalized);
        // Derive missing fields from whichever the model returned.
        if (yTop !== null && yBottom !== null && yTop > yBottom) [yTop, yBottom] = [yBottom, yTop];
        if (yCenter === null && yTop !== null && yBottom !== null) yCenter = (yTop + yBottom) / 2;
        if ((yTop === null || yBottom === null) && yCenter !== null) {
          const halfHeight = 0.012;
          if (yTop === null) yTop = Math.max(0, yCenter - halfHeight);
          if (yBottom === null) yBottom = Math.min(1, yCenter + halfHeight);
        }
        return {
          issue_no: digits,
          caption_raw: String(g.caption_raw ?? ''),
          sender: g.sender ?? null,
          timestamp_text: g.timestamp_text ?? null,
          confidence: Math.max(0, Math.min(1, Number(g.confidence ?? 0))),
          caption_y_normalized: yCenter,
          caption_y_top: yTop,
          caption_y_bottom: yBottom,
          notes: g.notes ?? null,
        } satisfies OcrGroup;
      })
      .filter((g) => g.issue_no.length > 0)
      .sort((a, b) => {
        const ay = a.caption_y_normalized ?? Number.POSITIVE_INFINITY;
        const by = b.caption_y_normalized ?? Number.POSITIVE_INFINITY;
        return ay - by;
      });

    return new Response(JSON.stringify({
      groups: cleanGroups,
      rejected_blocks: parsed.rejected_blocks ?? [],
      model,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('defect-photo-ocr error:', e);
    return new Response(JSON.stringify({ error: 'internal_error', detail: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
