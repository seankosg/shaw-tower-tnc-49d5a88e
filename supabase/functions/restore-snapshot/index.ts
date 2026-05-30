import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Trigger the auto-snapshot edge function as a "pre-restore" safety backup
 * and poll until it finishes (or timeout). Returns the linked
 * backup_run_log + database_snapshots ids if successful.
 */
async function createPreRestoreSafetyBackup(opts: {
  supabaseUrl: string;
  serviceKey: string;
  adminClient: ReturnType<typeof createClient>;
  triggeredBy: string | null;
  snapshotIdBeingRestored: string;
  timeoutMs: number;
}): Promise<{ ok: boolean; runId?: string; snapshotId?: string; message?: string }> {
  const note = `Pre-restore safety backup before restoring ${opts.snapshotIdBeingRestored}`;
  // Kick off the auto-snapshot. It self-triggers internally, so we just need
  // the initial 200 response containing the run_log_id.
  let runId: string | undefined;
  try {
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/auto-snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${opts.serviceKey}`,
        "apikey": opts.serviceKey,
      },
      body: JSON.stringify({ mode: "manual", note }),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, message: `auto-snapshot trigger ${res.status}: ${txt.slice(0, 300)}` };
    try {
      const parsed = JSON.parse(txt);
      runId = parsed.run_log_id ?? parsed.runLogId;
    } catch { /* ignore */ }
  } catch (e) {
    return { ok: false, message: `auto-snapshot trigger failed: ${(e as Error).message}` };
  }

  // Fallback: find latest run by note if response didn't expose id.
  if (!runId) {
    await sleep(1500);
    const { data } = await opts.adminClient
      .from("backup_run_log")
      .select("id")
      .eq("message", note)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = (data as any)?.id;
  }
  if (!runId) {
    // Try matching by partial note via snapshot folder note prefix
    const { data } = await opts.adminClient
      .from("backup_run_log")
      .select("id")
      .ilike("message", `%${opts.snapshotIdBeingRestored.slice(0, 8)}%`)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = (data as any)?.id;
  }
  if (!runId) return { ok: false, message: "Could not locate safety backup run_log_id" };

  // Poll for completion.
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const { data: row } = await opts.adminClient
      .from("backup_run_log")
      .select("status, folder, message")
      .eq("id", runId)
      .maybeSingle();
    const status = (row as any)?.status;
    if (status === "success") {
      // Resolve snapshot id from folder path
      const folder = (row as any)?.folder as string | undefined;
      let snapshotId: string | undefined;
      if (folder) {
        const { data: snap } = await opts.adminClient
          .from("database_snapshots")
          .select("id")
          .eq("storage_path", `${folder}/manifest.json`)
          .maybeSingle();
        snapshotId = (snap as any)?.id;
      }
      return { ok: true, runId, snapshotId };
    }
    if (status === "failed" || status === "error") {
      return { ok: false, runId, message: `Safety backup failed: ${(row as any)?.message ?? "unknown"}` };
    }
    await sleep(3000);
  }
  return { ok: false, runId, message: `Safety backup timed out after ${opts.timeoutMs}ms (still running). Restore aborted for safety.` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  let restoreRunId: string | null = null;

  const updateRunLog = async (patch: Record<string, unknown>) => {
    if (!restoreRunId) return;
    await adminClient
      .from("restore_run_log")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", restoreRunId);
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await adminClient.rpc("is_admin_or_superuser", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { snapshot_id, skip_safety_backup } = body as { snapshot_id?: string; skip_safety_backup?: boolean };
    if (!snapshot_id) {
      return new Response(JSON.stringify({ error: "snapshot_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: snapshot, error: snapErr } = await adminClient
      .from("database_snapshots")
      .select("id, snapshot_data, storage_path, backup_version, manifest")
      .eq("id", snapshot_id)
      .single();
    if (snapErr || !snapshot) {
      return new Response(JSON.stringify({ error: "Snapshot not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create restore_run_log entry
    const { data: runRow } = await adminClient
      .from("restore_run_log")
      .insert({
        snapshot_id,
        triggered_by: user.id,
        status: "starting",
        message: "Restore requested",
      })
      .select("id")
      .single();
    restoreRunId = (runRow as any)?.id ?? null;

    // ── Pre-restore safety backup ─────────────────────────────────────────
    if (!skip_safety_backup) {
      await updateRunLog({ status: "safety_backup_in_progress", message: "Creating pre-restore safety backup" });
      const safety = await createPreRestoreSafetyBackup({
        supabaseUrl, serviceKey, adminClient,
        triggeredBy: user.id,
        snapshotIdBeingRestored: snapshot_id,
        timeoutMs: 90_000,
      });
      if (!safety.ok) {
        await updateRunLog({
          status: "failed",
          message: `Safety backup failed: ${safety.message}`,
          finished_at: new Date().toISOString(),
          pre_restore_backup_run_id: safety.runId ?? null,
        });
        return new Response(JSON.stringify({
          error: "Pre-restore safety backup failed; restore aborted",
          detail: safety.message,
          hint: "Pass skip_safety_backup:true to bypass (NOT recommended)",
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await updateRunLog({
        pre_restore_backup_run_id: safety.runId ?? null,
        pre_restore_snapshot_id: safety.snapshotId ?? null,
        status: "restore_in_progress",
        message: "Safety backup completed; starting restore",
      });
    } else {
      await updateRunLog({ status: "restore_in_progress", message: "Safety backup skipped by request" });
    }

    const bucket = "db-backups";
    const result: Record<string, number> = {};
    const errors: Array<{ table: string; error: string }> = [];

    const isV3Plus = ((snapshot.backup_version ?? 0) >= 3) ||
      (typeof snapshot.storage_path === "string" && snapshot.storage_path.endsWith("/manifest.json"));

    if (isV3Plus && snapshot.storage_path) {
      const folder = snapshot.storage_path.replace(/\/manifest\.json$/, "");
      const manifestObj = (snapshot.manifest ?? {}) as Record<string, number | { rows: number; parts: number }>;
      const entryRows = (e: number | { rows: number; parts: number } | undefined): number =>
        typeof e === "number" ? e : (e?.rows ?? 0);
      const entryParts = (e: number | { rows: number; parts: number } | undefined): number =>
        typeof e === "number" ? 1 : (e?.parts ?? 1);

      const presentTables = BACKUP_TABLES.filter((t) => manifestObj[t] !== undefined);

      const { error: trErr } = await adminClient.rpc("restore_truncate_all", {
        _tables: [...presentTables].reverse(),
      });
      if (trErr) {
        await updateRunLog({
          status: "failed",
          message: `truncate failed: ${trErr.message}`,
          finished_at: new Date().toISOString(),
        });
        return new Response(JSON.stringify({ error: `truncate: ${trErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      for (const t of BACKUP_TABLES) {
        const entry = manifestObj[t];
        if (entry === undefined) { result[t] = 0; continue; }
        const totalRows = entryRows(entry);
        const parts = entryParts(entry);
        if (totalRows === 0) { result[t] = 0; continue; }

        const paths: string[] = parts === 1
          ? [`${folder}/${t}.json`]
          : Array.from({ length: parts }, (_, i) => `${folder}/${t}__part_${String(i).padStart(3, "0")}.json`);

        let inserted = 0;
        let failed = false;
        for (const path of paths) {
          if (failed) break;
          const { data: dl, error: dlErr } = await adminClient.storage.from(bucket).download(path);
          if (dlErr) { errors.push({ table: t, error: `download ${path}: ${dlErr.message}` }); failed = true; break; }
          let rows: any[] = [];
          try { rows = JSON.parse(await dl.text()); } catch (e) {
            errors.push({ table: t, error: `parse ${path}: ${(e as Error).message}` }); failed = true; break;
          }
          for (let i = 0; i < rows.length; i += 500) {
            const batch = rows.slice(i, i + 500);
            const { data, error } = await adminClient.rpc("restore_insert_rows", { _table: t, _rows: batch });
            if (error) { errors.push({ table: t, error: error.message }); failed = true; break; }
            inserted += (data as number) ?? batch.length;
          }
        }
        result[t] = inserted;
      }

      const totalRestored = Object.values(result).reduce((a, b) => a + b, 0);
      await updateRunLog({
        status: errors.length === 0 ? "success" : "completed_with_errors",
        message: errors.length === 0
          ? `Restored ${totalRestored.toLocaleString()} rows across ${Object.keys(result).length} tables`
          : `Restored with ${errors.length} error(s)`,
        total_tables: Object.keys(result).length,
        total_rows: totalRestored,
        restored_tables: result,
        errors: errors.length ? errors : null,
        finished_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          success: errors.length === 0,
          version: snapshot.backup_version ?? 3,
          restored: result,
          errors,
          restore_run_id: restoreRunId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── v2 / v1 fallback ──────────────────────────────────────────────────
    let tables: Record<string, any[]> | null = null;
    let isLegacyV1 = false;

    if (snapshot.storage_path) {
      const { data: dl, error: dlErr } = await adminClient.storage.from(bucket).download(snapshot.storage_path);
      if (dlErr) {
        await updateRunLog({ status: "failed", message: `storage download: ${dlErr.message}`, finished_at: new Date().toISOString() });
        return new Response(JSON.stringify({ error: `storage download: ${dlErr.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = JSON.parse(await dl.text());
      tables = parsed.tables ?? null;
    }
    if (!tables) {
      if (Array.isArray(snapshot.snapshot_data)) {
        tables = { subtests: snapshot.snapshot_data as any[] };
        isLegacyV1 = true;
      } else if (snapshot.snapshot_data && typeof snapshot.snapshot_data === "object") {
        tables = snapshot.snapshot_data as Record<string, any[]>;
      }
    }
    if (!tables) {
      await updateRunLog({ status: "failed", message: "Snapshot payload missing", finished_at: new Date().toISOString() });
      return new Response(JSON.stringify({ error: "Snapshot payload missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tablesToTruncate = isLegacyV1
      ? ["subtests"]
      : BACKUP_TABLES.filter((t) => Array.isArray(tables![t]));
    const { error: trErr } = await adminClient.rpc("restore_truncate_all", { _tables: [...tablesToTruncate].reverse() });
    if (trErr) {
      await updateRunLog({ status: "failed", message: `truncate: ${trErr.message}`, finished_at: new Date().toISOString() });
      return new Response(JSON.stringify({ error: `truncate: ${trErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertOrder = isLegacyV1 ? ["subtests"] : BACKUP_TABLES;
    for (const t of insertOrder) {
      const rows = tables[t];
      if (!Array.isArray(rows) || rows.length === 0) { result[t] = 0; continue; }
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { data, error } = await adminClient.rpc("restore_insert_rows", { _table: t, _rows: batch });
        if (error) { errors.push({ table: t, error: error.message }); break; }
        inserted += (data as number) ?? batch.length;
      }
      result[t] = inserted;
    }

    const totalRestored = Object.values(result).reduce((a, b) => a + b, 0);
    await updateRunLog({
      status: errors.length === 0 ? "success" : "completed_with_errors",
      message: errors.length === 0
        ? `Restored ${totalRestored.toLocaleString()} rows (legacy v${isLegacyV1 ? 1 : 2})`
        : `Restored with ${errors.length} error(s)`,
      total_tables: Object.keys(result).length,
      total_rows: totalRestored,
      restored_tables: result,
      errors: errors.length ? errors : null,
      finished_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        legacy_v1: isLegacyV1,
        restored: result,
        errors,
        restore_run_id: restoreRunId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    await updateRunLog({
      status: "failed",
      message: `Unhandled error: ${(e as Error).message}`,
      finished_at: new Date().toISOString(),
    });
    return new Response(
      JSON.stringify({ error: (e as Error).message, restore_run_id: restoreRunId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
