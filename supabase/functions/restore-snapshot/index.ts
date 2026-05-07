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

    // v3: storage_path points to manifest.json in folder; per-table files alongside
    const isV3 = (snapshot.backup_version === 3) ||
      (typeof snapshot.storage_path === "string" && snapshot.storage_path.endsWith("/manifest.json"));

    if (isV3 && snapshot.storage_path) {
      const folder = snapshot.storage_path.replace(/\/manifest\.json$/, "");
      const manifestObj = (snapshot.manifest ?? {}) as Record<string, number>;
      const presentTables = BACKUP_TABLES.filter((t) => (manifestObj[t] ?? 0) >= 0);

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
        if ((manifestObj[t] ?? 0) === 0) { result[t] = 0; continue; }
        const path = `${folder}/${t}.json`;
        const { data: dl, error: dlErr } = await adminClient.storage.from(bucket).download(path);
        if (dlErr) { errors.push({ table: t, error: `download: ${dlErr.message}` }); continue; }
        let rows: any[] = [];
        try { rows = JSON.parse(await dl.text()); } catch (e) {
          errors.push({ table: t, error: `parse: ${(e as Error).message}` }); continue;
        }
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
        JSON.stringify({ success: errors.length === 0, version: 3, restored: result, errors }),
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
