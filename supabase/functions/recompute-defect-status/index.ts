// Daily defect status recomputation. Designed to be invoked via pg_cron.
// Recomputes completion_status and closure_status for all active defects using today as asOf.
// Only updates rows where status actually changed and writes change_log entries.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type StatusValue = 'Planned' | 'Delay' | 'Done' | 'WIP';

interface DefectRow {
  id: string;
  issue_no: string;
  planned_start_date: string | null;
  planned_completion_date: string | null;
  planned_closure_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  actual_closure_date: string | null;
  planned_progress_pct: number | null;
  actual_progress_pct: number | null;
  completion_status: string | null;
  closure_status: string | null;
}

function computeCompletion(d: DefectRow, asOf: string): StatusValue {
  const actualPct = Number(d.actual_progress_pct ?? 0);
  if (d.actual_completion_date || actualPct >= 100) return 'Done';
  if (d.planned_start_date && asOf < d.planned_start_date) return 'Planned';
  const plannedPct = Number(d.planned_progress_pct ?? 0);
  if (actualPct < plannedPct) return 'Delay';
  if (d.planned_completion_date && d.planned_completion_date < asOf && !d.actual_completion_date) return 'Delay';
  if (actualPct > 0) return 'WIP';
  return 'Planned';
}

function computeClosure(d: DefectRow, asOf: string, completion: StatusValue): StatusValue {
  if (d.actual_closure_date) return 'Done';
  if (d.planned_closure_date && d.planned_closure_date < asOf) return 'Delay';
  if (completion === 'Done' && !d.actual_closure_date) return 'WIP';
  return 'Planned';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const asOf = new Date().toISOString().slice(0, 10);
  let updated = 0;
  let scanned = 0;
  let page = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('defect_items')
      .select('id, issue_no, planned_start_date, planned_completion_date, planned_closure_date, actual_start_date, actual_completion_date, actual_closure_date, planned_progress_pct, actual_progress_pct, completion_status, closure_status')
      .eq('is_active', true)
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!data || data.length === 0) break;

    for (const row of data as DefectRow[]) {
      scanned++;
      const newCompletion = computeCompletion(row, asOf);
      const newClosure = computeClosure(row, asOf, newCompletion);
      const completionChanged = (row.completion_status ?? null) !== newCompletion;
      const closureChanged = (row.closure_status ?? null) !== newClosure;
      if (!completionChanged && !closureChanged) continue;

      const upd: Record<string, unknown> = {};
      if (completionChanged) upd.completion_status = newCompletion;
      if (closureChanged) upd.closure_status = newClosure;
      const { error: updErr } = await supabase.from('defect_items').update(upd).eq('id', row.id);
      if (updErr) continue;

      const logs: Record<string, unknown>[] = [];
      if (completionChanged) logs.push({ defect_id: row.id, changed_field: 'completion_status', old_value: row.completion_status ?? '', new_value: newCompletion, change_source: 'cron_recompute' });
      if (closureChanged) logs.push({ defect_id: row.id, changed_field: 'closure_status', old_value: row.closure_status ?? '', new_value: newClosure, change_source: 'cron_recompute' });
      if (logs.length > 0) await supabase.from('defect_change_log').insert(logs);
      updated++;
    }

    if (data.length < PAGE) break;
    page++;
  }

  return new Response(
    JSON.stringify({ asOf, scanned, updated }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
