import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BACKUP_TABLES } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await adminClient.rpc("is_admin_or_superuser", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { snapshot_id } = await req.json();
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

    const bucket = "db-backups";
    const result: Record<string, number> = {};
    const errors: Array<{ table: string; error: string }> = [];

    // v3/v4: storage_path points to manifest.json in folder; per-table files alongside.
    // v4 may store manifest entries as { rows, parts } and split tables into part files.
    const isV3Plus = ((snapshot.backup_version ?? 0) >= 3) ||
      (typeof snapshot.storage_path === "string" && snapshot.storage_path.endsWith("/manifest.json"));

    if (isV3Plus && snapshot.storage_path) {
      const folder = snapshot.storage_path.replace(/\/manifest\.json$/, "");
      const manifestObj = (snapshot.manifest ?? {}) as Record<string, number | { rows: number; parts: number }>;
      const entryRows = (e: number | { rows: number; parts: number } | undefined): number =>
        typeof e === "number" ? e : (e?.rows ?? 0);
      const entryParts = (e: number | { rows: number; parts: number } | undefined): number =>
        typeof e === "number" ? 1 : (e?.parts ?? 1);

      const presentTables = BACKUP_TABLES.filter((t) => entryRows(manifestObj[t]) >= 0 && (manifestObj[t] !== undefined));

      // Truncate all (reverse for child-first safety)
      const { error: trErr } = await adminClient.rpc("restore_truncate_all", {
        _tables: [...presentTables].reverse(),
      });
      if (trErr) {
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

        // Build list of file paths to download in order.
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

      return new Response(
        JSON.stringify({ success: errors.length === 0, version: snapshot.backup_version ?? 3, restored: result, errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // v2 / v1 fallback (single JSON or legacy subtests-only)
    let tables: Record<string, any[]> | null = null;
    let isLegacyV1 = false;

    if (snapshot.storage_path) {
      const { data: dl, error: dlErr } = await adminClient.storage.from(bucket).download(snapshot.storage_path);
      if (dlErr) {
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
      return new Response(JSON.stringify({ error: "Snapshot payload missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tablesToTruncate = isLegacyV1
      ? ["subtests"]
      : BACKUP_TABLES.filter((t) => Array.isArray(tables![t]));
    const { error: trErr } = await adminClient.rpc("restore_truncate_all", { _tables: [...tablesToTruncate].reverse() });
    if (trErr) {
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

    return new Response(
      JSON.stringify({ success: errors.length === 0, legacy_v1: isLegacyV1, restored: result, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
