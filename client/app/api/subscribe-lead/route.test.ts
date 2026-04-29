import { appendFile, mkdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServerEnv } from "@/lib/server-env";
import { POST } from "./route";

vi.mock("@/lib/server-env", () => ({
  getServerEnv: vi.fn(() => undefined),
}));

vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/subscribe-lead", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("subscribe lead route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects invalid lead details", async () => {
    const response = await POST(request({ name: "A", email: "bad", phone: "" }));

    expect(response.status).toBe(400);
    expect(appendFile).not.toHaveBeenCalled();
  });

  it("sends valid leads to the default Windmill webhook", async () => {
    const response = await POST(request({
      name: "Harsha",
      email: "HARSH@example.com",
      phone: "+91 9999999999",
      interest: "Coorg",
      timing: "This quarter",
      firstUpdate: "Blyton",
    }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://windmill.devsharsha.live/api/w/beforest-automations/jobs/run/f/u/harsha/8AtQ5flwFWeX",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("\"email\":\"harsh@example.com\""),
      }),
    );
    expect(appendFile).not.toHaveBeenCalled();
  });

  it("persists valid leads as jsonl when local fallback is configured", async () => {
    vi.mocked(getServerEnv).mockReturnValueOnce("file://local");

    const response = await POST(request({
      name: "Harsha",
      email: "HARSH@example.com",
      phone: "+91 9999999999",
      interest: "Coorg",
      timing: "This quarter",
      firstUpdate: "Blyton",
    }));

    expect(response.status).toBe(200);
    expect(mkdir).toHaveBeenCalled();
    expect(appendFile).toHaveBeenCalledWith(
      expect.stringContaining("beforest-updates.jsonl"),
      expect.stringContaining("\"email\":\"harsh@example.com\""),
      "utf8",
    );
  });
});
