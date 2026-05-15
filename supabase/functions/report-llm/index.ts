import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { markdown, model, systemPrompt } = await req.json();
    if (typeof markdown !== 'string' || !markdown.trim()) {
      return new Response(JSON.stringify({ error: 'markdown is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const sys = (typeof systemPrompt === 'string' && systemPrompt.trim())
      ? systemPrompt
      : "You are a senior construction project status report writer. Convert the provided structured Markdown data into an executive-style status report in English. Terminology rules: refer to T1 as 'Pre-Test', T2 as 'Actual Test', and R2 as the final 'Test Report' stage (do not use the word 'Submission' for R2). Always write 'Project Completion' or 'the Completion' in full — never abbreviate to 'PC'. Spell 'ABD' as 'As Built Drawing'. For each module, first describe the Current Status (actuals to date, gaps versus plan, key risks), then transition naturally into the Plan (required pace and milestone targets toward the Completion) so the narrative flows from where things stand to what must happen next. Use clear section headings and concise bullet points. Do not invent numbers — only use values present in the input.";

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'google/gemini-3-flash-preview',
        stream: true,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: 'Here is the structured project status data:\n\n' + markdown },
        ],
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again shortly.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: 'Lovable AI credits exhausted. Add credits in workspace settings.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const t = await resp.text();
      console.error('AI gateway error', resp.status, t);
      return new Response(JSON.stringify({ error: 'AI gateway error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('report-llm error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
