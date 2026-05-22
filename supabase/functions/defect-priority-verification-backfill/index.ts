// Backfill HDEC priority verification for existing defect_items.
//
// Re-runs the classification engine for rows where:
//   - priority = 'Cat A - Major Defect (Before SC)'
//   - closure_status IS DISTINCT FROM 'Done'
//   - status IS DISTINCT FROM 'Closed'
// and writes hdec_verification / hdec_reason in batches.
//
// Also clears (sets NULL) hdec_verification/hdec_reason for any row whose
// priority is NOT Cat A but currently has a non-null verification (Q4 policy).
//
// Auth: requires admin or superuser role (checked server-side via JWT).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CAT_A = 'Cat A - Major Defect (Before SC)';
const VERDICT_LABEL: Record<string, string> = {
  cat_a_major: 'Cat A - Major Defect (Before SC)',
  review_needed: 'Review Needed',
  cat_b_minor: 'Cat B - Minor Defect',
};

interface Rule {
  id: string;
  verdict: string;
  step: number;
  order_no: number;
  match_type: string;
  keywords: string[];
  exclude_keywords: string[] | null;
  category: string;
  explanation: string;
}

function ruleMatches(rule: Rule, hay: string): boolean {
  if (rule.exclude_keywords && rule.exclude_keywords.some((k) => k && hay.includes(k))) return false;
  if (rule.match_type === 'contains_all') {
    return rule.keywords.length > 0 && rule.keywords.every((k) => k && hay.includes(k));
  }
  if (rule.match_type === 'regex') {
    try {
      return rule.keywords.some((k) => k && new RegExp(k, 'i').test(hay));
    } catch {
      return false;
    }
  }
  if (rule.keywords.length === 0) return true;
  return rule.keywords.some((k) => k && hay.includes(k));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // Authorize: admin or superuser only
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdminRow } = await admin.rpc('is_admin_or_superuser', { _user_id: userId });
    if (!isAdminRow) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin or superuser required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional project scoping
    let projectId: string | null = null;
    try {
      const body = await req.json();
      if (body && typeof body.project_id === 'string') projectId = body.project_id;
    } catch { /* no body */ }

    // Load active rules
    const { data: ruleRows, error: ruleErr } = await admin
      .from('defect_priority_verification_rules')
      .select('*')
      .eq('is_active', true)
      .order('step', { ascending: true })
      .order('order_no', { ascending: true });
    if (ruleErr) throw ruleErr;
    const rules: Rule[] = (ruleRows ?? []).map((r: any) => ({
      id: r.id,
      verdict: r.verdict,
      step: r.step,
      order_no: r.order_no,
      match_type: r.match_type,
      keywords: Array.isArray(r.keywords) ? r.keywords.map((k: any) => String(k).toLowerCase()) : [],
      exclude_keywords: Array.isArray(r.exclude_keywords)
        ? r.exclude_keywords.map((k: any) => String(k).toLowerCase())
        : null,
      category: r.category,
      explanation: r.explanation,
    }));

    // ── CLEAR pass: priority ≠ Cat A but verification populated → null both fields
    let clearQuery = admin
      .from('defect_items')
      .update({ hdec_verification: null, hdec_reason: null })
      .neq('priority', CAT_A)
      .not('hdec_verification', 'is', null);
    if (projectId) clearQuery = clearQuery.eq('project_id', projectId);
    const { error: clearErr, count: clearedCount } = await clearQuery.select('id', { count: 'exact', head: true });
    if (clearErr) throw clearErr;

    // ── SET pass: eligible Cat A rows
    let baseQuery = admin
      .from('defect_items')
      .select('id, description, closure_status, status, hdec_verification, hdec_reason')
      .eq('priority', CAT_A)
      .eq('is_active', true);
    if (projectId) baseQuery = baseQuery.eq('project_id', projectId);
    const { data: candidates, error: candErr } = await baseQuery.limit(50000);
    if (candErr) throw candErr;

    let setCount = 0;
    let noMatchCount = 0;
    let skippedCount = 0;
    const updates: Array<{ id: string; verification: string; reason: string }> = [];

    for (const row of candidates ?? []) {
      const closure = String(row.closure_status ?? '').trim().toLowerCase();
      const status = String(row.status ?? '').trim().toLowerCase();
      if (closure === 'done' || status === 'closed') { skippedCount++; continue; }
      const hay = String(row.description ?? '').toLowerCase();
      if (!hay.trim()) { noMatchCount++; continue; }
      const matched = rules.find((r) => ruleMatches(r, hay));
      if (!matched) { noMatchCount++; continue; }
      const verification = VERDICT_LABEL[matched.verdict];
      const reason = matched.explanation;
      if (row.hdec_verification === verification && row.hdec_reason === reason) {
        skippedCount++; continue;
      }
      updates.push({ id: row.id, verification, reason });
    }

    // Apply updates in chunks of 100
    const CHUNK = 100;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      // Postgres has no native bulk-update-with-different-values via PostgREST;
      // do per-row but parallelized in the chunk.
      const results = await Promise.allSettled(
        slice.map((u) =>
          admin.from('defect_items')
            .update({ hdec_verification: u.verification, hdec_reason: u.reason })
            .eq('id', u.id),
        ),
      );
      setCount += results.filter((r) => r.status === 'fulfilled').length;
    }

    return new Response(JSON.stringify({
      ok: true,
      project_id: projectId,
      cleared: clearedCount ?? 0,
      eligible_scanned: candidates?.length ?? 0,
      set: setCount,
      no_match: noMatchCount,
      skipped: skippedCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
