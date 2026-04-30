import { createHash } from "node:crypto";
import { getServerEnv } from "./server-env";
import { selectSupabaseRows, updateSupabaseRows } from "./supabase-rest";

export type InviteIdentity = {
  inviteId: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string;
  campaign: string;
  source: string;
};

type InviteRow = {
  id: string;
  invitee_name: string | null;
  invitee_email: string | null;
  invitee_phone: string | null;
  campaign: string | null;
  source: string | null;
  max_uses: number | null;
  used_count: number | null;
  expires_at: string | null;
  disabled_at: string | null;
};

const DEFAULT_INVITES_TABLE = "beforest_invites";

function getInvitesTable() {
  return getServerEnv("SUPABASE_INVITES_TABLE")?.trim() || DEFAULT_INVITES_TABLE;
}

function getInvitePepper() {
  return getServerEnv("INVITE_CODE_PEPPER")?.trim()
    || getServerEnv("PRESENTATION_PASSCODE")?.trim()
    || "";
}

function hashInviteSecret(value: string) {
  const pepper = getInvitePepper();
  if (!pepper) {
    return "";
  }
  return createHash("sha256").update(`${pepper}:${value.trim()}`).digest("hex");
}

function toInviteIdentity(row: InviteRow): InviteIdentity {
  return {
    inviteId: row.id,
    inviteeName: row.invitee_name || "",
    inviteeEmail: row.invitee_email || "",
    inviteePhone: row.invitee_phone || "",
    campaign: row.campaign || "",
    source: row.source || "",
  };
}

function isInviteUsable(row: InviteRow) {
  if (row.disabled_at) {
    return false;
  }
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return false;
  }
  if (row.max_uses !== null && row.max_uses > 0 && (row.used_count || 0) >= row.max_uses) {
    return false;
  }
  return true;
}

export function getInviteCookieValue(invite: InviteIdentity) {
  return Buffer.from(JSON.stringify(invite)).toString("base64url");
}

export function parseInviteCookieValue(value?: string) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<InviteIdentity>;
    if (!parsed.inviteId) {
      return null;
    }
    return {
      inviteId: String(parsed.inviteId),
      inviteeName: String(parsed.inviteeName || ""),
      inviteeEmail: String(parsed.inviteeEmail || ""),
      inviteePhone: String(parsed.inviteePhone || ""),
      campaign: String(parsed.campaign || ""),
      source: String(parsed.source || ""),
    };
  } catch {
    return null;
  }
}

export async function findInviteByToken(token: string) {
  const hash = hashInviteSecret(token);
  if (!hash) {
    return null;
  }

  const rows = await selectSupabaseRows<InviteRow>(
    getInvitesTable(),
    `select=id,invitee_name,invitee_email,invitee_phone,campaign,source,max_uses,used_count,expires_at,disabled_at&token_hash=eq.${encodeURIComponent(hash)}&limit=1`,
  );
  const row = rows[0];
  if (!row || !isInviteUsable(row)) {
    return null;
  }
  return toInviteIdentity(row);
}

export async function findInviteByPasscode(passcode: string) {
  const hash = hashInviteSecret(passcode);
  if (!hash) {
    return null;
  }

  const rows = await selectSupabaseRows<InviteRow>(
    getInvitesTable(),
    `select=id,invitee_name,invitee_email,invitee_phone,campaign,source,max_uses,used_count,expires_at,disabled_at&code_hash=eq.${encodeURIComponent(hash)}&limit=1`,
  );
  const row = rows[0];
  if (!row || !isInviteUsable(row)) {
    return null;
  }
  return toInviteIdentity(row);
}

export async function markInviteUsed(invite: InviteIdentity) {
  try {
    const rows = await selectSupabaseRows<{ used_count: number | null }>(
      getInvitesTable(),
      `select=used_count&id=eq.${encodeURIComponent(invite.inviteId)}&limit=1`,
    );
    await updateSupabaseRows(
      getInvitesTable(),
      `id=eq.${encodeURIComponent(invite.inviteId)}`,
      {
        used_count: (rows[0]?.used_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error("Failed to mark invite as used", error);
  }
}

