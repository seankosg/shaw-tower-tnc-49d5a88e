import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? 'ppt-builder.ts';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await supabase.storage.from('code-files').download(path);
  if (error || !data) return new Response(JSON.stringify({ error: error?.message }), { status: 500 });
  const text = await data.text();
  return new Response(text, { headers: { 'Content-Type': 'text/plain' } });
});
