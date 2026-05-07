import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchAllRows(client: any, table: string): Promise<any[]> {
  const all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Optional body to mark manual vs auto runs
    let snapshotType = "auto";
    let note = "Daily automatic backup (SGT 23:50)";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.mode === "manual") {
          snapshotType = "manual";
          note = body?.note || "Manual full snapshot";
        }
      } catch {
        // ignore — cron sends a body, but it's tolerant
      }
    }

    // Pull every table in parallel (small ones) but cap to avoid memory spikes.
    const tables: Record<string, any[]> = {};
    const manifest: Record<string, number> = {};

    for (const t of BACKUP_TABLES) {
      const rows = await fetchAllRows(adminClient, t);
      tables[t] = rows;
      manifest[t] = rows.length;
    }

    const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const stamp = sgtNow.toISOString().replace(/[:T]/g, "-").slice(0, 16); // YYYY-MM-DD-HH-MM
    const dateStr = sgtNow.toISOString().slice(0, 10);
    const name = snapshotType === "manual"
      ? `Manual ${dateStr} ${sgtNow.toISOString().slice(11, 16)}`
      : `Auto ${dateStr} 23:50`;

    const folder = snapshotType === "manual" ? "manual" : "auto";
    const storagePath = `${folder}/${stamp}.json`;

    const payload = {
      version: 2,
      generated_at: new Date().toISOString(),
      snapshot_type: snapshotType,
      manifest,
      tables,
    };

    const json = JSON.stringify(payload);
    const totalRows = Object.values(manifest).reduce((a, b) => a + b, 0);

    // Upload to Storage
    const { error: upErr } = await adminClient.storage
      .from("db-backups")
      .upload(storagePath, new Blob([json], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);

    // Mirror to database_snapshots (keep snapshot_data populated for parity)
    const { error: insErr } = await adminClient.from("database_snapshots").insert({
      snapshot_name: name,
      snapshot_data: tables,
      row_count: totalRows,
      snapshot_type: snapshotType,
      note,
      storage_path: storagePath,
      manifest,
      backup_version: 2,
    });
    if (insErr) throw new Error(`db insert: ${insErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        storage_path: storagePath,
        total_rows: totalRows,
        manifest,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
