import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FAKE_EMAIL_DOMAIN = 'shaw.local';
const DEFAULT_PASSWORD = 'SHAW00';
const STOP_WORDS = new Set([
  'co', 'ltd', 'inc', 'corp', 'corporation', 'company', 'llc',
  'group', 'eng', 'engineering', 'the', 'and',
]);

type MasterType = 'subcontractor' | 'subsub' | 'hdec_pic';

interface Body {
  name: string;
  master_type: MasterType;
  subcontractor_name?: string | null;
  subsub_name?: string | null;
  hdec_pic_name?: string | null;
}

function abbreviate6(name: string): string | null {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const allWords = cleaned.split(' ').filter(Boolean);
  if (allWords.length === 0) return null;

  let words = allWords.filter(w => !STOP_WORDS.has(w));
  // If stop-word removal leaves <3 chars worth, fall back to all words
  const totalLen = words.reduce((s, w) => s + w.length, 0);
  if (words.length === 0 || totalLen < 3) words = allWords;

  let id = '';
  if (words.length === 1) {
    id = words[0].slice(0, 6);
  } else if (words.length === 2) {
    id = words[0].slice(0, 3) + words[1].slice(0, 3);
  } else {
    // 3+ words: take 2 chars from each until we hit 6
    for (const w of words) {
      id += w.slice(0, 2);
      if (id.length >= 6) break;
    }
    id = id.slice(0, 6);
  }
  // Pad if short
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

function randomFallback(prefix: 'sub' | 'pic'): string {
  return `${prefix}_${Math.floor(100000 + Math.random() * 900000)}`;
}

function suggestBase(name: string, type: MasterType): string {
  if (type === 'hdec_pic') {
    return picSnake(name) ?? randomFallback('pic');
  }
  return abbreviate6(name) ?? randomFallback('sub');
}

async function findUniqueLoginId(
  admin: ReturnType<typeof createClient>,
  base: string,
): Promise<string> {
  const exists = async (lid: string): Promise<boolean> => {
    const { data } = await admin.from('profiles').select('id').eq('login_id', lid).maybeSingle();
    return !!data;
  };
  if (!(await exists(base))) return base;
  for (let n = 2; n <= 99; n++) {
    const candidate = base.length === 6 ? `${base.slice(0, 5)}${n > 9 ? n : '0' + n}`.slice(0, 6) : `${base}${n}`;
    // Simpler: hyuele -> hyule2, hyule3 ... hyul10 (6 chars)
    const c = base.length >= 5 ? `${base.slice(0, 6 - String(n).length)}${n}` : `${base}${n}`;
    if (!(await exists(c))) return c;
  }
  // fallback random
  for (let i = 0; i < 20; i++) {
    const c = `${base.slice(0, 3)}${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await exists(c))) return c;
  }
  throw new Error('Unable to generate unique login_id');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = (await req.json()) as Body;
    if (!body.name?.trim() || !body.master_type) {
      return json({ error: 'Missing name or master_type' }, 400);
    }

    const base = suggestBase(body.name.trim(), body.master_type);
    const loginId = await findUniqueLoginId(admin, base);
    const email = `${loginId}@${FAKE_EMAIL_DOMAIN}`;

    const userType =
      body.master_type === 'hdec_pic' ? 'hdec' : 'subcontractor';

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: body.name.trim(),
        login_id: loginId,
        user_type: userType,
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
