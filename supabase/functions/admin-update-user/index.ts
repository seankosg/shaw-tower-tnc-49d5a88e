import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  user_id: string;
  name?: string;
  user_type?: 'subcontractor' | 'subsub' | 'hdec' | 'pm_pd' | 'admin' | 'guest';
  subcontractor_name?: string | null;
  subsub_name?: string | null;
  hdec_pic_name?: string | null;
  hdec_eng_name?: string | null;
  team?: 'Mech' | 'Elec' | 'Arch' | 'Supp' | null;
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

    const { data: { user: caller }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !caller) return json({ error: 'Unauthorized' }, 401);
    const callerId = caller.id;

    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: callerId,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'Admin role required' }, 403);

    const body = (await req.json()) as Body;
    if (!body.user_id) return json({ error: 'user_id required' }, 400);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.user_type !== undefined) updates.user_type = body.user_type;
    if (body.subcontractor_name !== undefined) updates.subcontractor_name = body.subcontractor_name;
    if (body.subsub_name !== undefined) updates.subsub_name = body.subsub_name;
    if (body.hdec_pic_name !== undefined) updates.hdec_pic_name = body.hdec_pic_name;
    if (body.hdec_eng_name !== undefined) updates.hdec_eng_name = body.hdec_eng_name;
    if (body.team !== undefined) updates.team = body.team;

    if (Object.keys(updates).length === 0) return json({ error: 'No changes' }, 400);

    const { error: updErr } = await admin
      .from('profiles')
      .update(updates)
      .eq('user_id', body.user_id);

    if (updErr) return json({ error: updErr.message }, 400);

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
