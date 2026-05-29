import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "db-backups";

// Per-page rows. Each page becomes its own file on disk so memory stays bounded
// regardless of table size.
const PAGE_SIZE = Number(Deno.env.get("SNAPSHOT_PAGE_SIZE") ?? 5000);

// Soft elapsed-time budget per invocation. When exceeded we persist progress and
// re-trigger to continue. Keep well under the platform's hard 150s wall-clock.
const SOFT_TIME_LIMIT_MS = Number(Deno.env.get("SNAPSHOT_SOFT_LIMIT_MS") ?? 60_000);

const RETRY_MAX_ATTEMPTS = Number(Deno.env.get("SNAPSHOT_RETRY_MAX_ATTEMPTS") ?? 5);
const RETRY_BASE_MS = Number(Deno.env.get("SNAPSHOT_RETRY_BASE_MS") ?? 500);
const RETRY_MAX_MS = Number(Deno.env.get("SNAPSHOT_RETRY_MAX_MS") ?? 8000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= RETRY_MAX_ATTEMPTS) break;
      const expo = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(250, expo));
      const delay = expo + jitter;
      console.warn(`[retry] ${label} attempt ${attempt} failed: ${(e as Error).message}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type ManifestEntry = { rows: number; parts: number };

type Progress = {
  snapshot_type: "auto" | "manual";
  note: string;
  name: string;
  folder: string;
  started_at: string;
  triggered_by: string | null;
  run_log_id: string | null;
  /** Index into BACKUP_TABLES of the next/current table to process. */
  cursor_table: number;
  /** Offset within current table (rows already dumped to part files). */
  cursor_offset: number;
  /** Number of part files already written for current table. */
  cursor_parts: number;
  /** Per-table accumulated results. */
  manifest: Record<string, ManifestEntry>;
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

async function uploadPart(client: any, folder: string, table: string, partIdx: number, rows: any[], single: boolean) {
  const path = single
    ? `${folder}/${table}.json`
    : `${folder}/${table}__part_${String(partIdx).padStart(3, "0")}.json`;
  const body = JSON.stringify(rows);
  await withRetry(`upload ${path}`, async () => {
    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, new Blob([body], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });
    if (error) throw new Error(error.message);
  });
}

/**
 * Promote single-file uploads (parts=1) into the canonical `<table>.json` path
 * when a table fits into one page. If it overflowed into multiple parts we
 * keep the part files as-is. Re-upload the first page under the legacy name.
 *
 * To keep restore simple we always use `<table>.json` for parts==1, and
 * `<table>__part_NNN.json` for parts>=2. We name files correctly on first
 * upload so no promotion step is needed.
 */

function nowMs() { return Date.now(); }

async function logRunUpdate(client: any, runLogId: string | null, patch: Record<string, unknown>) {
  if (!runLogId) return;
  try {
    await client.from("backup_run_log").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", runLogId);
  } catch (e) {
    console.warn("backup_run_log update failed:", (e as Error).message);
  }
}

function buildSelfTriggerHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
    "x-backup-internal": "1",
  };
}

function selfTrigger(folder: string) {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/auto-snapshot`;
  const req = fetch(url, {
    method: "POST",
    headers: buildSelfTriggerHeaders(),
    body: JSON.stringify({ folder, resume: true }),
  }).then((r) => r.text().catch(() => "")).catch((e) => {
    console.error("self-trigger failed:", e);
  });
  // Ensure Deno doesn't kill the outbound fetch when we return our Response.
  // EdgeRuntime is provided by Supabase Edge Functions runtime.
  // deno-lint-ignore no-explicit-any
  const ER = (globalThis as any).EdgeRuntime;
  if (ER && typeof ER.waitUntil === "function") {
    ER.waitUntil(req);
  }
}

