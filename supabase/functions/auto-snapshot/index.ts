import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "db-backups";

// Per-page rows. Each page becomes its own file on disk so memory stays bounded
// regardless of table size.
// IMPORTANT: PostgREST hard-caps SELECT * at 1000 rows by default, so any larger
// PAGE_SIZE silently returns only 1000 rows and the loop wrongly treats it as
// end-of-table. Keep this at 1000 unless the project's `db.max_rows` is raised.
const PAGE_SIZE = Number(Deno.env.get("SNAPSHOT_PAGE_SIZE") ?? 1000);

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

type Stage = "tables" | "auth" | "schema" | "identities" | "storage" | "verify" | "done";

type Progress = {
  snapshot_type: "auto" | "manual";
  note: string;
  name: string;
  folder: string;
  started_at: string;
  triggered_by: string | null;
  run_log_id: string | null;
  /** Current pipeline stage. */
  stage?: Stage;
  /** Index into BACKUP_TABLES of the next/current table to process. */
  cursor_table: number;
  /** Offset within current table (rows already dumped to part files). */
  cursor_offset: number;
  /** Number of part files already written for current table. */
  cursor_parts: number;
  /** Per-table accumulated results. */
  manifest: Record<string, ManifestEntry>;
  /** Auth users dump result. */
  auth_users_count?: number;
  /** auth.identities dump result. */
  auth_identities_count?: number;
  /** Schema DDL dump result. */
  schema_ddl_bytes?: number;
  /** Consistency markers (start/end txid + snapshot id + timestamps). */
  consistency_start?: unknown;
  consistency_end?: unknown;
  /** Storage backup state. */
  storage_buckets?: string[];
  storage_cursor_bucket?: number;
  storage_cursor_offset?: number; // offset within current bucket's object list
  storage_objects_done?: number;
  storage_bytes_done?: number;
  storage_manifest?: Array<{ bucket: string; name: string; size: number; mimetype?: string | null }>;
  /** Integrity report. */
  integrity_report?: unknown;
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
      if (isAutoInitCall) {
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

      // Capture start consistency marker (txid + snapshot id + timestamp).
      let startMarker: unknown = null;
      try {
        const { data: m } = await adminClient.rpc("backup_consistency_marker");
        startMarker = m ?? null;
      } catch (e) {
        console.warn("consistency marker (start) failed:", (e as Error).message);
      }

      const progress: Progress = {
        snapshot_type,
        note,
        name,
        folder,
        started_at: new Date().toISOString(),
        triggered_by: triggeredBy,
        run_log_id: runRow?.id ?? null,
        stage: "tables",
        cursor_table: 0,
        cursor_offset: 0,
        cursor_parts: 0,
        manifest: {},
        consistency_start: startMarker,
        storage_objects_done: 0,
        storage_bytes_done: 0,
        storage_manifest: [],
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

// Storage buckets to mirror (everything except our own backup bucket).
const SYSTEM_BUCKETS = new Set<string>([BUCKET]);
// Max storage objects copied per single invocation chunk before checking time budget.
const STORAGE_OBJS_PER_PAGE = Number(Deno.env.get("SNAPSHOT_STORAGE_PAGE") ?? 25);

/**
 * Drive the snapshot forward through stages: tables → auth → storage → verify → done.
 * Self-triggers when the soft time limit is hit.
 */
async function processWork(client: any, progress: Progress, startedAt: number): Promise<void> {
  // Back-compat: default older progress files without stage.
  if (!progress.stage) progress.stage = "tables";

  const overBudget = () => Date.now() - startedAt > SOFT_TIME_LIMIT_MS;
  const bail = async (msg: string) => {
    await saveProgress(client, progress);
    await logRunUpdate(client, progress.run_log_id, { message: msg });
    selfTrigger(progress.folder);
  };

  try {
    // ───────────────────────────── STAGE: TABLES ─────────────────────────────
    if (progress.stage === "tables") {
      while (progress.cursor_table < BACKUP_TABLES.length) {
        if (overBudget()) {
          await bail(`In progress: ${progress.cursor_table}/${BACKUP_TABLES.length} tables, resuming`);
          return;
        }
        const table = BACKUP_TABLES[progress.cursor_table];
        if (progress.manifest[table]) {
          progress.cursor_table += 1;
          progress.cursor_offset = 0;
          progress.cursor_parts = 0;
          continue;
        }
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
          console.error(`select failed for ${table}:`, (e as Error).message);
          progress.manifest[table] = { rows: progress.cursor_offset, parts: progress.cursor_parts };
          progress.cursor_table += 1;
          progress.cursor_offset = 0;
          progress.cursor_parts = 0;
          await saveProgress(client, progress);
          continue;
        }

        if (pageRows.length === 0) {
          if (progress.cursor_parts === 0) {
            await uploadPart(client, progress.folder, table, 0, [], true);
            progress.manifest[table] = { rows: 0, parts: 1 };
          } else if (progress.cursor_parts === 1) {
            const partPath = `${progress.folder}/${table}__part_000.json`;
            try {
              const { data: dl, error: dlErr } = await client.storage.from(BUCKET).download(partPath);
              if (!dlErr && dl) {
                const rows = JSON.parse(await dl.text());
                await uploadPart(client, progress.folder, table, 0, rows, true);
                await client.storage.from(BUCKET).remove([partPath]).catch(() => {});
              }
            } catch (e) {
              console.warn(`promote ${table} single-file failed:`, (e as Error).message);
            }
            progress.manifest[table] = { rows: progress.cursor_offset, parts: 1 };
          } else {
            progress.manifest[table] = { rows: progress.cursor_offset, parts: progress.cursor_parts };
          }
          progress.cursor_table += 1;
          progress.cursor_offset = 0;
          progress.cursor_parts = 0;
          await saveProgress(client, progress);
          continue;
        }

        await uploadPart(client, progress.folder, table, progress.cursor_parts, pageRows, false);
        progress.cursor_parts += 1;
        progress.cursor_offset += pageRows.length;
        await saveProgress(client, progress);
      }
      // Tables done → advance.
      progress.stage = "auth";
      await saveProgress(client, progress);
      await logRunUpdate(client, progress.run_log_id, {
        message: `Tables done: ${Object.keys(progress.manifest).length}/${BACKUP_TABLES.length}; dumping auth.users`,
      });
    }

    // ───────────────────────────── STAGE: AUTH ───────────────────────────────
    if (progress.stage === "auth") {
      if (overBudget()) { await bail(`Resuming at auth stage`); return; }
      const { data: rows, error } = await client.rpc("dump_auth_users_with_hash");
      if (error) {
        console.error("auth dump failed:", error.message);
        progress.auth_users_count = 0;
      } else {
        const list = Array.isArray(rows) ? rows : [];
        const path = `${progress.folder}/__auth_users.json`;
        await withRetry("upload auth users", async () => {
          const { error: upErr } = await client.storage.from(BUCKET).upload(
            path,
            new Blob([JSON.stringify(list)], { type: "application/json" }),
            { contentType: "application/json", upsert: true },
          );
          if (upErr) throw new Error(upErr.message);
        });
        progress.auth_users_count = list.length;
      }
      progress.stage = "storage";
      await saveProgress(client, progress);
      await logRunUpdate(client, progress.run_log_id, {
        message: `Auth dumped (${progress.auth_users_count ?? 0} users); copying storage objects`,
      });
    }

    // ───────────────────────────── STAGE: STORAGE ────────────────────────────
    if (progress.stage === "storage") {
      // Initialize bucket list once.
      if (!progress.storage_buckets) {
        const { data: bkts, error } = await client.storage.listBuckets();
        if (error) throw new Error(`listBuckets: ${error.message}`);
        progress.storage_buckets = (bkts ?? [])
          .map((b: any) => b.name as string)
          .filter((n: string) => !SYSTEM_BUCKETS.has(n));
        progress.storage_cursor_bucket = 0;
        progress.storage_cursor_offset = 0;
        progress.storage_manifest = progress.storage_manifest ?? [];
        await saveProgress(client, progress);
      }

      while ((progress.storage_cursor_bucket ?? 0) < progress.storage_buckets!.length) {
        if (overBudget()) {
          await bail(`Storage in progress: bucket ${progress.storage_cursor_bucket}/${progress.storage_buckets!.length}, ${progress.storage_objects_done} objects copied`);
          return;
        }
        const bucket = progress.storage_buckets![progress.storage_cursor_bucket!];
        const from = progress.storage_cursor_offset ?? 0;
        const to = from + STORAGE_OBJS_PER_PAGE - 1;
        // Use storage.objects via service role to list all rows in this bucket.
        const { data: objs, error } = await client
          .schema("storage")
          .from("objects")
          .select("name, metadata")
          .eq("bucket_id", bucket)
          .order("name")
          .range(from, to);
        if (error) {
          console.error(`list storage ${bucket} @${from}:`, error.message);
          // Move to next bucket on listing failure.
          progress.storage_cursor_bucket = (progress.storage_cursor_bucket ?? 0) + 1;
          progress.storage_cursor_offset = 0;
          await saveProgress(client, progress);
          continue;
        }
        const rows = (objs ?? []) as Array<{ name: string; metadata: any }>;
        if (rows.length === 0) {
          progress.storage_cursor_bucket = (progress.storage_cursor_bucket ?? 0) + 1;
          progress.storage_cursor_offset = 0;
          await saveProgress(client, progress);
          continue;
        }

        for (const row of rows) {
          if (overBudget()) {
            await saveProgress(client, progress);
            await bail(`Storage copy budget hit at ${bucket}/${row.name}`);
            return;
          }
          const size = Number(row?.metadata?.size ?? 0);
          const mimetype = row?.metadata?.mimetype ?? null;
          try {
            const { data: dl, error: dlErr } = await client.storage.from(bucket).download(row.name);
            if (dlErr) throw new Error(dlErr.message);
            const dest = `${progress.folder}/__storage/${bucket}/${row.name}`;
            const { error: upErr } = await client.storage.from(BUCKET).upload(
              dest, dl, { contentType: mimetype ?? "application/octet-stream", upsert: true },
            );
            if (upErr) throw new Error(upErr.message);
            progress.storage_manifest!.push({ bucket, name: row.name, size, mimetype });
            progress.storage_objects_done = (progress.storage_objects_done ?? 0) + 1;
            progress.storage_bytes_done = (progress.storage_bytes_done ?? 0) + size;
          } catch (e) {
            console.warn(`copy ${bucket}/${row.name} failed:`, (e as Error).message);
          }
          progress.storage_cursor_offset = (progress.storage_cursor_offset ?? 0) + 1;
        }
        await saveProgress(client, progress);
      }

      // Upload the storage manifest once all buckets done.
      const sPath = `${progress.folder}/__storage_manifest.json`;
      await withRetry("upload storage manifest", async () => {
        const { error } = await client.storage.from(BUCKET).upload(
          sPath,
          new Blob([JSON.stringify({
            version: 1,
            buckets: progress.storage_buckets,
            objects_count: progress.storage_objects_done ?? 0,
            bytes: progress.storage_bytes_done ?? 0,
            entries: progress.storage_manifest ?? [],
          })], { type: "application/json" }),
          { contentType: "application/json", upsert: true },
        );
        if (error) throw new Error(error.message);
      });

      progress.stage = "verify";
      await saveProgress(client, progress);
      await logRunUpdate(client, progress.run_log_id, {
        message: `Storage copied (${progress.storage_objects_done ?? 0} objects); verifying integrity`,
      });
    }

    // ───────────────────────────── STAGE: VERIFY ─────────────────────────────
    if (progress.stage === "verify") {
      const report: any = {
        tables_checked: 0,
        tables_mismatch: [] as Array<{ table: string; manifest: number; actual: number }>,
        storage_sampled: 0,
        storage_missing: [] as string[],
        auth_users_ok: true,
      };
      for (const t of Object.keys(progress.manifest)) {
        if (overBudget()) { await bail("Resuming verification"); return; }
        const expected = progress.manifest[t]?.rows ?? 0;
        const { count, error } = await client.from(t).select("*", { count: "exact", head: true });
        if (error) continue;
        report.tables_checked += 1;
        const actual = count ?? 0;
        // Backup is non-transactional; actual ≥ expected is acceptable (writes during backup).
        if (actual < expected) {
          report.tables_mismatch.push({ table: t, manifest: expected, actual });
        }
      }
      // Storage sample (up to 20 entries)
      const entries = (progress.storage_manifest ?? []);
      const sample = entries.length <= 20 ? entries : entries
        .filter((_, i) => i % Math.ceil(entries.length / 20) === 0).slice(0, 20);
      for (const e of sample) {
        report.storage_sampled += 1;
        try {
          const dest = `${progress.folder}/__storage/${e.bucket}/${e.name}`;
          const { data, error } = await client.storage.from(BUCKET).list(
            dest.split("/").slice(0, -1).join("/"),
            { search: dest.split("/").pop()! },
          );
          if (error || !data || data.length === 0) report.storage_missing.push(`${e.bucket}/${e.name}`);
        } catch { report.storage_missing.push(`${e.bucket}/${e.name}`); }
      }
      // Auth users count
      try {
        const { data: cnt } = await client.rpc("count_auth_users");
        const actual = typeof cnt === "number" ? cnt : Number(cnt ?? 0);
        report.auth_users_actual = actual;
        report.auth_users_backed_up = progress.auth_users_count ?? 0;
        if (actual !== (progress.auth_users_count ?? 0)) report.auth_users_ok = false;
      } catch { /* ignore */ }

      progress.integrity_report = report;
      progress.stage = "done";
      await saveProgress(client, progress);
    }

    // ───────────────────────────── FINALIZE ──────────────────────────────────
    const manifestPayload = {
      version: 5,
      generated_at: new Date().toISOString(),
      snapshot_type: progress.snapshot_type,
      tables: BACKUP_TABLES,
      manifest: progress.manifest,
      auth_users_count: progress.auth_users_count ?? 0,
      storage_objects_count: progress.storage_objects_done ?? 0,
      storage_bytes: progress.storage_bytes_done ?? 0,
      storage_buckets: progress.storage_buckets ?? [],
      integrity_report: progress.integrity_report ?? null,
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
      backup_version: 5,
    });
    if (insErr) throw new Error(`db insert: ${insErr.message}`);

    await client.storage.from(BUCKET).remove([`${progress.folder}/_progress.json`]).catch(() => {});

    const report: any = progress.integrity_report ?? {};
    const hasWarnings = (report.tables_mismatch?.length ?? 0) > 0
      || (report.storage_missing?.length ?? 0) > 0
      || report.auth_users_ok === false;

    await logRunUpdate(client, progress.run_log_id, {
      status: hasWarnings ? "success_with_warnings" : "success",
      message: hasWarnings
        ? `Completed with warnings: ${totalRows.toLocaleString()} rows, ${progress.auth_users_count ?? 0} users, ${progress.storage_objects_done ?? 0} objects`
        : `Completed: ${totalRows.toLocaleString()} rows / ${progress.auth_users_count ?? 0} users / ${progress.storage_objects_done ?? 0} objects`,
      total_rows: totalRows,
      total_tables: totalTables,
      auth_users_backed_up: progress.auth_users_count ?? 0,
      storage_objects_backed_up: progress.storage_objects_done ?? 0,
      storage_bytes_backed_up: progress.storage_bytes_done ?? 0,
      integrity_report: progress.integrity_report ?? null,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("processWork error:", e);
    await logRunUpdate(client, progress.run_log_id, {
      status: "failed",
      message: `Failed at stage ${progress.stage} (table index ${progress.cursor_table}, ${BACKUP_TABLES[progress.cursor_table] ?? "?"}): ${(e as Error).message}`,
      finished_at: new Date().toISOString(),
    });
  }
}

