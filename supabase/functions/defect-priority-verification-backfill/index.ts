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

    // NOTE: defect_items has a BEFORE UPDATE trigger that calls auth.uid().
    // Service-role calls have NULL uid → rejected. Use the admin user's JWT
    // client for UPDATE so auth.uid() resolves to an admin/superuser.
    // We still use service-role for the SELECT scans (no row-cap concerns).

    const CHUNK = 100;

    // Helper: paginate to bypass PostgREST max-rows cap
    async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
      const PAGE = 1000;
      const out: T[] = [];
      for (let offset = 0; offset < 50000; offset += PAGE) {
        const { data, error } = await build(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        out.push(...(data as T[]));
        if (data.length < PAGE) break;
      }
      return out;
    }

    // ── CLEAR pass: priority ≠ Cat A but verification populated
    const clearRows = await fetchAll<{ id: string }>((from, to) => {
      let q = admin.from('defect_items').select('id')
        .neq('priority', CAT_A)
        .not('hdec_verification', 'is', null)
        .range(from, to);
      if (projectId) q = q.eq('project_id', projectId);
      return q;
    });
    let clearedCount = 0;
    const clearErrors: string[] = [];
    for (let i = 0; i < clearRows.length; i += CHUNK) {
      const slice = clearRows.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        slice.map((r) =>
          userClient.from('defect_items')
            .update({ hdec_verification: null, hdec_reason: null })
            .eq('id', r.id)
            .select('id'),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const v: any = r.value;
          if (v?.error) clearErrors.push(v.error.message);
          else if ((v?.data?.length ?? 0) > 0) clearedCount++;
        } else {
          clearErrors.push(String((r as PromiseRejectedResult).reason));
        }
      }
    }

    // ── SET pass: eligible Cat A rows
    const candidates = await fetchAll<any>((from, to) => {
      let q = admin.from('defect_items')
        .select('id, description, closure_status, status, hdec_verification, hdec_reason')
        .eq('priority', CAT_A)
        .eq('is_active', true)
        .range(from, to);
      if (projectId) q = q.eq('project_id', projectId);
      return q;
    });


    let setCount = 0;
    let noMatchCount = 0;
    let skippedCount = 0;
    const setErrors: string[] = [];
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

    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        slice.map((u) =>
          userClient.from('defect_items')
            .update({ hdec_verification: u.verification, hdec_reason: u.reason })
            .eq('id', u.id)
            .select('id'),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const v: any = r.value;
          if (v?.error) setErrors.push(v.error.message);
          else if ((v?.data?.length ?? 0) > 0) setCount++;
          else skippedCount++;
        } else {
          setErrors.push(String((r as PromiseRejectedResult).reason));
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      project_id: projectId,
      cleared: clearedCount,
      eligible_scanned: candidates?.length ?? 0,
      set: setCount,
      no_match: noMatchCount,
      skipped: skippedCount,
      clear_errors_sample: clearErrors.slice(0, 3),
      set_errors_sample: setErrors.slice(0, 3),
      error_total: clearErrors.length + setErrors.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
