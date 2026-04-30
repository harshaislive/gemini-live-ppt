import { createHash, randomBytes } from "node:crypto";
import { insertSupabaseRows } from "../lib/supabase-rest";
import { getServerEnv } from "../lib/server-env";

type Args = {
  count: number;
  baseUrl: string;
  campaign: string;
  source: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  maxUses: number;
  expiresAt: string;
};

function getArg(name: string, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
}

function getArgs(): Args {
  return {
    count: Math.max(1, Number(getArg("count", "1")) || 1),
    baseUrl: getArg("base-url", "https://beforest.co"),
    campaign: getArg("campaign", "direct"),
    source: getArg("source", "manual"),
    name: getArg("name"),
    email: getArg("email"),
    phone: getArg("phone"),
    notes: getArg("notes"),
    maxUses: Math.max(1, Number(getArg("max-uses", "20")) || 20),
    expiresAt: getArg("expires-at"),
  };
}

function hashSecret(value: string) {
  const pepper = getServerEnv("INVITE_CODE_PEPPER")?.trim()
    || getServerEnv("PRESENTATION_PASSCODE")?.trim()
    || "";
  if (!pepper) {
    throw new Error("Set INVITE_CODE_PEPPER before generating invite codes.");
  }
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

function makeToken() {
  return randomBytes(9).toString("base64url");
}

function makeCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function csv(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function main() {
  const args = getArgs();
  const tableName = getServerEnv("SUPABASE_INVITES_TABLE")?.trim() || "beforest_invites";
  const rows: Record<string, unknown>[] = [];
  const output: string[][] = [[
    "invite_url",
    "passcode",
    "invitee_name",
    "invitee_email",
    "invitee_phone",
    "campaign",
    "source",
  ]];

  for (let index = 0; index < args.count; index += 1) {
    const token = makeToken();
    const code = makeCode();
    const inviteUrl = `${args.baseUrl.replace(/\/+$/, "")}/?invite=${encodeURIComponent(token)}`;
    rows.push({
      token_hash: hashSecret(token),
      token_last4: token.slice(-4),
      code_hash: hashSecret(code),
      code_last4: code.slice(-4),
      invitee_name: args.name,
      invitee_email: args.email.toLowerCase(),
      invitee_phone: args.phone,
      campaign: args.campaign,
      source: args.source,
      notes: args.notes,
      max_uses: args.maxUses,
      expires_at: args.expiresAt || null,
    });
    output.push([
      inviteUrl,
      code,
      args.name,
      args.email.toLowerCase(),
      args.phone,
      args.campaign,
      args.source,
    ]);
  }

  await insertSupabaseRows(tableName, rows);
  console.log(output.map((line) => line.map(csv).join(",")).join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

