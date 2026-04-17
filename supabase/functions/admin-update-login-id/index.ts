import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FAKE_EMAIL_DOMAIN = 'shaw.local';

interface Body {
  user_id: string;
  new_login_id: string;
}

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

    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const callerId = claims.claims.sub;

    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Admin role required' }, 403);

    const body = (await req.json()) as Body;
    const newLoginId = body.new_login_id?.trim().toLowerCase();
    if (!body.user_id || !newLoginId) return json({ error: 'Missing fields' }, 400);
    if (!/^[a-z0-9_]{3,32}$/.test(newLoginId)) {
      return json({ error: 'Invalid login_id (3-32 chars, a-z 0-9 _)' }, 400);
    }

    // duplicate check
    const { data: dup } = await admin.from('profiles')
      .select('id').eq('login_id', newLoginId).neq('user_id', body.user_id).maybeSingle();
    if (dup) return json({ error: 'Login ID already in use' }, 409);

    const newEmail = `${newLoginId}@${FAKE_EMAIL_DOMAIN}`;
    const { error: authErr } = await admin.auth.admin.updateUserById(body.user_id, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) return json({ error: authErr.message }, 400);

    const { error: profErr } = await admin.from('profiles')
      .update({ login_id: newLoginId, email: newEmail })
      .eq('user_id', body.user_id);
    if (profErr) return json({ error: profErr.message }, 400);

    return json({ ok: true, login_id: newLoginId });
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
