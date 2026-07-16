export type InviteCreatorConfig = {
  maxUses: number;
  expiryDays: number;
  campaign: string;
};

function boundedInteger(value: string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function parseInviteCreatorConfig(params: {
  uses?: string | null;
  expires?: string | null;
  campaign?: string | null;
}): InviteCreatorConfig {
  const expiryText = params.expires?.trim().toLowerCase() || "";
  const expiryDays = boundedInteger(expiryText.replace(/d$/, ""), 14, 1, 365);
  const campaign = (params.campaign || "sales")
    .trim()
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .slice(0, 80) || "sales";

  return {
    maxUses: boundedInteger(params.uses, 5, 1, 50),
    expiryDays,
    campaign,
  };
}
