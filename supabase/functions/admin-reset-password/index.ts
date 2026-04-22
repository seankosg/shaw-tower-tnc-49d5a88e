import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_PASSWORD = 'Shaw@2026!';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: { user: caller }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !caller) return json({ error: 'Unauthorized' }, 401);
    const callerId = caller.id;

    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Admin role required' }, 403);

    const body = (await req.json()) as { user_id: string };
    if (!body.user_id) return json({ error: 'user_id required' }, 400);

    const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(body.user_id);
    if (targetErr || !targetUser?.user) return json({ error: targetErr?.message ?? 'Target user not found' }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(body.user_id, {
      password: DEFAULT_PASSWORD,
    });
    if (updErr) return json({ error: updErr.message }, 400);

    const { error: profErr } = await admin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('user_id', body.user_id);
    if (profErr) return json({ error: profErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
