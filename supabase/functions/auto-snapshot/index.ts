import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function uploadTable(client: any, bucket: string, folder: string, table: string): Promise<number> {
  // Stream rows page by page and assemble JSON array as text to keep peak memory low.
  const pageSize = 1000;
  let from = 0;
  let total = 0;
  const chunks: string[] = ["["];
  let first = true;
  while (true) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      chunks.push((first ? "" : ",") + JSON.stringify(row));
      first = false;
    }
    total += data.length;
    if (data.length < pageSize) break;
    from += pageSize;
  }
  chunks.push("]");
  const json = chunks.join("");
  const path = `${folder}/${table}.json`;
  const { error: upErr } = await client.storage
    .from(bucket)
    .upload(path, new Blob([json], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr) throw new Error(`upload ${table}: ${upErr.message}`);
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    let snapshotType = "auto";
    let note = "Daily automatic backup (SGT 23:50)";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.mode === "manual") {
          snapshotType = "manual";
          note = body?.note || "Manual full snapshot";
        }
      } catch { /* ignore */ }
    }

    const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const stamp = sgtNow.toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const dateStr = sgtNow.toISOString().slice(0, 10);
    const name = snapshotType === "manual"
      ? `Manual ${dateStr} ${sgtNow.toISOString().slice(11, 16)}`
      : `Auto ${dateStr} 23:50`;

    const folder = `${snapshotType}/${stamp}`;
    const bucket = "db-backups";

    // Sequentially upload each table to keep memory bounded.
    const manifest: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      manifest[t] = await uploadTable(adminClient, bucket, folder, t);
    }

    // Manifest file
    const manifestPayload = {
      version: 3,
      generated_at: new Date().toISOString(),
      snapshot_type: snapshotType,
      tables: BACKUP_TABLES,
      manifest,
    };
    const manifestPath = `${folder}/manifest.json`;
    const { error: mErr } = await adminClient.storage
      .from(bucket)
      .upload(manifestPath, new Blob([JSON.stringify(manifestPayload)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });
    if (mErr) throw new Error(`manifest upload: ${mErr.message}`);

    const totalRows = Object.values(manifest).reduce((a, b) => a + b, 0);

    // Record snapshot row (manifest only — no inline snapshot_data to save space)
    const { error: insErr } = await adminClient.from("database_snapshots").insert({
      snapshot_name: name,
      snapshot_data: null,
      row_count: totalRows,
      snapshot_type: snapshotType,
      note,
      storage_path: manifestPath,
      manifest,
      backup_version: 3,
    });
    if (insErr) throw new Error(`db insert: ${insErr.message}`);

    return new Response(
      JSON.stringify({ success: true, storage_path: manifestPath, total_rows: totalRows, manifest }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
