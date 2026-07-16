"use client";

import { Check, Copy, Link2, RotateCcw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { parseInviteCreatorConfig, type InviteCreatorConfig } from "@/lib/invite-creator-config";

type CreatedInvite = {
  passcode: string;
  inviteUrl: string;
  expiresAt: string;
  maxUses: number;
};

type AuthorizationState = "checking" | "authorized" | "unauthorized";

const EMPTY_FORM = { inviteeName: "", inviteeEmail: "", inviteePhone: "" };

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("Copy is unavailable in this browser.");
    }
  }
}

export function InviteCreator() {
  const [authorization, setAuthorization] = useState<AuthorizationState>("checking");
  const [config, setConfig] = useState<InviteCreatorConfig>({ maxUses: 5, expiryDays: 14, campaign: "sales" });
  const [form, setForm] = useState(EMPTY_FORM);
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsedConfig = parseInviteCreatorConfig({
      uses: params.get("uses"),
      expires: params.get("expires"),
      campaign: params.get("campaign"),
    });
    setConfig(parsedConfig);

    const key = params.get("key")?.trim() || "";
    fetch("/api/invites/creator-session", key ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    } : { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.authorized) {
          throw new Error(String(data.error || "Open the private sales invite link to use this page."));
        }
        if (key) {
          params.delete("key");
          const cleanQuery = params.toString();
          window.history.replaceState({}, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`);
        }
        setAuthorization("authorized");
      })
      .catch((sessionError) => {
        setAuthorization("unauthorized");
        setError(sessionError instanceof Error ? sessionError.message : "This creator link is not valid.");
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/invites/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          maxUses: config.maxUses,
          expiryDays: config.expiryDays,
          campaign: config.campaign,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data.error || "Could not create the invite."));
      }
      setCreatedInvite(data as CreatedInvite);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the invite.");
    } finally {
      setIsCreating(false);
    }
  }

  async function copyInvite() {
    if (!createdInvite) {
      return;
    }
    try {
      await copyText(createdInvite.inviteUrl);
      setCopied(true);
      setError("");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Select and copy the link manually.");
    }
  }

  function createAnother() {
    setForm(EMPTY_FORM);
    setCreatedInvite(null);
    setCopied(false);
    setError("");
  }

  return (
    <main className="invite-creator-shell">
      <div className="invite-creator-noise" aria-hidden="true" />
      <section className="invite-creator-panel" aria-labelledby="invite-creator-title">
        <header className="invite-creator-header">
          <div className="invite-creator-brand">Beforest 10%</div>
          <p>Sales invite generator</p>
        </header>

        <div className="invite-creator-intro">
          <h1 id="invite-creator-title">Create a personal walkthrough link.</h1>
          <p>Enter the recipient details. Their passcode and ready-to-send link will be generated instantly.</p>
        </div>

        {authorization === "checking" ? (
          <p className="invite-creator-status" role="status">Opening the invite generator…</p>
        ) : null}

        {authorization === "unauthorized" ? (
          <p className="invite-creator-error" role="alert">{error}</p>
        ) : null}

        {authorization === "authorized" && !createdInvite ? (
          <form className="invite-creator-form" onSubmit={handleSubmit}>
            <label>
              Recipient name
              <input
                required
                autoFocus
                autoComplete="name"
                value={form.inviteeName}
                onChange={(event) => setForm((current) => ({ ...current, inviteeName: event.target.value }))}
                placeholder="Full name"
              />
            </label>
            <div className="invite-creator-field-row">
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={form.inviteeEmail}
                  onChange={(event) => setForm((current) => ({ ...current, inviteeEmail: event.target.value }))}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  autoComplete="tel"
                  value={form.inviteePhone}
                  onChange={(event) => setForm((current) => ({ ...current, inviteePhone: event.target.value }))}
                  placeholder="+91"
                />
              </label>
            </div>

            <div className="invite-creator-policy" aria-label="Invite settings">
              <span>{config.maxUses} opens</span>
              <span>Expires in {config.expiryDays} days</span>
              <span>{config.campaign}</span>
            </div>

            {error ? <p className="invite-creator-error" role="alert">{error}</p> : null}
            <button className="invite-creator-primary" type="submit" disabled={isCreating}>
              <Link2 size={18} aria-hidden="true" />
              {isCreating ? "Creating invite…" : "Create invite link"}
            </button>
          </form>
        ) : null}

        {authorization === "authorized" && createdInvite ? (
          <div className="invite-creator-result" aria-live="polite">
            <div className="invite-creator-success-icon" aria-hidden="true"><Check size={22} /></div>
            <div>
              <h2>Invite ready</h2>
              <p>The link includes passcode <strong>{createdInvite.passcode}</strong> and expires on {new Date(createdInvite.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.</p>
            </div>
            <div className="invite-creator-link">
              <span>{createdInvite.inviteUrl}</span>
              <button type="button" onClick={copyInvite} aria-label="Copy invite link">
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            {error ? <p className="invite-creator-error invite-creator-result-error" role="alert">{error}</p> : null}
            <button className="invite-creator-secondary" type="button" onClick={createAnother}>
              <RotateCcw size={17} aria-hidden="true" />
              Create another
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
