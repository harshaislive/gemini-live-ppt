"use client";

import { Check, Copy, Link2, RotateCcw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { parseInviteCreatorConfig } from "@/lib/invite-creator-config";

type CreatedInvite = {
  passcode: string;
  inviteUrl: string;
  expiresAt: string;
  maxUses: number;
};

const EMPTY_FORM = { inviteeName: "", inviteeEmail: "", inviteePhone: "" };

function getDefaultExpiryDate(expiryDays = 14) {
  const date = new Date();
  date.setDate(date.getDate() + expiryDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEndOfLocalDayIso(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

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
  const [maxUses, setMaxUses] = useState(5);
  const [expiryDate, setExpiryDate] = useState(() => getDefaultExpiryDate());
  const [campaign, setCampaign] = useState("sales");
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
    setMaxUses(parsedConfig.maxUses);
    setExpiryDate(getDefaultExpiryDate(parsedConfig.expiryDays));
    setCampaign(parsedConfig.campaign);

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
          maxUses,
          expiresAt: getEndOfLocalDayIso(expiryDate),
          campaign,
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

        {!createdInvite ? (
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

            <div className="invite-creator-settings-row" aria-label="Invite settings">
              <label>
                Expiry date
                <input
                  required
                  type="date"
                  value={expiryDate}
                  min={getDefaultExpiryDate(1)}
                  onChange={(event) => setExpiryDate(event.target.value)}
                />
              </label>
              <label>
                Allowed opens
                <input
                  required
                  type="number"
                  min="1"
                  max="50"
                  value={maxUses}
                  onChange={(event) => setMaxUses(Number(event.target.value))}
                />
              </label>
              <label>
                Campaign
                <input
                  required
                  value={campaign}
                  onChange={(event) => setCampaign(event.target.value)}
                  placeholder="sales"
                />
              </label>
            </div>

            {error ? <p className="invite-creator-error" role="alert">{error}</p> : null}
            <button className="invite-creator-primary" type="submit" disabled={isCreating}>
              <Link2 size={18} aria-hidden="true" />
              {isCreating ? "Creating invite…" : "Create invite link"}
            </button>
          </form>
        ) : null}

        {createdInvite ? (
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
