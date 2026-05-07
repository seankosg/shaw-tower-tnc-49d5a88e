import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 8;
const BUCKET = "db-backups";

// Split BACKUP_TABLES into chunks of CHUNK_SIZE.
function getStages(): string[][] {
  const stages: string[][] = [];
  for (let i = 0; i < BACKUP_TABLES.length; i += CHUNK_SIZE) {
    stages.push(BACKUP_TABLES.slice(i, i + CHUNK_SIZE));
  }
  return stages;
}

async function uploadTable(client: any, folder: string, table: string): Promise<number> {
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
    .from(BUCKET)
    .upload(path, new Blob([json], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr) throw new Error(`upload ${table}: ${upErr.message}`);
  return total;
}

type Progress = {
  snapshot_type: string;
  note: string;
  name: string;
  folder: string;
  started_at: string;
  total_stages: number;
  completed_stages: number;
  manifest: Record<string, number>;
};

async function loadProgress(client: any, folder: string): Promise<Progress> {
  const { data, error } = await client.storage.from(BUCKET).download(`${folder}/_progress.json`);
  if (error) throw new Error(`load progress: ${error.message}`);
  return JSON.parse(await data.text());
}

async function saveProgress(client: any, p: Progress) {
  const { error } = await client.storage
    .from(BUCKET)
    .upload(`${p.folder}/_progress.json`, new Blob([JSON.stringify(p)], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(`save progress: ${error.message}`);
}

function triggerNext(folder: string, stage: number) {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/auto-snapshot`;
  // Fire-and-forget; do not await response body.
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
    },
    body: JSON.stringify({ folder, stage }),
  }).catch((e) => console.error("trigger next failed:", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const stages = getStages();
    const totalStages = stages.length;

    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* ignore */ }
    }

    // === INITIALIZE NEW RUN ===
    if (!body?.folder) {
      const snapshot_type = body?.mode === "manual" ? "manual" : "auto";
      const note = body?.mode === "manual"
        ? (body?.note || "Manual full snapshot")
        : "Daily automatic backup (SGT 23:50)";

      const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const stamp = sgtNow.toISOString().replace(/[:T]/g, "-").slice(0, 16);
      const dateStr = sgtNow.toISOString().slice(0, 10);
      const name = snapshot_type === "manual"
        ? `Manual ${dateStr} ${sgtNow.toISOString().slice(11, 16)}`
        : `Auto ${dateStr} 23:50`;

      const folder = `${snapshot_type}/${stamp}`;
      const progress: Progress = {
        snapshot_type,
        note,
        name,
        folder,
        started_at: new Date().toISOString(),
        total_stages: totalStages,
        completed_stages: 0,
        manifest: {},
      };
      await saveProgress(adminClient, progress);

      triggerNext(folder, 0);

      return new Response(
        JSON.stringify({
          success: true,
          status: "initialized",
          folder,
          total_stages: totalStages,
          message: `Backup started; will process ${totalStages} stages of up to ${CHUNK_SIZE} tables each.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === PROCESS A STAGE ===
    const folder: string = body.folder;
    const stage: number = Number(body.stage ?? 0);

    if (stage < 0 || stage >= totalStages) {
      throw new Error(`invalid stage ${stage} (total ${totalStages})`);
    }

    const progress = await loadProgress(adminClient, folder);
    const tables = stages[stage];

    const skipped: string[] = [];
    const processed: string[] = [];
    for (const t of tables) {
      if (Object.prototype.hasOwnProperty.call(progress.manifest, t)) {
        skipped.push(t);
        continue;
      }
      progress.manifest[t] = await uploadTable(adminClient, folder, t);
      processed.push(t);
      // Persist after each table so partial-failure retries also skip done work.
      await saveProgress(adminClient, progress);
    }
    if (stage + 1 > progress.completed_stages) {
      progress.completed_stages = stage + 1;
    }
    await saveProgress(adminClient, progress);

    const isLast = stage + 1 >= totalStages;

    if (!isLast) {
      triggerNext(folder, stage + 1);
      return new Response(
        JSON.stringify({
          success: true,
          status: "stage_complete",
          stage,
          next_stage: stage + 1,
          total_stages: totalStages,
          tables_in_stage: tables,
          processed,
          skipped,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === FINAL STAGE: write manifest + DB row ===
    const manifestPayload = {
      version: 3,
      generated_at: new Date().toISOString(),
      snapshot_type: progress.snapshot_type,
      tables: BACKUP_TABLES,
      manifest: progress.manifest,
    };
    const manifestPath = `${folder}/manifest.json`;
    const { error: mErr } = await adminClient.storage
      .from(BUCKET)
      .upload(manifestPath, new Blob([JSON.stringify(manifestPayload)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });
    if (mErr) throw new Error(`manifest upload: ${mErr.message}`);

    const totalRows = Object.values(progress.manifest).reduce((a, b) => a + b, 0);

    const { error: insErr } = await adminClient.from("database_snapshots").insert({
      snapshot_name: progress.name,
      snapshot_data: null,
      row_count: totalRows,
      snapshot_type: progress.snapshot_type,
      note: progress.note,
      storage_path: manifestPath,
      manifest: progress.manifest,
      backup_version: 3,
    });
    if (insErr) throw new Error(`db insert: ${insErr.message}`);

    // Best-effort cleanup of progress file.
    await adminClient.storage.from(BUCKET).remove([`${folder}/_progress.json`]).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        status: "completed",
        storage_path: manifestPath,
        total_rows: totalRows,
        manifest: progress.manifest,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("auto-snapshot error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
