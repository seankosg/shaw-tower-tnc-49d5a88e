import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const InputSchema = z.object({
  fileContent: z.string().min(1).max(500_000),
  instruction: z.string().min(1).max(8000),
  fileType: z.enum(['ts', 'yaml']),
});

const EDIT_SYSTEM_PROMPT =
  'You are a code editor. Modify the provided file exactly as instructed. Return only the complete modified file content, no explanation, no markdown.';

const SUMMARY_SYSTEM_PROMPT =
  'You summarize code diffs in Korean. Given the user instruction and the modified file, write 1-2 concise Korean sentences describing what changed. Return plain text only.';

function stripFence(text: string, lang: string): string {
  let s = text.trim();
  const fence = new RegExp(`^\\\`\\\`\\\`(?:${lang}|typescript|yml)?\\s*`, 'i');
  s = s.replace(fence, '').replace(/\s*```$/i, '');
  return s;
}

async function callAnthropic(apiKey: string, system: string, userMsg: string, maxTokens: number) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${t.slice(0, 500)}`);
  }
  const data = await resp.json();
  return (data?.content?.[0]?.text ?? '') as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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
    const { fileContent, instruction, fileType } = parsed.data;

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const langTag = fileType === 'ts' ? 'typescript' : 'yaml';
    const userMsg = `Instruction:\n${instruction}\n\nCurrent file (${fileType}):\n\`\`\`${langTag}\n${fileContent}\n\`\`\``;

    const rawModified = await callAnthropic(apiKey, EDIT_SYSTEM_PROMPT, userMsg, 4000);
    const modifiedContent = stripFence(rawModified, langTag);

    let changeSummary = '';
    try {
      const summaryMsg = `Instruction:\n${instruction}\n\nModified file (${fileType}):\n\`\`\`${langTag}\n${modifiedContent.slice(0, 8000)}\n\`\`\``;
      changeSummary = (await callAnthropic(apiKey, SUMMARY_SYSTEM_PROMPT, summaryMsg, 300)).trim();
    } catch (e) {
      console.error('[code-editor] summary failed:', e);
      changeSummary = '요약 생성에 실패했습니다. 변경 내용을 직접 검토해 주세요.';
    }

    return new Response(JSON.stringify({ modifiedContent, changeSummary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[code-editor] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
