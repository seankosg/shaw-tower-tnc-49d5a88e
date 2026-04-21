import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Fetch all subtests with pagination
    const allRows: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await adminClient
        .from("subtests")
        .select("*")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Singapore time for naming
    const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const name = `Auto ${sgtNow.toISOString().slice(0, 10)} 23:50`;

    const { error: insErr } = await adminClient
      .from("database_snapshots")
      .insert({
        snapshot_name: name,
        snapshot_data: allRows,
        row_count: allRows.length,
        snapshot_type: "auto",
        note: "Daily automatic backup (SGT 23:50)",
      });

    if (insErr) throw insErr;

    return new Response(
      JSON.stringify({ success: true, rows: allRows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