async function isAdminCaller(supabaseUrl: string, anonKey: string, serviceKey: string, authHeader: string | null): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing Authorization header" };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, message: "Invalid token" };
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin, error: roleErr } = await admin.rpc("is_admin_or_superuser", { _user_id: userData.user.id });
  if (roleErr) return { ok: false, status: 500, message: roleErr.message };
  if (!isAdmin) return { ok: false, status: 403, message: "Admin required" };
  return { ok: true, userId: userData.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = nowMs();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { /* ignore */ }
  }

  const internalHeader = req.headers.get("x-backup-internal") === "1";
  const authHeader = req.headers.get("Authorization");
  // Internal continuation calls use service-role bearer; we trust those.
  const isInternalServiceCall = internalHeader && authHeader?.includes(serviceKey);

  // Auto/cron calls have no manual mode and no folder; allow without admin
  // check (cron may use anon key under `verify_jwt = false`). They only trigger
  // a backup, which is gated separately by `schedule.enabled`.
  const isAutoInitCall = !internalHeader && !body?.folder && body?.mode !== "manual";

  let triggeredBy: string | null = null;

  // Only manual runs require an admin JWT.
  if (!isInternalServiceCall && !isAutoInitCall) {
    const gate = await isAdminCaller(supabaseUrl, anonKey, serviceKey, authHeader);
    if (!gate.ok) {
      return new Response(JSON.stringify({ error: gate.message }), {
        status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    triggeredBy = gate.userId;
  }


  try {
    // === INITIALIZE NEW RUN ===
    if (!body?.folder) {
      // Honor enabled flag for auto runs.
      if (isCronCall) {
        const { data: sched } = await adminClient
          .from("app_settings").select("value").eq("key", "backup_schedule").maybeSingle();
        const enabled = (sched?.value as any)?.enabled ?? true;
        if (!enabled) {
          return new Response(
            JSON.stringify({ success: true, status: "skipped", reason: "schedule disabled" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const snapshot_type: "auto" | "manual" = body?.mode === "manual" ? "manual" : "auto";
      const note = snapshot_type === "manual"
        ? (body?.note || "Manual full snapshot")
        : "Daily automatic backup (SGT 23:50)";

      const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const stamp = sgtNow.toISOString().replace(/[:T]/g, "-").slice(0, 16);
      const dateStr = sgtNow.toISOString().slice(0, 10);
      const name = snapshot_type === "manual"
        ? `Manual ${dateStr} ${sgtNow.toISOString().slice(11, 16)}`
        : `Auto ${dateStr} 23:50`;
      const folder = `${snapshot_type}/${stamp}`;

      // Create a run-log row up front for visibility.
      const { data: runRow } = await adminClient.from("backup_run_log").insert({
        snapshot_type,
        status: "running",
        folder,
        message: `Started: ${BACKUP_TABLES.length} tables queued`,
        triggered_by: triggeredBy,
      }).select("id").single();

      const progress: Progress = {
        snapshot_type,
        note,
        name,
        folder,
        started_at: new Date().toISOString(),
        triggered_by: triggeredBy,
        run_log_id: runRow?.id ?? null,
        cursor_table: 0,
        cursor_offset: 0,
        cursor_parts: 0,
        manifest: {},
      };
      await saveProgress(adminClient, progress);

      // Start processing in the same invocation; will self-trigger if time runs short.
      // deno-lint-ignore no-explicit-any
      const ER = (globalThis as any).EdgeRuntime;
      const work = processWork(adminClient, progress, startedAt);
      if (ER && typeof ER.waitUntil === "function") {
        ER.waitUntil(work);
      } else {
        // Fallback: run sync. May exceed response time but cron callers don't care.
        await work;
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: "started",
          folder,
          run_log_id: runRow?.id ?? null,
          tables_total: BACKUP_TABLES.length,
          message: `Backup started; check Backup Status for live progress.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === RESUME EXISTING RUN ===
    const folder: string = body.folder;
    const progress = await loadProgress(adminClient, folder);

    // deno-lint-ignore no-explicit-any
    const ER = (globalThis as any).EdgeRuntime;
    const work = processWork(adminClient, progress, startedAt);
    if (ER && typeof ER.waitUntil === "function") {
      ER.waitUntil(work);
      return new Response(
        JSON.stringify({ success: true, status: "resuming", folder }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      await work;
      return new Response(
        JSON.stringify({ success: true, status: "resumed-sync", folder }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    console.error("auto-snapshot error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Drive the snapshot forward from the current cursor. Either completes the
 * snapshot or saves progress and self-triggers when the soft time limit is hit.
 */
async function processWork(client: any, progress: Progress, startedAt: number): Promise<void> {
  try {
    while (progress.cursor_table < BACKUP_TABLES.length) {
      // Bail out and resume in next invocation if we've used the budget.
      if (Date.now() - startedAt > SOFT_TIME_LIMIT_MS) {
        await saveProgress(client, progress);
        await logRunUpdate(client, progress.run_log_id, {
          message: `In progress: ${progress.cursor_table}/${BACKUP_TABLES.length} tables, resuming`,
        });
        selfTrigger(progress.folder);
        return;
      }

      const table = BACKUP_TABLES[progress.cursor_table];

      // Skip table that finished in a previous invocation.
      if (progress.manifest[table]) {
        progress.cursor_table += 1;
        progress.cursor_offset = 0;
        progress.cursor_parts = 0;
        continue;
      }

      const single = progress.cursor_offset === 0; // optimistic — we'll see if more pages come

      // Fetch one page from the current offset.
      const from = progress.cursor_offset;
      const to = from + PAGE_SIZE - 1;
      let pageRows: any[] = [];
      try {
        const res = await withRetry(`select ${table} @${from}`, async () => {
          const r = await client.from(table).select("*").range(from, to);
          if (r.error) throw new Error(r.error.message);
          return r;
        });
        pageRows = res.data ?? [];
      } catch (e) {
        // Table doesn't exist or fatal SELECT error — record and skip.
        console.error(`select failed for ${table}:`, (e as Error).message);
        progress.manifest[table] = { rows: progress.cursor_offset, parts: progress.cursor_parts };
        progress.cursor_table += 1;
        progress.cursor_offset = 0;
        progress.cursor_parts = 0;
        await saveProgress(client, progress);
        continue;
      }

      if (pageRows.length === 0) {
        // Finished this table.
        if (progress.cursor_parts === 0) {
          // Empty table: still write an empty file so restore is uniform.
          await uploadPart(client, progress.folder, table, 0, [], true);
          progress.manifest[table] = { rows: 0, parts: 1 };
        } else {
          progress.manifest[table] = { rows: progress.cursor_offset, parts: progress.cursor_parts };
        }
        progress.cursor_table += 1;
        progress.cursor_offset = 0;
        progress.cursor_parts = 0;
        await saveProgress(client, progress);
        continue;
      }

      // Determine path: if this is the only page so far AND it's a short page,
      // we still want to use the legacy single-file naming. But we can't know
      // yet whether more pages follow. Strategy: always start with part-style
      // naming; promote to single-file at the end if parts == 1.
      // Simpler: always write part files; in the manifest finalize step, if a
      // table ended with exactly 1 part, rename by re-uploading to the legacy
      // name and deleting the part file.
      await uploadPart(client, progress.folder, table, progress.cursor_parts, pageRows, false);

      progress.cursor_parts += 1;
      progress.cursor_offset += pageRows.length;

      // Save progress every page so a crash doesn't lose work.
      await saveProgress(client, progress);

      if (pageRows.length < PAGE_SIZE) {
        // End of table.
        progress.manifest[table] = { rows: progress.cursor_offset, parts: progress.cursor_parts };

        // Promote to legacy single-file name when parts == 1 for restore back-compat.
        if (progress.cursor_parts === 1) {
          const partPath = `${progress.folder}/${table}__part_000.json`;
          const singlePath = `${progress.folder}/${table}.json`;
          // Re-upload as single file then drop the part.
          await uploadPart(client, progress.folder, table, 0, pageRows, true);
          await client.storage.from(BUCKET).remove([partPath]).catch(() => {});
          progress.manifest[table] = { rows: pageRows.length, parts: 1 };
        }

        progress.cursor_table += 1;
        progress.cursor_offset = 0;
        progress.cursor_parts = 0;
        await saveProgress(client, progress);
      }
    }

    // === FINALIZE ===
    const manifestPayload = {
      version: 4,
      generated_at: new Date().toISOString(),
      snapshot_type: progress.snapshot_type,
      tables: BACKUP_TABLES,
      manifest: progress.manifest,
    };
    const manifestPath = `${progress.folder}/manifest.json`;
    await withRetry("upload manifest", async () => {
      const { error } = await client.storage.from(BUCKET).upload(
        manifestPath,
        new Blob([JSON.stringify(manifestPayload)], { type: "application/json" }),
        { contentType: "application/json", upsert: true },
      );
      if (error) throw new Error(error.message);
    });

    const totalRows = Object.values(progress.manifest).reduce(
      (a, b) => a + (b?.rows ?? 0),
      0,
    );
    const totalTables = Object.keys(progress.manifest).length;

    const { error: insErr } = await client.from("database_snapshots").insert({
      snapshot_name: progress.name,
      snapshot_data: null,
      row_count: totalRows,
      snapshot_type: progress.snapshot_type,
      note: progress.note,
      storage_path: manifestPath,
      manifest: progress.manifest,
      backup_version: 4,
    });
    if (insErr) throw new Error(`db insert: ${insErr.message}`);

    await client.storage.from(BUCKET).remove([`${progress.folder}/_progress.json`]).catch(() => {});

    await logRunUpdate(client, progress.run_log_id, {
      status: "success",
      message: `Completed: ${totalRows.toLocaleString()} rows across ${totalTables} tables`,
      total_rows: totalRows,
      total_tables: totalTables,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("processWork error:", e);
    await logRunUpdate(client, progress.run_log_id, {
      status: "failed",
      message: `Failed at table index ${progress.cursor_table} (${BACKUP_TABLES[progress.cursor_table] ?? "?"}): ${(e as Error).message}`,
      finished_at: new Date().toISOString(),
    });
  }
}
