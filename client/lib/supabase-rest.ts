import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/server-env";

type SupabaseInsertResult = {
  captured: boolean;
  fallback: boolean;
  target: "supabase" | "local" | "none";
};

function cleanSupabaseUrl(url: string) {
  return url.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

function getSupabaseConfig() {
  const url = getServerEnv("SUPABASE_URL")?.trim() || getServerEnv("NEXT_PUBLIC_SUPABASE_URL")?.trim() || "";
  const key = getServerEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || getServerEnv("SUPABASE_SERVICE_KEY")?.trim()
    || getServerEnv("SUPABASE_ANON_KEY")?.trim()
    || getServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")?.trim()
    || "";
  const schema = getServerEnv("SUPABASE_SCHEMA")?.trim() || "public";

  if (!url || !key) {
    return null;
  }

  return {
    url: cleanSupabaseUrl(url),
    key,
    schema,
  };
}

export async function appendJsonlFallback(filename: string, event: unknown) {
  const dir = path.resolve(process.cwd(), ".leads");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, filename), `${JSON.stringify(event)}\n`, "utf8");
}

export async function insertSupabaseRows(
  tableName: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
): Promise<SupabaseInsertResult> {
  const config = getSupabaseConfig();
  if (!config || !tableName.trim()) {
    return { captured: false, fallback: false, target: "none" };
  }

  const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(tableName.trim())}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Accept-Profile": config.schema,
      "Content-Type": "application/json",
      "Content-Profile": config.schema,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Supabase insert failed for ${tableName}: ${response.status} ${errorText}`);
  }

  return { captured: true, fallback: false, target: "supabase" };
}

export async function selectSupabaseRows<T>(
  tableName: string,
  query: string,
): Promise<T[]> {
  const config = getSupabaseConfig();
  if (!config || !tableName.trim()) {
    return [];
  }

  const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(tableName.trim())}?${query}`, {
    method: "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Accept-Profile": config.schema,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Supabase select failed for ${tableName}: ${response.status} ${errorText}`);
  }

  return await response.json() as T[];
}

export async function updateSupabaseRows(
  tableName: string,
  query: string,
  row: Record<string, unknown>,
): Promise<SupabaseInsertResult> {
  const config = getSupabaseConfig();
  if (!config || !tableName.trim()) {
    return { captured: false, fallback: false, target: "none" };
  }

  const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(tableName.trim())}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Accept-Profile": config.schema,
      "Content-Type": "application/json",
      "Content-Profile": config.schema,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Supabase update failed for ${tableName}: ${response.status} ${errorText}`);
  }

  return { captured: true, fallback: false, target: "supabase" };
}
