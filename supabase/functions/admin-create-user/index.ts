import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FAKE_EMAIL_DOMAIN = 'shaw.local';
const DEFAULT_PASSWORD = 'SHAW00';

interface Body {
  login_id: string;
  name: string;
  user_type: 'subcontractor' | 'hdec' | 'pm_pd' | 'admin';
  role: 'guest' | 'super_guest' | 'user' | 'senior_user' | 'superuser' | 'admin';
  subcontractor_name?: string | null;
  subsub_name?: string | null;
  hdec_pic_name?: string | null;
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

    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const callerId = claims.claims.sub;

    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: callerId,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'Admin role required' }, 403);

    const body = (await req.json()) as Body;
    const loginId = body.login_id?.trim().toLowerCase();
    if (!loginId || !/^[a-z0-9_]{3,32}$/.test(loginId)) {
      return json({ error: 'Invalid login_id (3-32 chars, a-z 0-9 _)' }, 400);
    }
    if (!body.name || !body.user_type || !body.role) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const email = `${loginId}@${FAKE_EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: body.name,
        login_id: loginId,
        user_type: body.user_type,
        subcontractor_name: body.subcontractor_name ?? null,
        subsub_name: body.subsub_name ?? null,
        hdec_pic_name: body.hdec_pic_name ?? null,
        must_change_password: true,
      },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Create failed' }, 400);
    }

    const newUserId = created.user.id;

    const { error: roleErr } = await admin
      .from('user_roles')
      .insert({ user_id: newUserId, role: body.role });
    if (roleErr) {
      // rollback auth user
      await admin.auth.admin.deleteUser(newUserId);
      return json({ error: roleErr.message }, 400);
    }

    return json({ ok: true, user_id: newUserId, login_id: loginId });
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
