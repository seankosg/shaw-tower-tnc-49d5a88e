import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FAKE_EMAIL_DOMAIN = 'shaw.local';
const DEFAULT_PASSWORD = 'Shaw@2026!';
const STOP_WORDS = new Set([
  'co', 'ltd', 'inc', 'corp', 'corporation', 'company', 'llc',
  'group', 'eng', 'engineering', 'the', 'and',
]);

type MasterType = 'subcontractor' | 'subsub' | 'hdec_pic' | 'hdec_eng';

interface Body {
  name: string;
  master_type: MasterType;
  subcontractor_name?: string | null;
  subsub_name?: string | null;
  hdec_pic_name?: string | null;
  hdec_eng_name?: string | null;
}

function abbreviate6(name: string): string | null {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const allWords = cleaned.split(' ').filter(Boolean);
  if (allWords.length === 0) return null;

  let words = allWords.filter(w => !STOP_WORDS.has(w));
  const totalLen = words.reduce((s, w) => s + w.length, 0);
  if (words.length === 0 || totalLen < 3) words = allWords;

  let id = '';
  if (words.length === 1) {
    id = words[0].slice(0, 6);
  } else if (words.length === 2) {
    id = words[0].slice(0, 3) + words[1].slice(0, 3);
  } else {
    for (const w of words) {
      id += w.slice(0, 2);
      if (id.length >= 6) break;
    }
    id = id.slice(0, 6);
  }
  if (id.length < 6) {
    const pool = cleaned.replace(/[^a-z0-9]/g, '');
    id = (id + pool).slice(0, 6);
  }
  if (id.length < 3) return null;
  return id;
}

function picSnake(name: string): string | null {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const id = cleaned.replace(/\s+/g, '_').slice(0, 32);
  if (id.length < 3) return null;
  return id;
}

function randomFallback(prefix: 'sub' | 'pic' | 'eng'): string {
  return `${prefix}_${Math.floor(100000 + Math.random() * 900000)}`;
}

function suggestBase(name: string, type: MasterType): string {
  if (type === 'hdec_pic') {
    return picSnake(name) ?? randomFallback('pic');
  }
  if (type === 'hdec_eng') {
    return picSnake(name) ?? randomFallback('eng');
  }
  return abbreviate6(name) ?? randomFallback('sub');
}

async function loginIdTaken(admin: SupabaseClient, lid: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('id').eq('login_id', lid).maybeSingle();
  return !!data;
}

async function findExistingMasterUser(
  admin: SupabaseClient,
  body: Body,
): Promise<{ user_id: string; login_id: string } | null> {
  const userType = body.master_type === 'hdec_pic' || body.master_type === 'hdec_eng'
    ? 'hdec'
    : body.master_type === 'subsub' ? 'subsub' : 'subcontractor';

  // Case-insensitive exact match — escape PostgREST wildcards (%, _, \)
  const ciEq = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);
  let query = admin.from('profiles').select('user_id, login_id').eq('user_type', userType).limit(1);

  if (body.master_type === 'subcontractor') {
    query = query.ilike('subcontractor_name', ciEq(body.name.trim())).is('subsub_name', null);
  } else if (body.master_type === 'subsub') {
    query = query.ilike('subcontractor_name', ciEq(body.subcontractor_name ?? '')).ilike('subsub_name', ciEq(body.name.trim()));
  } else if (body.master_type === 'hdec_pic') {
    query = query.ilike('hdec_pic_name', ciEq(body.name.trim()));
  } else {
    // hdec_eng
    query = query.ilike('hdec_eng_name', ciEq(body.name.trim()));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as { user_id: string; login_id: string } | null) ?? null;
}

async function findUniqueLoginId(
  admin: SupabaseClient,
  base: string,
): Promise<string> {
  if (!(await loginIdTaken(admin, base))) return base;
  for (let n = 2; n <= 99; n++) {
    const suffix = String(n);
    const trimBase = base.length + suffix.length > 6 ? base.slice(0, 6 - suffix.length) : base;
    const candidate = `${trimBase}${suffix}`;
    if (candidate.length >= 3 && !(await loginIdTaken(admin, candidate))) return candidate;
  }
  for (let i = 0; i < 20; i++) {
    const c = `${base.slice(0, 3)}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await loginIdTaken(admin, c))) return c;
  }
  throw new Error('Unable to generate unique login_id');
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
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: { user: caller }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !caller) return json({ error: 'Unauthorized' }, 401);

    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: caller.id,
      _role: 'admin',
    });
    if (!isAdmin) return json({ error: 'Admin role required' }, 403);

    const body = (await req.json()) as Body;
    if (!body.name?.trim() || !body.master_type) {
      return json({ error: 'Missing name or master_type' }, 400);
    }

    const trimmedName = body.name.trim();
    const existing = await findExistingMasterUser(admin, {
      ...body,
      name: trimmedName,
      subcontractor_name: body.subcontractor_name?.trim() ?? null,
      subsub_name: body.subsub_name?.trim() ?? null,
      hdec_pic_name: body.hdec_pic_name?.trim() ?? null,
      hdec_eng_name: body.hdec_eng_name?.trim() ?? null,
    });
    if (existing) {
      return json({ ok: true, user_id: existing.user_id, login_id: existing.login_id, already_exists: true });
    }

    const base = suggestBase(trimmedName, body.master_type);
    const userType = body.master_type === 'hdec_pic' || body.master_type === 'hdec_eng'
      ? 'hdec'
      : body.master_type === 'subsub' ? 'subsub' : 'subcontractor';

    let loginId = '';
    let createdUser: any = null;
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      loginId = await findUniqueLoginId(admin, base);
      const email = `${loginId}@${FAKE_EMAIL_DOMAIN}`;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: trimmedName,
          login_id: loginId,
          user_type: userType,
          subcontractor_name: body.subcontractor_name ?? null,
          subsub_name: body.subsub_name ?? null,
          hdec_pic_name: body.hdec_pic_name ?? null,
          hdec_eng_name: body.hdec_eng_name ?? null,
          must_change_password: true,
        },
      });
      if (!createErr && created?.user) {
        createdUser = created.user;
        break;
      }
      lastErr = createErr?.message ?? 'Create failed';
      if (!/already|duplicate|exist|unique/i.test(lastErr)) break;
    }
    if (!createdUser) {
      return json({ error: lastErr ?? 'Create failed' }, 400);
    }

    const newUserId = createdUser.id;
    const { error: roleErr } = await admin
      .from('user_roles')
      .insert({ user_id: newUserId, role: 'user' });
    if (roleErr) {
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
