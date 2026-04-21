import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  user_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authHeader.replace('Bearer ', '');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: { user: caller }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !caller) return json({ error: 'Unauthorized' }, 401);
    const callerId = caller.id;

    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: callerId,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'Admin role required' }, 403);

    const body = (await req.json()) as Body;
    if (!body.user_id) return json({ error: 'user_id required' }, 400);
    if (body.user_id === callerId) return json({ error: 'Cannot delete yourself' }, 400);

    // Delete user_roles + profiles first (FK-safe)
    await admin.from('user_roles').delete().eq('user_id', body.user_id);
    await admin.from('user_system_permissions').delete().eq('user_id', body.user_id);
    await admin.from('profiles').delete().eq('user_id', body.user_id);

    // Delete auth user (this also cascades sessions)
    const { error: delErr } = await admin.auth.admin.deleteUser(body.user_id);
    if (delErr) return json({ error: delErr.message }, 400);

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
