import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─────────────────────────────────────────
// Input schemas
//
// 1) AUTO mode (preferred for large TS files):
//      { fileName, instruction }
//    Edge function downloads active version, identifies the target function
//    via Claude, edits just that function, splices it back, returns full file.
//
// 2) FILE mode (yaml or small files):
//      { fileContent, instruction, fileType }
// ─────────────────────────────────────────
const AutoModeSchema = z.object({
  fileName: z.string().min(1).max(200),
  instruction: z.string().min(1).max(8000),
});
const FileModeSchema = z.object({
  fileContent: z.string().min(1).max(500_000),
  instruction: z.string().min(1).max(8000),
  fileType: z.enum(['ts', 'yaml']),
});

// ─────────────────────────────────────────
// Top-level TS function parser (Deno-compatible port of src/lib/code-editor.ts).
// Comment-, string-, and template-literal aware.
// Recognizes:
//   [export] [async] function NAME(...) { ... }
//   [export] const NAME = [async] (...) [: Type] => { ... }
//   [export] const NAME = [async] function (...) { ... }
// ─────────────────────────────────────────
interface FunctionRange {
  name: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  source: string;
}

function findMatchingBraceEnd(src: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      const nl = src.indexOf('\n', i + 2);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n) {
        const cc = src[i];
        if (cc === '\\') { i += 2; continue; }
        if (cc === c) { i++; break; }
        if (cc === '\n') break;
        i++;
      }
      continue;
    }
    if (c === '`') {
      i++;
      while (i < n) {
        const cc = src[i];
        if (cc === '\\') { i += 2; continue; }
        if (cc === '`') { i++; break; }
        if (cc === '$' && src[i + 1] === '{') {
          i += 2;
          let nd = 1;
          while (i < n && nd > 0) {
            const x = src[i];
            if (x === '{') nd++;
            else if (x === '}') nd--;
            if (nd > 0) i++;
          }
          if (i < n) i++;
          continue;
        }
        i++;
      }
      continue;
    }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') {
      depth--;
      i++;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return -1;
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function parseTopLevelFunctions(source: string): FunctionRange[] {
  const ranges: FunctionRange[] = [];
  const re = /^(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]|^(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?(?:function\s*\*?\s*[(<]|\([^)]*\)\s*(?::\s*[^={]+)?=>\s*\{|[A-Za-z_$][\w$]*\s*=>\s*\{)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const declStart = m.index;
    const name = m[3] || m[5];
    if (!name) continue;
    const isFunctionKw = !!m[3];
    let i = declStart;
    let braceIdx = -1;
    let parenDepth = 0;
    let angleDepth = 0;
    let typeBraceDepth = 0;
    let lastMeaningful = '';
    const n = source.length;
    while (i < n) {
      const c = source[i];
      const next = source[i + 1];
      if (c === '/' && next === '/') { const nl = source.indexOf('\n', i + 2); i = nl === -1 ? n : nl + 1; continue; }
      if (c === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; continue; }
      if (c === '"' || c === "'") {
        i++;
        while (i < n) {
          const cc = source[i];
          if (cc === '\\') { i += 2; continue; }
          if (cc === c || cc === '\n') { i++; break; }
          i++;
        }
        lastMeaningful = c;
        continue;
      }
      if (c === '`') {
        i++;
        while (i < n && source[i] !== '`') {
          if (source[i] === '\\') { i += 2; continue; }
          i++;
        }
        if (i < n) i++;
        lastMeaningful = '`';
        continue;
      }
      if (c === '{') {
        const isTypePos = parenDepth > 0 || angleDepth > 0 || typeBraceDepth > 0
          || lastMeaningful === ':' || lastMeaningful === '|' || lastMeaningful === '&'
          || lastMeaningful === ',' || lastMeaningful === '<' || lastMeaningful === '(';
        if (isTypePos) { typeBraceDepth++; lastMeaningful = '{'; i++; continue; }
        braceIdx = i; break;
      }
      if (c === '}') { if (typeBraceDepth > 0) typeBraceDepth--; lastMeaningful = '}'; i++; continue; }
      if (c === '(') { parenDepth++; lastMeaningful = '('; i++; continue; }
      if (c === ')') { parenDepth--; lastMeaningful = ')'; i++; continue; }
      if (c === '<') { angleDepth++; lastMeaningful = '<'; i++; continue; }
      if (c === '>') { angleDepth = Math.max(0, angleDepth - 1); lastMeaningful = '>'; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      lastMeaningful = c;
      i++;
    }
    if (braceIdx === -1) continue;
    const end = findMatchingBraceEnd(source, braceIdx);
    if (end === -1) continue;
    void isFunctionKw;
    ranges.push({
      name,
      start: declStart,
      end,
      startLine: lineOf(source, declStart),
      endLine: lineOf(source, end - 1),
      source: source.slice(declStart, end),
    });
    re.lastIndex = end;
  }
  return ranges;
}

// ─────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────
const IDENTIFY_SYSTEM_PROMPT =
  'You select which top-level function in a TypeScript file the user wants to modify. ' +
  'Reply with ONLY a JSON object of the form {"targetFunction":"<name>","reason":"<short reason>"}. ' +
  'The target MUST be one of the provided candidate names — never invent a name. ' +
  'No markdown, no code fences, no extra text.';

const FUNCTION_EDIT_SYSTEM_PROMPT =
  'You are a TypeScript code editor. You will receive a SINGLE function declaration and an instruction. ' +
  'Modify only this function according to the instruction. Return the complete modified function declaration, ' +
  'preserving its name, signature shape, leading export/async modifiers, and indentation. ' +
  'Do not add surrounding code, do not include any explanation, and do not wrap the output in markdown fences.';

const FILE_EDIT_SYSTEM_PROMPT =
  'You are a code editor. Modify the provided file exactly as instructed. ' +
  'Return only the complete modified file content, no explanation, no markdown.';

const SUMMARY_SYSTEM_PROMPT =
  'You summarize code diffs in Korean. Given the user instruction and the modified content, ' +
  'write 1-2 concise Korean sentences describing what changed. Return plain text only.';

function stripFence(text: string, lang: string): string {
  let s = text.trim();
  const fence = new RegExp(`^\\\`\\\`\\\`(?:${lang}|typescript|yml)?\\s*`, 'i');
  s = s.replace(fence, '').replace(/\s*```$/i, '');
  return s;
}

async function callAnthropic(apiKey: string, system: string, userMsg: string, maxTokens: number): Promise<string> {
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;
    const { data: isAdmin, error: rpcError } = await supabase.rpc('is_admin_or_superuser', { _user_id: userId });
    if (rpcError || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // ── AUTO mode: identify → extract → modify → splice ──
    const autoParsed = AutoModeSchema.safeParse(body);
    if (autoParsed.success) {
      const { fileName, instruction } = autoParsed.data;

      // 1) Download active version from storage
      const { data: ver, error: verErr } = await supabase
        .from('code_file_versions')
        .select('storage_path, id')
        .eq('file_name', fileName)
        .eq('is_active', true)
        .maybeSingle();
      if (verErr || !ver) {
        return new Response(JSON.stringify({ error: `Active version not found for ${fileName}` }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: blob, error: dlErr } = await supabase.storage.from('code-files').download(ver.storage_path);
      if (dlErr || !blob) {
        return new Response(JSON.stringify({ error: `Download failed: ${dlErr?.message ?? 'unknown'}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const fullSource = await blob.text();

      // 2) Parse functions
      const ranges = parseTopLevelFunctions(fullSource);
      if (ranges.length === 0) {
        return new Response(JSON.stringify({ error: 'No top-level functions parsed from file' }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const candidates = ranges.map(r => r.name);

      // 3) Identify target function
      const identifyMsg =
        `Instruction:\n${instruction}\n\n` +
        `Candidate functions (choose exactly one):\n${candidates.map(n => `- ${n}`).join('\n')}`;
      const idRaw = await callAnthropic(apiKey, IDENTIFY_SYSTEM_PROMPT, identifyMsg, 300);
      let targetName = '';
      let reason = '';
      try {
        const parsed = JSON.parse(stripFence(idRaw, 'json'));
        targetName = String(parsed.targetFunction ?? '');
        reason = String(parsed.reason ?? '');
      } catch {
        return new Response(JSON.stringify({
          error: 'Failed to parse identify response',
          identifyRaw: idRaw.slice(0, 500),
          availableFunctions: candidates,
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const target = ranges.find(r => r.name === targetName);
      if (!target) {
        return new Response(JSON.stringify({
          error: `Identified function "${targetName}" is not in candidates. Please specify more clearly.`,
          availableFunctions: candidates,
          identifyReason: reason,
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 4) Modify target function
      const editMsg =
        `Instruction:\n${instruction}\n\n` +
        `Function to modify (name: ${target.name}):\n` +
        `\`\`\`typescript\n${target.source}\n\`\`\``;
      const editRaw = await callAnthropic(apiKey, FUNCTION_EDIT_SYSTEM_PROMPT, editMsg, 4096);
      const newFunctionSource = stripFence(editRaw, 'typescript');
      if (!newFunctionSource.trim()) {
        return new Response(JSON.stringify({ error: 'Empty modification returned' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 5) Splice back into full file
      const modifiedContent =
        fullSource.slice(0, target.start) + newFunctionSource + fullSource.slice(target.end);

      // 6) Summary (best-effort)
      let changeSummary = '';
      try {
        const summaryMsg =
          `Instruction:\n${instruction}\n\n` +
          `Modified function (${target.name}):\n` +
          `\`\`\`typescript\n${newFunctionSource.slice(0, 8000)}\n\`\`\``;
        changeSummary = (await callAnthropic(apiKey, SUMMARY_SYSTEM_PROMPT, summaryMsg, 300)).trim();
      } catch (e) {
        console.error('[code-editor] summary failed:', e);
        changeSummary = '요약 생성에 실패했습니다. 변경 내용을 직접 검토해 주세요.';
      }

      return new Response(JSON.stringify({
        modifiedContent,
        changeSummary,
        targetFunction: target.name,
        targetRange: { startLine: target.startLine, endLine: target.endLine },
        identifyReason: reason,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── FILE mode: yaml or small ts whole-file edit ──
    const fileParsed = FileModeSchema.safeParse(body);
    if (!fileParsed.success) {
      return new Response(JSON.stringify({
        error: 'Invalid input',
        details: {
          auto_mode: autoParsed.error.flatten(),
          file_mode: fileParsed.error.flatten(),
        },
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { fileContent, instruction, fileType } = fileParsed.data;
    const langTag = fileType === 'ts' ? 'typescript' : 'yaml';
    const userMsg = `Instruction:\n${instruction}\n\nCurrent file (${fileType}):\n\`\`\`${langTag}\n${fileContent}\n\`\`\``;
    const rawModified = await callAnthropic(apiKey, FILE_EDIT_SYSTEM_PROMPT, userMsg, 8192);
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
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[code-editor] error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
